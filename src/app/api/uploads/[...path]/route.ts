import { NextRequest, NextResponse } from "next/server";
import { readUpload } from "@/lib/uploads";

/**
 * GET /api/uploads/<...path> — serves uploaded files from local storage
 * (see src/lib/uploads.ts). Product images are public, so no auth check.
 * File names are random UUIDs and never overwritten, so they can be
 * cached aggressively.
 */
export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const file = await readUpload(params.path ?? []);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(file.data, {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
