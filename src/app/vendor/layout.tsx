import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import VendorNav from "@/components/vendor/VendorNav";
import { availablePaymentMethods, VENDOR_PAYMENT_SELECT } from "@/lib/vendor-payment-methods";

/**
 * Shared shell for every /vendor/* page. The store navigation lives here
 * (not on the dashboard page), so it stays on screen whichever vendor
 * page is open: a sidebar on desktop, a scrollable tab strip on mobile.
 *
 * Access control is still enforced by middleware.ts and by each API
 * route; this layout only reads the store name/status for display.
 */
export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const vendorId = session?.user?.vendorId ?? null;
  const vendor = vendorId
    ? await prisma.vendorProfile.findUnique({
        where: { id: vendorId },
        select: { storeName: true, status: true, ...VENDOR_PAYMENT_SELECT },
      })
    : null;

  return (
    <div className="lg:grid lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-8 lg:items-start">
      <VendorNav storeName={vendor?.storeName ?? "My store"} status={vendor?.status ?? null} />
      <div className="min-w-0">
        {vendor && availablePaymentMethods(vendor).length === 0 && (
          <div className="rounded-lg border border-accent/30 bg-accent-light px-4 py-3 text-sm text-accent-dark mb-5">
            {vendor.paymentMode === "ONLINE"
              ? "Customers can't pay your store yet — connect your merchant account to start taking orders."
              : "Customers can't pay your store yet — add where they should pay you to start taking orders."}{" "}
            <Link
              href={vendor.paymentMode === "ONLINE" ? "/vendor/payments" : "/vendor/payment-details"}
              className="font-medium underline"
            >
              Set up payments
            </Link>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
