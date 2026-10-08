// Called by the scheduler (Vercel Cron, GitHub Actions, or any cron hitting the URL).
// Authorization: Bearer $CRON_SECRET (Vercel sends this header automatically).
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDueSavedSearches } from "@/lib/alerts";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runDueSavedSearches());
}
