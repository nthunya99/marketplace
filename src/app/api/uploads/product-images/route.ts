import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { MAX_PRODUCT_IMAGE_BYTES, saveProductImage, sniffImage } from "@/lib/uploads";

/**
 * POST /api/uploads/product-images — multipart/form-data with one "file".
 *
 * The add-product form uploads each image as soon as the vendor picks it,
 * then submits the returned URLs with the product. Only approved vendors
 * can upload, the file type is verified from its bytes (not its name), and
 * the file is stored under the vendor's own folder so the product API can
 * refuse images that belong to someone else.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("VENDOR");
    const vendor = await prisma.vendorProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, status: true },
    });
    if (!vendor) throw new BusinessError("Vendor profile not found");
    if (vendor.status !== "APPROVED") {
      throw new BusinessError("Your store must be approved before you can upload product images.");
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new BusinessError("Upload must be sent as a file.");
    }
    const file = form.get("file");
    if (!file || typeof file === "string") throw new BusinessError("No image file received.");
    if (file.size === 0) throw new BusinessError("That file is empty.");
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      throw new BusinessError("Image is larger than 5 MB. Please choose a smaller photo.");
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const kind = sniffImage(buf);
    if (!kind) throw new BusinessError("Only JPG, PNG or WebP images are allowed.");

    const url = await saveProductImage(vendor.id, buf, kind);
    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
