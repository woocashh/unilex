import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * Server-side auth check for server actions. Returns true when the request
 * has a valid session cookie. Middleware also gates this, but actions run on
 * fetch handlers that the middleware path doesn't fully protect against
 * cross-origin abuse — so we re-check here.
 */
export async function isAuthed(): Promise<boolean> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, process.env.SESSION_SECRET);
}
