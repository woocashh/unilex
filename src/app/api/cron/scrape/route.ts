import { NextResponse } from "next/server";
import { runAllScrapers } from "@/lib/scrapers/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await runAllScrapers();
  const summary = {
    sources: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    itemsFound: results.reduce((n, r) => n + r.itemsFound, 0),
    itemsNew: results.reduce((n, r) => n + r.itemsNew, 0),
  };
  return NextResponse.json({ summary, results });
}
