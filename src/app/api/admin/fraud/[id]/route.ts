import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError, BusinessError } from "@/lib/api-utils";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({ status: z.enum(["CLEARED", "CONFIRMED_FRAUD"]) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireRole("ADMIN");
    const { status } = schema.parse(await req.json());

    const flag = await prisma.fraudFlag.findUnique({ where: { id: params.id } });
    if (!flag) throw new BusinessError("Fraud flag not found");

    const updated = await prisma.fraudFlag.update({
      where: { id: params.id },
      data: { status, reviewedBy: admin.id, reviewedAt: new Date() },
    });

    await recordAudit(prisma, {
      actorId: admin.id,
      actorEmail: admin.email,
      action: "FRAUD_FLAG_REVIEWED",
      entityType: "FraudFlag",
      entityId: flag.id,
      previousValue: { status: flag.status },
      newValue: { status },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
