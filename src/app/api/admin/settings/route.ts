import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  autoPayoutEnabled: z.boolean().optional(),
  autoPayoutThreshold: z.number().min(0).optional(),
  fraudReviewThreshold: z.number().int().min(0).optional(),
  defaultCommission: z.number().min(0).max(100).optional(),
});

export async function GET() {
  try {
    await requireRole("ADMIN");
    const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    return NextResponse.json(settings);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireRole("ADMIN");
    const data = schema.parse(await req.json());

    const before = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    const updated = await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });

    await recordAudit(prisma, {
      actorId: admin.id,
      actorEmail: admin.email,
      action: "PLATFORM_SETTINGS_CHANGED",
      entityType: "PlatformSettings",
      entityId: "singleton",
      previousValue: before,
      newValue: data,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
