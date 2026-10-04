import { PrismaClient } from "@prisma/client";

// Standard Next.js dev-mode singleton to avoid exhausting DB connections
// on hot reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Prisma's interactive-transaction default is a 5s timeout / 2s
    // maxWait. Several routes here (checkout, payment confirmation)
    // chain half a dozen+ awaited queries in one $transaction, and on a
    // Neon free-tier database that's just woken from auto-suspend, that
    // alone can eat several seconds before any query even starts — so
    // the default was getting exceeded on real (not slow) requests, not
    // just unusually heavy ones. Raising both here fixes it for every
    // $transaction call in the app at once, rather than passing options
    // to each one individually.
    transactionOptions: {
      timeout: 20000,
      maxWait: 10000,
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
