import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Single choke point for writing audit trail entries (spec section 26).
 * Every route that performs an admin/financial action important enough
 * to audit calls this instead of writing to prisma.auditLog directly, so
 * the set of audited actions is discoverable by searching for one import.
 */
export async function recordAudit(
  db: Prisma.TransactionClient | PrismaClient,
  params: {
    actorId?: string | null;
    actorEmail?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    previousValue?: unknown;
    newValue?: unknown;
    ipAddress?: string | null;
  }
) {
  return db.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      actorEmail: params.actorEmail ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      previousValue: params.previousValue as any,
      newValue: params.newValue as any,
      ipAddress: params.ipAddress ?? null,
    },
  });
}
