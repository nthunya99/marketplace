/**
 * One-off: set paymentMode for stores that existed before it was added.
 * `db push` gives every existing store the default "MANUAL", which would
 * hide MoPay / direct M-Pesa from customers of stores that already use
 * them. This moves those stores to "ONLINE" — unless they also accept
 * offline payment, in which case they stay on MANUAL and can switch
 * themselves on /vendor/payments.
 *
 * Run once, after `npm run db:push`:
 *   npx tsx prisma/backfill-payment-mode.ts
 * Safe to run again; it only touches stores still on MANUAL.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.vendorProfile.updateMany({
    where: {
      paymentMode: "MANUAL",
      acceptsManualPayment: false,
      OR: [{ mopayEnabled: true }, { mpesaApiEnabled: true }],
    },
    data: { paymentMode: "ONLINE" },
  });
  console.log(`Moved ${result.count} store(s) to ONLINE payment mode.`);

  const both = await prisma.vendorProfile.findMany({
    where: { paymentMode: "MANUAL", acceptsManualPayment: true, OR: [{ mopayEnabled: true }, { mpesaApiEnabled: true }] },
    select: { storeName: true },
  });
  if (both.length > 0) {
    console.log(
      `Left on MANUAL (they accept offline payment AND have an online connection — they can switch on /vendor/payments): ${both
        .map((v) => v.storeName)
        .join(", ")}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
