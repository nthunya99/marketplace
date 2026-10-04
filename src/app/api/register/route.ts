import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth-utils";
import { registerCustomerSchema, registerVendorSchema } from "@/lib/validators";
import { handleApiError, BusinessError, slugify } from "@/lib/api-utils";

/**
 * POST /api/register
 * body: { role: "CUSTOMER" | "VENDOR", ...fields }
 *
 * Vendors are created with status=PENDING (spec section 1) — they cannot
 * list products until an admin approves them (enforced again in the
 * products API, never trusted from the client).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const role = body.role === "VENDOR" ? "VENDOR" : "CUSTOMER";

    const existing = await prisma.user.findUnique({ where: { email: body.email?.toLowerCase() } });
    if (existing) {
      throw new BusinessError("An account with this email already exists.");
    }

    if (role === "VENDOR") {
      const data = registerVendorSchema.parse(body);
      const passwordHash = await hashPassword(data.password);
      const baseSlug = slugify(data.storeName);

      let slug = baseSlug;
      let suffix = 1;
      while (await prisma.vendorProfile.findUnique({ where: { storeSlug: slug } })) {
        slug = `${baseSlug}-${suffix++}`;
      }

      const user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email.toLowerCase(),
          passwordHash,
          role: "VENDOR",
          vendorProfile: {
            create: {
              storeName: data.storeName,
              storeSlug: slug,
              storeDescription: data.storeDescription,
              contactEmail: data.contactEmail,
              contactPhone: data.contactPhone,
              status: "PENDING",
              // How customers will pay this store (see registerVendorSchema).
              // MANUAL stores are ready to take orders the moment they're
              // approved; ONLINE stores connect their merchant API first.
              paymentMode: data.paymentMode,
              ...(data.paymentMode === "MANUAL"
                ? {
                    acceptsManualPayment: true,
                    bankName: data.bankName,
                    bankAccountName: data.bankAccountName,
                    bankAccountNumber: data.bankAccountNumber,
                    mpesaMerchantNumber: data.mpesaMerchantNumber,
                    ecocashMerchantNumber: data.ecocashMerchantNumber,
                    mobileMoneyAccountType: data.mobileMoneyAccountType,
                  }
                : {}),
              wallet: { create: {} },
            },
          },
        },
        include: { vendorProfile: true },
      });

      return NextResponse.json(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          vendorStatus: user.vendorProfile?.status,
          paymentMode: data.paymentMode,
          message:
            data.paymentMode === "ONLINE"
              ? "Vendor account created and pending admin approval. Log in and open Seller centre → Payments to enter your merchant number and API credentials — customers can pay you once they're connected."
              : "Vendor account created. It is pending admin approval before you can list products.",
        },
        { status: 201 }
      );
    }

    const data = registerCustomerSchema.parse(body);
    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        role: "CUSTOMER",
        cart: { create: {} },
      },
    });

    return NextResponse.json({ id: user.id, email: user.email, role: user.role }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
