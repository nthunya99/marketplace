import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { encryptSecret, decryptSecret, maskSecret, secretsConfigured } from "@/lib/secrets";
import { createSession, appBaseUrl, MopayError } from "@/lib/mopay/client";
import { recordAudit } from "@/lib/audit";
import crypto from "crypto";

const schema = z.object({
  apiKey: z.string().trim().min(8, "That API key looks too short.").max(500).optional(),
  enabled: z.boolean(),
});

async function currentVendor() {
  const user = await requireRole("VENDOR");
  if (!user.vendorId) throw new BusinessError("Vendor profile not found");
  const vendor = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: user.vendorId } });
  return { user, vendor };
}

function view(v: Awaited<ReturnType<typeof currentVendor>>["vendor"]) {
  let masked: string | null = null;
  if (v.mopayApiKeyEnc) {
    try {
      masked = maskSecret(decryptSecret(v.mopayApiKeyEnc));
    } catch {
      masked = null;
    }
  }
  return {
    enabled: v.mopayEnabled,
    hasApiKey: !!masked,
    apiKeyMasked: masked,
    verifiedAt: v.mopayVerifiedAt,
    secretsConfigured: secretsConfigured(),
  };
}

export async function GET() {
  try {
    const { vendor } = await currentVendor();
    return NextResponse.json(view(vendor));
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * PUT /api/vendor/mopay — save the MoPay project API key. Turning MoPay
 * on first checks the key by creating an M1.00 test checkout session,
 * which shows in the vendor's MoPay dashboard as an unpaid session and
 * simply expires. MoPay has no separate "check key" endpoint.
 */
export async function PUT(req: NextRequest) {
  try {
    const { user, vendor } = await currentVendor();
    if (!secretsConfigured()) {
      throw new BusinessError("Online payments aren't available yet: Mmarakeng hasn't set PAYMENT_CREDENTIALS_KEY.");
    }
    const data = schema.parse(await req.json());

    let apiKey = data.apiKey;
    if (!apiKey) {
      if (!vendor.mopayApiKeyEnc) throw new BusinessError("Enter your MoPay API key.");
      try {
        apiKey = decryptSecret(vendor.mopayApiKeyEnc);
      } catch {
        throw new BusinessError("Your saved API key can no longer be read. Please enter it again.");
      }
    }

    let verifiedAt = data.apiKey ? null : vendor.mopayVerifiedAt;
    if (data.enabled && !verifiedAt) {
      try {
        await createSession(apiKey, {
          amount: "1.00",
          reference: `TEST${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
          redirectUrl: `${appBaseUrl()}/vendor/payments`,
          description: "Connection test from Mmarakeng - no payment needed",
        });
      } catch (e) {
        throw new BusinessError(
          `Connection test failed, so online payments were not switched on. ${e instanceof MopayError ? e.message : ""}`.trim()
        );
      }
      verifiedAt = new Date();
    }

    const updated = await prisma.vendorProfile.update({
      where: { id: vendor.id },
      data: {
        mopayApiKeyEnc: data.apiKey ? encryptSecret(data.apiKey) : vendor.mopayApiKeyEnc,
        mopayEnabled: data.enabled,
        mopayVerifiedAt: verifiedAt,
      },
    });
    await recordAudit(prisma, {
      actorId: user.id,
      actorEmail: user.email,
      action: "VENDOR_MOPAY_SETTINGS_UPDATED",
      entityType: "VendorProfile",
      entityId: vendor.id,
      previousValue: { enabled: vendor.mopayEnabled },
      newValue: { enabled: data.enabled, apiKeyChanged: !!data.apiKey },
    });
    return NextResponse.json(view(updated));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE() {
  try {
    const { user, vendor } = await currentVendor();
    const updated = await prisma.vendorProfile.update({
      where: { id: vendor.id },
      data: { mopayEnabled: false, mopayApiKeyEnc: null, mopayVerifiedAt: null },
    });
    await recordAudit(prisma, {
      actorId: user.id,
      actorEmail: user.email,
      action: "VENDOR_MOPAY_DISCONNECTED",
      entityType: "VendorProfile",
      entityId: vendor.id,
    });
    return NextResponse.json(view(updated));
  } catch (err) {
    return handleApiError(err);
  }
}
