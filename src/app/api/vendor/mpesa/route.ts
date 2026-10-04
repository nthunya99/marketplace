import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { vendorMpesaSettingsSchema } from "@/lib/validators";
import { encryptSecret, decryptSecret, maskSecret, secretsConfigured } from "@/lib/secrets";
import { assertValidPublicKey, getSession, MpesaError } from "@/lib/mpesa/client";
import { recordAudit } from "@/lib/audit";

async function currentVendor() {
  const user = await requireRole("VENDOR");
  if (!user.vendorId) throw new BusinessError("Vendor profile not found");
  const vendor = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: user.vendorId } });
  return { user, vendor };
}

function publicView(vendor: Awaited<ReturnType<typeof currentVendor>>["vendor"]) {
  let apiKeyMasked: string | null = null;
  if (vendor.mpesaApiKeyEnc) {
    try {
      apiKeyMasked = maskSecret(decryptSecret(vendor.mpesaApiKeyEnc));
    } catch {
      apiKeyMasked = null; // key unreadable (encryption key changed) — must be re-entered
    }
  }
  return {
    enabled: vendor.mpesaApiEnabled,
    environment: vendor.mpesaEnvironment,
    serviceProviderCode: vendor.mpesaServiceProviderCode ?? "",
    publicKey: vendor.mpesaPublicKey ?? "",
    hasApiKey: !!apiKeyMasked,
    apiKeyMasked,
    verifiedAt: vendor.mpesaVerifiedAt,
    secretsConfigured: secretsConfigured(),
  };
}

/** GET /api/vendor/mpesa — the vendor's M-Pesa connection (API key masked). */
export async function GET() {
  try {
    const { vendor } = await currentVendor();
    return NextResponse.json(publicView(vendor));
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * PUT /api/vendor/mpesa — save the connection. Turning it on always runs
 * a live connection test against Vodacom first, so customers are never
 * offered M-Pesa for a store whose credentials don't work.
 */
export async function PUT(req: NextRequest) {
  try {
    const { user, vendor } = await currentVendor();
    if (!secretsConfigured()) {
      throw new BusinessError("M-Pesa connections aren't available yet: Mmarakeng hasn't set PAYMENT_CREDENTIALS_KEY.");
    }
    const data = vendorMpesaSettingsSchema.parse(await req.json());
    assertValidPublicKey(data.publicKey);

    let apiKey = data.apiKey;
    if (!apiKey) {
      if (!vendor.mpesaApiKeyEnc) throw new BusinessError("Enter your API key.");
      try {
        apiKey = decryptSecret(vendor.mpesaApiKeyEnc);
      } catch {
        throw new BusinessError("Your saved API key can no longer be read. Please enter it again.");
      }
    }

    const credentialsChanged =
      !!data.apiKey ||
      data.publicKey !== vendor.mpesaPublicKey ||
      data.serviceProviderCode !== vendor.mpesaServiceProviderCode ||
      data.environment !== vendor.mpesaEnvironment;

    let verifiedAt = credentialsChanged ? null : vendor.mpesaVerifiedAt;
    if (data.enabled && (credentialsChanged || !verifiedAt)) {
      try {
        await getSession(
          { apiKey, publicKey: data.publicKey, serviceProviderCode: data.serviceProviderCode, environment: data.environment },
          true
        );
      } catch (e) {
        throw new BusinessError(
          `Connection test failed, so M-Pesa was not switched on. ${e instanceof MpesaError ? e.message : ""}`.trim()
        );
      }
      verifiedAt = new Date();
    }

    const updated = await prisma.vendorProfile.update({
      where: { id: vendor.id },
      data: {
        mpesaApiKeyEnc: data.apiKey ? encryptSecret(data.apiKey) : vendor.mpesaApiKeyEnc,
        mpesaPublicKey: data.publicKey,
        mpesaServiceProviderCode: data.serviceProviderCode,
        mpesaEnvironment: data.environment,
        mpesaVerifiedAt: verifiedAt,
        mpesaApiEnabled: data.enabled,
      },
    });

    await recordAudit(prisma, {
      actorId: user.id,
      actorEmail: user.email,
      action: "VENDOR_MPESA_SETTINGS_UPDATED",
      entityType: "VendorProfile",
      entityId: vendor.id,
      previousValue: { enabled: vendor.mpesaApiEnabled, environment: vendor.mpesaEnvironment, code: vendor.mpesaServiceProviderCode },
      newValue: { enabled: data.enabled, environment: data.environment, code: data.serviceProviderCode, apiKeyChanged: !!data.apiKey },
    });

    return NextResponse.json(publicView(updated));
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/vendor/mpesa — disconnect and erase the stored credentials. */
export async function DELETE() {
  try {
    const { user, vendor } = await currentVendor();
    const updated = await prisma.vendorProfile.update({
      where: { id: vendor.id },
      data: {
        mpesaApiEnabled: false,
        mpesaApiKeyEnc: null,
        mpesaPublicKey: null,
        mpesaServiceProviderCode: null,
        mpesaVerifiedAt: null,
      },
    });
    await recordAudit(prisma, {
      actorId: user.id,
      actorEmail: user.email,
      action: "VENDOR_MPESA_DISCONNECTED",
      entityType: "VendorProfile",
      entityId: vendor.id,
    });
    return NextResponse.json(publicView(updated));
  } catch (err) {
    return handleApiError(err);
  }
}
