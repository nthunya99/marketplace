import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { checkoutWithExtrasSchema } from "@/lib/validators";
import { handleApiError, BusinessError, generateOrderNumber } from "@/lib/api-utils";
import { resolveCommissionPercent, calculateCommission } from "@/lib/commission";
import { getPaymentProvider } from "@/lib/payment";
import { notify } from "@/lib/notifications";
import { validateAndPriceCoupon, type EligibleLine } from "@/lib/coupons";
import { priceLoyaltyRedemption, earnLoyaltyPoints, redeemLoyaltyPoints } from "@/lib/loyalty";
import { scoreOrderForFraud } from "@/lib/fraud";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * POST /api/checkout — the critical business flow (spec section 38):
 *
 *   cart (possibly multiple vendors)
 *     -> validate stock & re-price server-side (never trust client prices)
 *     -> apply an optional coupon and/or loyalty point redemption
 *     -> create parent Order
 *     -> split into one VendorOrder per vendor
 *     -> decrement inventory
 *     -> calculate commission per vendor order (on the pre-discount
 *        subtotal — see the Coupon model's doc comment on who funds a
 *        coupon's discount)
 *     -> charge payment for the discounted total
 *     -> on success: credit vendor pending balances, award loyalty points
 *        on the amount actually paid, mark order CONFIRMED
 *     -> on failure: roll back everything (order left in a FAILED payment
 *        state with stock un-decremented, coupon usage not recorded)
 *
 * Everything from "create parent Order" through "decrement inventory" and
 * "calculate commission" happens inside a single DB transaction so the
 * marketplace can never end up with an order that has no matching stock
 * decrement, or a vendor order with no commission record. The payment
 * charge itself happens inside the same transaction call using the
 * already-computed, server-trusted total — so a client can never
 * manipulate price, stock, commission, coupon discount, or loyalty value
 * (spec section 25).
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
    }

    // Group cart items by vendor.
    const byVendor = new Map<string, typeof cart.items>();
    for (const item of cart.items) {
      const list = byVendor.get(item.product.vendorId) ?? [];
      list.push(item);
      byVendor.set(item.product.vendorId, list);
    }

    const paymentProvider = getPaymentProvider();

    // NOTE on production hardening: this wraps the payment gateway call
    // inside the DB transaction so stock/commission/payment always land
    // atomically together (simplest correct option for Phase 1, and the
    // mock provider is effectively instant). For a real gateway with
    // higher latency, split this into (1) reserve stock + create order in
    // PENDING, (2) call the gateway outside any transaction, (3) a short
    // follow-up transaction that confirms or releases the reservation
    // based on the gateway result/webhook — the interface in
    // src/lib/payment stays the same either way.
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

      // Shipping: look up each vendor's default active method before
      // creating the order, so the order's shippingTotal is correct from
      // the start.
      const shippingByVendor = new Map<string, { id: string; cost: Decimal } | null>();
      for (const vo of vendorOrderInputs) {
        const method = await tx.shippingMethod.findFirst({
          where: { vendorId: vo.vendorId, isActive: true, isDefault: true },
        });
        shippingByVendor.set(vo.vendorId, method ? { id: method.id, cost: method.cost } : null);
      }
      const shippingTotal = Array.from(shippingByVendor.values()).reduce(
        (sum, m) => sum.add(m?.cost ?? new Decimal(0)),
        new Decimal(0)
      );

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
        const shipping = shippingByVendor.get(vo.vendorId);

        const vendorOrder = await tx.vendorOrder.create({
          data: {
            orderId: order.id,
            vendorId: vo.vendorId,
            subtotal: vo.subtotal,
            commissionPercent,
            commissionAmount,
            vendorEarnings,
            shippingMethodId: shipping?.id,
            shippingCost: shipping?.cost ?? new Decimal(0),
            status: "PENDING",
            items: { create: vo.items },
          },
        });
        vendorOrders.push(vendorOrder);
      }

      // ---- Payment ----
      const chargeResult = await paymentProvider.charge({
        orderId: order.id,
        amount: Number(grandTotal),
        currency: process.env.PLATFORM_CURRENCY ?? "LSL",
        customerEmail: user.email,
      });

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          provider: paymentProvider.name,
          providerRef: chargeResult.providerRef,
          amount: grandTotal,
          currency: process.env.PLATFORM_CURRENCY ?? "LSL",
          status: chargeResult.status,
          transactions: {
            create: {
              type: "charge",
              amount: grandTotal,
              status: chargeResult.status,
              metaJson: { providerRef: chargeResult.providerRef },
            },
          },
        },
      });

      if (!chargeResult.success) {
        // Rolling back the whole transaction (including stock decrements
        // and vendor order creation) is exactly right here: a failed
        // charge means this purchase never happened.
        throw new BusinessError(
          chargeResult.failureReason ?? "Payment failed. Your card was not charged."
        );
      }

      // Payment succeeded: confirm the order and credit each vendor's
      // *pending* balance (funds become "available" only once the order
      // is delivered — spec section 10 — that transition is handled by
      // the order-status-update route).
      await tx.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });
      for (const vendorOrder of vendorOrders) {
        await tx.vendorOrder.update({ where: { id: vendorOrder.id }, data: { status: "CONFIRMED" } });
        await tx.vendorWallet.upsert({
          where: { vendorId: vendorOrder.vendorId },
          update: {
            pendingBalance: { increment: vendorOrder.vendorEarnings },
            totalEarnings: { increment: vendorOrder.vendorEarnings },
            totalCommission: { increment: vendorOrder.commissionAmount },
          },
          create: {
            vendorId: vendorOrder.vendorId,
            pendingBalance: vendorOrder.vendorEarnings,
            totalEarnings: vendorOrder.vendorEarnings,
            totalCommission: vendorOrder.commissionAmount,
          },
        });
      }

      // Record the coupon redemption (and bump its usage counter) only
      // once payment has actually succeeded.
      if (appliedCoupon) {
        await tx.couponRedemption.create({
          data: { couponId: appliedCoupon.id, userId: user.id, orderId: order.id, amount: couponDiscount },
        });
        await tx.coupon.update({ where: { id: appliedCoupon.id }, data: { usageCount: { increment: 1 } } });
      }

      // Loyalty: redeem any points spent, then award points earned on the
      // amount actually paid (spec section 23).
      if (loyaltyResult.pointsToRedeem > 0) {
        await redeemLoyaltyPoints(tx, user.id, loyaltyResult.pointsToRedeem, order.id);
      }
      const pointsEarned = await earnLoyaltyPoints(tx, user.id, grandTotal, order.id);
      if (pointsEarned > 0) {
        await tx.order.update({ where: { id: order.id }, data: { loyaltyPointsEarned: pointsEarned } });
      }

      // Rule-based fraud scoring (spec section 25/37) — runs after
      // payment succeeds, purely for the admin review queue; it never
      // blocks or reverses an already-successful purchase.
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

      // Empty the cart now that checkout succeeded.
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      // Notify the customer and every involved vendor (spec section 17).
      await notify(tx, {
        userId: user.id,
        type: "ORDER_STATUS",
        title: "Order placed",
        message: `Your order ${order.orderNumber} has been placed and payment confirmed.`,
        linkUrl: `/orders/${order.id}`,
      });
      for (const vendorOrder of vendorOrders) {
        const vendor = await tx.vendorProfile.findUniqueOrThrow({ where: { id: vendorOrder.vendorId } });
        await notify(tx, {
          userId: vendor.userId,
          type: "ORDER_STATUS",
          title: "New order received",
          message: `You have a new order (${order.orderNumber}) worth ${vendorOrder.subtotal}.`,
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
