import type { VendorProfile } from "@prisma/client";
import { decryptSecret } from "@/lib/secrets";
import { BusinessError } from "@/lib/api-utils";
import type { MpesaCredentials, MpesaEnvironment } from "./client";

type VendorMpesaFields = Pick<
  VendorProfile,
  "storeName" | "mpesaApiKeyEnc" | "mpesaPublicKey" | "mpesaServiceProviderCode" | "mpesaEnvironment"
>;

/** Decrypt a vendor's stored M-Pesa credentials for a server-side call. */
export function vendorMpesaCredentials(vendor: VendorMpesaFields): MpesaCredentials {
  if (!vendor.mpesaApiKeyEnc || !vendor.mpesaPublicKey || !vendor.mpesaServiceProviderCode) {
    throw new BusinessError(`${vendor.storeName} hasn't finished setting up M-Pesa payments.`);
  }
  let apiKey: string;
  try {
    apiKey = decryptSecret(vendor.mpesaApiKeyEnc);
  } catch {
    throw new BusinessError(
      `${vendor.storeName}'s M-Pesa connection needs to be re-entered. Please try again later.`
    );
  }
  return {
    apiKey,
    publicKey: vendor.mpesaPublicKey,
    serviceProviderCode: vendor.mpesaServiceProviderCode,
    environment: (vendor.mpesaEnvironment === "openapi" ? "openapi" : "sandbox") as MpesaEnvironment,
  };
}
