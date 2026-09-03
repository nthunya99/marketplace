import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { getCourierProvider } from "@/lib/courier";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const vendorOrder = await prisma.vendorOrder.findUnique({
      where: { id: params.id },
      include: { order: { select: { customerId: true } } },
    });
    if (!vendorOrder) throw new BusinessError("Order not found");

    const isOwner = user.role === "CUSTOMER" && vendorOrder.order.customerId === user.id;
    const isVendor = user.role === "VENDOR" && vendorOrder.vendorId === user.vendorId;
    const isAdmin = user.role === "ADMIN";
    if (!isOwner && !isVendor && !isAdmin) throw new BusinessError("You do not have access to this order.");

    if (!vendorOrder.trackingNumber) {
      throw new BusinessError("No tracking number has been added to this order yet.");
    }

    const provider = getCourierProvider(vendorOrder.courierProvider);
    const tracking = await provider.track(vendorOrder.trackingNumber);

    return NextResponse.json(tracking);
  } catch (err) {
    return handleApiError(err);
  }
}
