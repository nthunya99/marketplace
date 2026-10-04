import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { checkoutWithExtrasSchema } from "@/lib/validators";
import { handleApiError, BusinessError, generateOrderNumber } from "@/lib/api-utils";
import { resolveCommissionPercent, calculateCommission } from "@/lib/commission";
import { notify } from "@/lib/notifications";
import { validateAndPriceCoupon, type EligibleLine } from "@/lib/coupons";
import { priceLoyaltyRedemption, redeemLoyaltyPoints } from "@/lib/loyalty";
import { availablePaymentMethods } from "@/lib/vendor-payment-methods";
import { scoreOrderForFraud } from "@/lib/fraud";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * POST /api/checkout — the critical business flow (spec section 38):
 *
 *   cart (possibly multiple vendors)
 *     -> validate stock & re-price server-side (never trust client prices)
 *     -> check every vendor in the cart can actually take payment
 *     -> apply an optional coupon and/or loyalty point redemption
 *     -> create parent Order
 *     -> split into one VendorOrder per vendor
 *     -> decrement inventory
 *     -> calculate commission per vendor order
 *
 * Checkout no longer takes a payment method. Every vendor order is created
 * PENDING with paymentMethod "unselected"; on the order page the customer
 * picks how to pay each seller from the methods that seller offers (their
 * registration choice: offline + proof, or their own merchant API) — see
 * POST /api/vendor-orders/[id]/payment-method. Wallet/commission effects
 * and loyalty points happen when each payment is confirmed, exactly as
 * before for manual, M-Pesa and MoPay. Fraud scoring runs here, at order
 * placement: it only feeds the admin review queue and never blocks.
 *
 * Everything happens inside one DB transaction, so the marketplace can
 * never end up with an order that has no matching stock decrement or
 * commission record. A client can never manipulate price, stock,
 * commission, coupon discount, or loyalty value (spec section 25).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("CUSTOMER");
    const { shippingAddressId, couponCode, redeemPoints } = checkoutWithExtrasSchema.parse(
      await req.json().catch(() => ({}))
    );

    if (shippingAddressId) {
      const addr = await prisma.address.findUnique({ where: { id: shippingAddressId } });
      if (!addr || addr.userId !== user.id) {
        throw new BusinessError("Shipping address not found.");
      }
    }

    const cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      include: {
        items: {
          include: {
            product: { include: { vendor: true } },
            variant: true,
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BusinessError("Your cart is empty.");
    }

    // ---- Re-validate & re-price every line server-side ----
    for (const item of cart.items) {
      if (item.product.status !== "PUBLISHED") {
        throw new BusinessError(`"${item.product.name}" is no longer available.`);
      }
      if (item.product.vendor.status !== "APPROVED") {
        throw new BusinessError(`"${item.product.name}" is currently unavailable.`);
      }
      const availableStock = item.variant ? item.variant.stockQuantity : item.product.stockQuantity;
      if (item.quantity > availableStock) {
        throw new BusinessError(
          `Only ${availableStock} unit(s) of "${item.product.name}" are in stock.`
        );
      }
      if (availablePaymentMethods(item.product.vendor).length === 0) {
        throw new BusinessError(
          `"${item.product.vendor.storeName}" isn't taking payments right now, so their items can't be ordered. Please remove them from your cart to continue.`
        );
      }
    }

    // Group cart items by vendor.
    const byVendor = new Map<string, typeof cart.items>();
    for (const item of cart.items) {
      const list = byVendor.get(item.product.vendorId) ?? [];
      list.push(item);
      byVendor.set(item.product.vendorId, list);
    }

    const result = await prisma.$transaction(async (tx) => {
      let orderSubtotal = new Decimal(0);

      const vendorOrderInputs: {
        vendorId: string;
        subtotal: Decimal;
        items: {
          productId: string;
          variantId: string | null;
          productNameSnapshot: string;
          skuSnapshot: string;
          unitPriceSnapshot: Decimal;
          quantity: number;
          lineTotal: Decimal;
        }[];
      }[] = [];
      const eligibleLines: EligibleLine[] = [];

      for (const [vendorId, items] of byVendor) {
        let vendorSubtotal = new Decimal(0);
        const orderItemsData = [];

        for (const item of items) {
          // Server-authoritative price — the client never supplies this.
          const unitPrice = item.variant
            ? item.variant.price
            : item.product.discountPrice ?? item.product.price;
          const lineTotal = new Decimal(unitPrice).mul(item.quantity);
          vendorSubtotal = vendorSubtotal.add(lineTotal);

          orderItemsData.push({
            productId: item.productId,
            variantId: item.variantId,
            productNameSnapshot: item.product.name,
            skuSnapshot: item.variant?.sku ?? item.product.sku,
            unitPriceSnapshot: unitPrice,
            quantity: item.quantity,
            lineTotal,
          });

          eligibleLines.push({
            vendorId,
            categoryId: item.product.categoryId,
            productId: item.productId,
            lineTotal,
          });

          // Atomic, race-safe stock decrement guarded by a WHERE clause —
          // if concurrent checkouts race for the last unit, this throws
          // and the whole transaction rolls back rather than overselling.
          if (item.variantId) {
            const res = await tx.productVariant.updateMany({
              where: { id: item.variantId, stockQuantity: { gte: item.quantity } },
              data: { stockQuantity: { decrement: item.quantity } },
            });
            if (res.count === 0) {
              throw new BusinessError(
                `"${item.product.name}" just went out of stock. Please update your cart.`
              );
            }
          } else {
            const res = await tx.product.updateMany({
              where: { id: item.productId, stockQuantity: { gte: item.quantity } },
              data: { stockQuantity: { decrement: item.quantity } },
            });
            if (res.count === 0) {
              throw new BusinessError(
                `"${item.product.name}" just went out of stock. Please update your cart.`
              );
            }
          }
        }

        orderSubtotal = orderSubtotal.add(vendorSubtotal);
        vendorOrderInputs.push({ vendorId, subtotal: vendorSubtotal, items: orderItemsData });
      }

      // Shipping cost isn't charged yet — the courier/delivery system is
      // still being built (see src/lib/courier), so every order is
      // priced at $0 shipping for now rather than quoting a cost nothing
      // can actually fulfill. shippingTotal/shippingCost stay on the
      // schema so switching this back on later is a pricing change, not
      // a data-model change.
      const shippingTotal = new Decimal(0);

      // Tax is a flat-zero placeholder (tax jurisdictions are a Phase 4
      // feature per the spec's own phasing) — the field exists on Order
      // and is wired through so adding real rate calculation later
      // doesn't change this flow.
      const taxTotal = new Decimal(0);

      // Coupon (spec section 18) — validated fresh against live DB state
      // (usage limits, expiry, active flag can all change between the
      // customer typing a code and actually paying).
      let couponDiscount = new Decimal(0);
      let appliedCoupon = null;
      if (couponCode) {
        const couponResult = await validateAndPriceCoupon(tx, couponCode, user.id, eligibleLines);
        appliedCoupon = couponResult.coupon;
        couponDiscount = couponResult.discountAmount;
      }

      // Loyalty point redemption (spec section 23) — capped so the order
      // can never go negative; applied after the coupon discount.
      const remainingAfterCoupon = orderSubtotal.add(shippingTotal).sub(couponDiscount);
      const loyaltyResult = await priceLoyaltyRedemption(
        tx,
        user.id,
        redeemPoints ?? 0,
        Decimal.max(remainingAfterCoupon, new Decimal(0))
      );

      const discountTotal = couponDiscount.add(loyaltyResult.discount);
      const grandTotal = Decimal.max(
        orderSubtotal.add(shippingTotal).add(taxTotal).sub(discountTotal),
        new Decimal(0)
      );

      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId: user.id,
          shippingAddressId: shippingAddressId ?? null,
          subtotal: orderSubtotal,
          shippingTotal,
          taxTotal,
          discountTotal,
          couponCode: appliedCoupon?.code,
          loyaltyPointsRedeemed: loyaltyResult.pointsToRedeem,
          grandTotal,
          status: "PENDING",
        },
      });

      const vendorOrders = [];
      for (const vo of vendorOrderInputs) {
        const vendor = await tx.vendorProfile.findUniqueOrThrow({ where: { id: vo.vendorId } });
        const commissionPercent = await resolveCommissionPercent(tx, vendor);
        const { commissionAmount, vendorEarnings } = calculateCommission(vo.subtotal, commissionPercent);

        const vendorOrder = await tx.vendorOrder.create({
          data: {
            orderId: order.id,
            vendorId: vo.vendorId,
            subtotal: vo.subtotal,
            commissionPercent,
            commissionAmount,
            vendorEarnings,
            shippingCost: new Decimal(0),
            status: "PENDING",
            paymentMethod: "unselected",
            items: { create: vo.items },
          },
        });
        vendorOrders.push(vendorOrder);
      }

      // Coupon usage and any point spend are locked in the moment the
      // order is placed, regardless of payment method — placing an order
      // with a code consumes it even before payment completes, same as
      // most checkout flows.
      if (appliedCoupon) {
        await tx.couponRedemption.create({
          data: { couponId: appliedCoupon.id, userId: user.id, orderId: order.id, amount: couponDiscount },
        });
        await tx.coupon.update({ where: { id: appliedCoupon.id }, data: { usageCount: { increment: 1 } } });
      }
      if (loyaltyResult.pointsToRedeem > 0) {
        await redeemLoyaltyPoints(tx, user.id, loyaltyResult.pointsToRedeem, order.id);
      }

      // Nothing is paid at checkout. The order-level Payment row tracks the
      // whole order's payment state; each seller is paid separately
      // ("direct") and the row flips to CONFIRMED once every vendor order
      // has been paid (see confirmDirectVendorOrderPayment and the proof
      // confirm route).
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          provider: "direct",
          amount: grandTotal,
          currency: process.env.PLATFORM_CURRENCY ?? "LSL",
          status: "INITIATED",
        },
      });

      // Rule-based fraud scoring (spec section 25/37) — purely for the
      // admin review queue; it never blocks the order.
      const customerRecord = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const fraudResult = await scoreOrderForFraud(tx, {
        userId: user.id,
        userCreatedAt: customerRecord.createdAt,
        orderTotal: grandTotal,
      });
      const settings = await tx.platformSettings.findUnique({ where: { id: "singleton" } });
      if (fraudResult.score >= (settings?.fraudReviewThreshold ?? 50)) {
        await tx.fraudFlag.create({
          data: { orderId: order.id, score: fraudResult.score, reasons: fraudResult.reasons },
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      const sellerCount = vendorOrders.length;
      await notify(tx, {
        userId: user.id,
        type: "ORDER_STATUS",
        title: "Order placed — choose how to pay",
        message: `Your order ${order.orderNumber} has been placed. Open it to choose how to pay ${
          sellerCount > 1 ? `each of the ${sellerCount} sellers` : "the seller"
        }.`,
        linkUrl: `/orders/${order.id}`,
      });
      for (const vendorOrder of vendorOrders) {
        const vendor = await tx.vendorProfile.findUniqueOrThrow({ where: { id: vendorOrder.vendorId } });
        await notify(tx, {
          userId: vendor.userId,
          type: "ORDER_STATUS",
          title: "New order awaiting payment",
          message: `You have a new order (${order.orderNumber}) worth ${vendorOrder.subtotal}. It's waiting for the customer to pay you.`,
          linkUrl: "/vendor/orders",
        });
      }

      return { order, payment };
    }, { timeout: 15000 });

    return NextResponse.json(
      {
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        grandTotal: result.order.grandTotal.toString(),
        paymentStatus: result.payment.status,
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
