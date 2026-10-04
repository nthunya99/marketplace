import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { vendorPaymentDetailsSchema, payoutDetailsIssue } from "@/lib/validators";
import { handleApiError, BusinessError } from "@/lib/api-utils";

/**
 * GET /api/vendor/payment-details — a vendor's own banking/mobile money
 * details, for the settings form. (Public display of these to customers
 * happens separately, scoped to just the fields needed, via the order
 * detail route — never through this endpoint.)
 */
export async function GET() {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: user.vendorId },
      select: {
        acceptsManualPayment: true,
        bankName: true,
        bankAccountName: true,
        bankAccountNumber: true,
        mpesaMerchantNumber: true,
        ecocashMerchantNumber: true,
        mobileMoneyAccountType: true,
      },
    });
    return NextResponse.json(vendor);
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * PATCH /api/vendor/payment-details
 * Saves where customers send offline payment: a bank account and/or an
 * M-Pesa / EcoCash number (merchant or personal). The same rules as the
 * registration form apply (payoutDetailsIssue) — a bank account needs its
 * bank and holder name, mobile numbers must look like numbers, and manual
 * payment can't be switched on without at least one place to pay into.
 * Blank fields are stored as null.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireRole("VENDOR");
    if (!user.vendorId) throw new BusinessError("Vendor profile not found");
    const input = vendorPaymentDetailsSchema.parse(await req.json());

    const existing = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: user.vendorId } });

    const clean = (v: string | null | undefined, current: string | null) =>
      v === undefined ? current : v === null || v.trim() === "" ? null : v.trim();

    const details = {
      bankName: clean(input.bankName, existing.bankName),
      bankAccountName: clean(input.bankAccountName, existing.bankAccountName),
      bankAccountNumber: clean(input.bankAccountNumber, existing.bankAccountNumber),
      mpesaMerchantNumber: clean(input.mpesaMerchantNumber, existing.mpesaMerchantNumber),
      ecocashMerchantNumber: clean(input.ecocashMerchantNumber, existing.ecocashMerchantNumber),
    };
    const acceptsManualPayment = input.acceptsManualPayment ?? existing.acceptsManualPayment;
    const anyDetail = Object.values(details).some(Boolean);

    if (acceptsManualPayment || anyDetail) {
      const issue = payoutDetailsIssue(details);
      if (issue) throw new BusinessError(issue);
    }

    const data = {
      ...details,
      acceptsManualPayment,
      mobileMoneyAccountType: input.mobileMoneyAccountType ?? existing.mobileMoneyAccountType,
    };

    const updated = await prisma.vendorProfile.update({
      where: { id: user.vendorId },
      data,
      select: {
        acceptsManualPayment: true,
        bankName: true,
        bankAccountName: true,
        bankAccountNumber: true,
        mpesaMerchantNumber: true,
        ecocashMerchantNumber: true,
        mobileMoneyAccountType: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
