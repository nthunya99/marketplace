import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-utils";

/**
 * GET /api/currency-rates — public. Powers the storefront currency
 * switcher (display-only conversion — see the CurrencyRate model's doc
 * comment in schema.prisma).
 */
export async function GET() {
  try {
    const rates = await prisma.currencyRate.findMany({ orderBy: { currencyCode: "asc" } });
    const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    return NextResponse.json({ baseCurrency: settings?.currency ?? "LSL", rates });
  } catch (err) {
    return handleApiError(err);
  }
}
