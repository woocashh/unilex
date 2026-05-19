// Edge-runtime-safe signed cookie helpers using Web Crypto (HMAC-SHA256).
// Format: <base64url(payload)>.<base64url(signature)>
// Payload: JSON { exp: number (seconds since epoch) }

const SESSION_COOKIE = "unilex_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export { SESSION_COOKIE };

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toBuffer(new TextEncoder().encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

async function sign(payload: string, secret: string): Promise<string> {
  const data = toBuffer(new TextEncoder().encode(payload));
  const sig = await crypto.subtle.sign("HMAC", await key(secret), data);
  return b64urlEncode(new Uint8Array(sig));
}

async function verifyHmac(payload: string, sig: string, secret: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      toBuffer(b64urlDecode(sig)),
      toBuffer(new TextEncoder().encode(payload)),
    );
  } catch {
    return false;
  }
}

export async function createSessionToken(secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({ exp })));
  const sig = await sign(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
): Promise<boolean> {
  if (!token || !secret) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  if (!(await verifyHmac(payload, sig, secret))) return false;
  try {
    const decoded = new TextDecoder().decode(b64urlDecode(payload));
    const obj = JSON.parse(decoded) as { exp?: number };
    if (typeof obj.exp !== "number") return false;
    return obj.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
