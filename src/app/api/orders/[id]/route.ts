import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { availablePaymentMethods, VENDOR_PAYMENT_SELECT } from "@/lib/vendor-payment-methods";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        shippingAddress: true,
        payment: true,
        vendorOrders: {
          include: {
            vendor: {
              select: {
                storeName: true,
                id: true,
                // Only meaningful for paymentMethod: "manual" vendor
                // orders, but cheap enough to always include rather than
                // branching the query — the frontend only renders these
                // when paymentMethod is "manual".
                // (bankAccountNumber and the merchant numbers come in via
                // VENDOR_PAYMENT_SELECT.)
                bankName: true,
                bankAccountName: true,
                mobileMoneyAccountType: true,
                // Used to work out which methods the customer can choose
                // from; the flags are stripped from the response below.
                ...VENDOR_PAYMENT_SELECT,
              },
            },
            items: true,
            proofOfPayments: { orderBy: { submittedAt: "desc" } },
            mopayPayments: {
              orderBy: { createdAt: "desc" },
              select: { id: true, status: true, selectedPaymentMethod: true, mopayTransactionId: true, failureReason: true, createdAt: true },
            },
            mpesaTransactions: {
              orderBy: { createdAt: "desc" },
              select: { id: true, status: true, responseDesc: true, mpesaTransactionId: true, customerMsisdn: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!order) throw new BusinessError("Order not found");

    const isOwner = user.role === "CUSTOMER" && order.customerId === user.id;
    const isAdmin = user.role === "ADMIN";
    const isInvolvedVendor =
      user.role === "VENDOR" && order.vendorOrders.some((vo) => vo.vendorId === user.vendorId);

    if (!isOwner && !isAdmin && !isInvolvedVendor) {
      throw new BusinessError("You do not have access to this order.");
    }

    // Vendors only ever see their own sub-order, never other vendors'
    // pricing/items within the same parent order.
    const visibleVendorOrders =
      user.role === "VENDOR" ? order.vendorOrders.filter((vo) => vo.vendorId === user.vendorId) : order.vendorOrders;

    // Each vendor order carries the payment methods its seller offers right
    // now, for the "choose how to pay" step on the order page. The raw
    // flags used to compute it aren't sent to the browser.
    const vendorOrders = visibleVendorOrders.map((vo) => {
      const {
        paymentMode: _paymentMode,
        acceptsManualPayment: _acceptsManualPayment,
        mopayEnabled: _mopayEnabled,
        mpesaApiEnabled: _mpesaApiEnabled,
        ...vendor
      } = vo.vendor;
      return { ...vo, vendor, availablePaymentMethods: availablePaymentMethods(vo.vendor) };
    });

    return NextResponse.json({ ...order, vendorOrders });
  } catch (err) {
    return handleApiError(err);
  }
}
