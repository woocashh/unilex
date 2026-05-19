import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  createSessionToken,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/feed");

  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    return NextResponse.json(
      { error: "Server is not configured for login (missing env vars)" },
      { status: 500 },
    );
  }

  if (!constantTimeEqual(password, process.env.APP_PASSWORD)) {
    const redirect = new URL("/login", req.url);
    redirect.searchParams.set("error", "1");
    if (next && next !== "/feed") redirect.searchParams.set("next", next);
    return NextResponse.redirect(redirect, { status: 303 });
  }

  const token = await createSessionToken(process.env.SESSION_SECRET);
  const target = safeNext(next);
  const res = NextResponse.redirect(new URL(target, req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return res;
}

function safeNext(p: string): string {
  // Only allow same-origin paths.
  if (p.startsWith("/") && !p.startsWith("//")) return p;
  return "/feed";
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
