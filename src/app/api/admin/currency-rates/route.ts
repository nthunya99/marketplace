import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { handleApiError } from "@/lib/api-utils";
import { z } from "zod";

const schema = z.object({
  currencyCode: z.string().length(3),
  rateToBase: z.number().positive(),
});

/**
 * POST /api/admin/currency-rates — admin sets/updates an exchange rate.
 * See the CurrencyRate model's doc comment: these rates power display-only
 * conversion on the storefront; charging still happens in the platform's
 * base currency.
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const data = schema.parse(await req.json());

    const rate = await prisma.currencyRate.upsert({
      where: { currencyCode: data.currencyCode.toUpperCase() },
      update: { rateToBase: data.rateToBase },
      create: { currencyCode: data.currencyCode.toUpperCase(), rateToBase: data.rateToBase },
    });

    return NextResponse.json(rate, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
