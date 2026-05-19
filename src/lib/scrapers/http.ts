import { Agent, fetch as undiciFetch } from "undici";
import type { AdapterContext } from "./types";

const USER_AGENT =
  "UnilexBot/0.1 (+https://unilex.app; contact: hello@unilex.app)";

// Some Polish gov sites use Certum CA roots that Node's built-in bundle doesn't
// trust. Browsers/curl rely on the OS cert store. Scraping public listing pages
// over TLS without chain validation is acceptable for this use case — we're
// reading public data, not authenticating to it.
const insecureAgent = new Agent({
  connect: { rejectUnauthorized: false },
});

const defaultAgent = new Agent({
  connect: { timeout: 15_000 },
});

export type FetchOptions = {
  timeoutMs?: number;
  allowInsecureTls?: boolean;
  headers?: Record<string, string>;
};

export function makeAdapterFetch(
  defaultTimeoutMs = 20_000,
): AdapterContext["fetch"] {
  return async (url, init) => {
    return scrapeFetch(url, {
      timeoutMs: init?.timeoutMs ?? defaultTimeoutMs,
      headers: init?.headers,
      allowInsecureTls: init?.allowInsecureTls,
    });
  };
}

export async function scrapeFetch(
  url: string,
  opts: FetchOptions = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await undiciFetch(url, {
      method: "GET",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "pl,en;q=0.8",
        ...opts.headers,
      },
      redirect: "follow",
      signal: controller.signal,
      dispatcher: opts.allowInsecureTls ? insecureAgent : defaultAgent,
    });
    // Buffer the body so the caller doesn't have to deal with undici streams.
    const text = await res.text();
    return new Response(text, { status: res.status });
  } finally {
    clearTimeout(timer);
  }
}
