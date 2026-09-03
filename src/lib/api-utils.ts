import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./auth-utils";

/**
 * Central error translator for API routes. Never leaks internals (stack
 * traces, DB errors) to the client — spec section 34/25.
 */
export function handleApiError(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: err.flatten() },
      { status: 400 }
    );
  }
  if (err instanceof Error) {
    // Known, intentionally-thrown business errors (insufficient stock,
    // vendor not approved, etc.) — safe to surface their message.
    if ((err as any).isBusinessError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export class BusinessError extends Error {
  isBusinessError = true;
}

export function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");
  return `ORD-${ts}-${rand}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}
