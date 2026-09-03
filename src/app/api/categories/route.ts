import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { categorySchema } from "@/lib/validators";
import { handleApiError, slugify, BusinessError } from "@/lib/api-utils";

// GET is public — customers need this to browse.
export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { children: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
    });
    // Only top-level here; children are nested for the tree view.
    return NextResponse.json(categories.filter((c) => !c.parentId));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const data = categorySchema.parse(await req.json());

    const baseSlug = slugify(data.name);
    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.category.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) throw new BusinessError("Parent category not found");
    }

    const category = await prisma.category.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        imageUrl: data.imageUrl,
        parentId: data.parentId ?? null,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
