import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { productCreateSchema } from "@/lib/validators";
import { productImagePrefix } from "@/lib/uploads";
import { handleApiError, slugify, BusinessError } from "@/lib/api-utils";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/products?mine=true — a vendor's own product list, including
 * drafts/archived, for their dashboard. Kept in this same route (rather
 * than a public/private split) since the auth check is trivial and it
 * avoids two divergent query implementations.
 */
async function getMyProducts() {
  const user = await requireRole("VENDOR");
  if (!user.vendorId) throw new BusinessError("Vendor profile not found");
  const products = await prisma.product.findMany({
    where: { vendorId: user.vendorId },
    orderBy: { createdAt: "desc" },
    include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, category: { select: { name: true } } },
  });
  return NextResponse.json({ items: products, total: products.length, page: 1, pageSize: products.length, totalPages: 1 });
}

/**
 * GET /api/products
 * Public product discovery endpoint (spec section 5). Every filter/sort
 * option is a plain query param so the frontend can mirror them straight
 * into the URL (shareable/back-button-friendly, per spec requirement).
 *
 * Supported params:
 *   q               keyword search (name, description, brand, sku, tags)
 *   category        category slug
 *   vendor          vendor store slug
 *   brand           exact brand match
 *   minPrice/maxPrice
 *   sort            "newest" | "price_asc" | "price_desc" | "best_selling"
 *   page, pageSize
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    if (sp.get("mine") === "true") return await getMyProducts();

    const q = sp.get("q")?.trim();
    const categorySlug = sp.get("category");
    const vendorSlug = sp.get("vendor");
    const brand = sp.get("brand");
    const minPrice = sp.get("minPrice");
    const maxPrice = sp.get("maxPrice");
    const sort = sp.get("sort") ?? "newest";
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(60, Math.max(1, parseInt(sp.get("pageSize") ?? "20", 10) || 20));

    const where: Prisma.ProductWhereInput = { status: "PUBLISHED" };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { tags: { has: q } },
      ];
    }
    if (categorySlug) where.category = { slug: categorySlug };
    if (vendorSlug) where.vendor = { storeSlug: vendorSlug };
    if (brand) where.brand = brand;
    if (minPrice || maxPrice) {
      where.price = {
        ...(minPrice ? { gte: Number(minPrice) } : {}),
        ...(maxPrice ? { lte: Number(maxPrice) } : {}),
      };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === "price_asc"
        ? { price: "asc" }
        : sort === "price_desc"
        ? { price: "desc" }
        : { createdAt: "desc" }; // "newest" and fallback; "best_selling" needs
    // aggregated OrderItem counts — left as a documented Phase 3 extension
    // (spec section 22) rather than faked with random ordering.

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
          vendor: { select: { storeName: true, storeSlug: true, isVerified: true } },
          category: { select: { name: true, slug: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/products — vendor creates a product.
 * Requires role=VENDOR AND vendor status=APPROVED (checked server-side,
 * never trusted from the client per spec section 25).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("VENDOR");
    const vendor = await prisma.vendorProfile.findUnique({ where: { userId: user.id } });
    if (!vendor) throw new BusinessError("Vendor profile not found");
    if (vendor.status !== "APPROVED") {
      throw new BusinessError(
        `Your vendor account is ${vendor.status.toLowerCase()}. You must be approved before listing products.`
      );
    }

    const data = productCreateSchema.parse(await req.json());

    // Images must be files this vendor uploaded — never another vendor's
    // files and never an external URL (enforced here, not just in the UI).
    const ownPrefix = productImagePrefix(vendor.id);
    if (data.images.some((img) => !img.url.startsWith(ownPrefix))) {
      throw new BusinessError("One or more images weren't uploaded from your store. Please re-upload them.");
    }

    if (data.discountPrice !== undefined && data.discountPrice >= data.price) {
      throw new BusinessError("The sale price must be lower than the regular price.");
    }

    const existingSku = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (existingSku) throw new BusinessError("A product with this SKU already exists.");

    const baseSlug = slugify(data.name);
    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.product.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new BusinessError("Category not found");

    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: data.categoryId,
        name: data.name,
        slug,
        description: data.description,
        shortDescription: data.shortDescription,
        price: data.price,
        discountPrice: data.discountPrice,
        sku: data.sku,
        stockQuantity: data.stockQuantity,
        brand: data.brand,
        tags: data.tags ?? [],
        status: data.status ?? "DRAFT",
        images: {
          create: data.images.map((img, i) => ({
            url: img.url,
            altText: img.altText ?? data.name,
            sortOrder: i,
          })),
        },
        attributes: data.attributes ? { create: data.attributes } : undefined,
        variants: data.variants
          ? {
              create: data.variants.map((v) => ({
                sku: v.sku,
                optionsJson: v.options,
                price: v.price,
                stockQuantity: v.stockQuantity,
                imageUrl: v.imageUrl,
              })),
            }
          : undefined,
      },
      include: { images: true, variants: true, attributes: true },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
