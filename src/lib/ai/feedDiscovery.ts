// Feed discovery — the loop behind /sources/new. Fetches the pasted URL and
// asks the agent (feedAgent.ts) to either configure it as a listing or hand
// back candidate links; crawls those (same site only, bounded budget) until a
// page yields items. Pure of auth/DB so it can be exercised directly in tests;
// the server action in app/sources/new/actions.ts is a thin authed wrapper.

import { scrapeFetch } from "@/lib/scrapers/http";
import {
  customFeedConfigSchema,
  extractCustomItems,
  type CustomFeedConfig,
} from "@/lib/scrapers/adapters/custom-css";
import { proposeFeedConfig, simplifyHtmlForLlm } from "@/lib/ai/feedAgent";

export type PreviewItem = {
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string | null;
};

export type DiscoveryResult =
  | {
      ok: true;
      /** The page the feed was actually configured from (after discovery). */
      url: string;
      /** True when the agent crawled away from the pasted URL to find it. */
      discovered: boolean;
      sourceName: string;
      notes: string;
      config: CustomFeedConfig;
      preview: PreviewItem[];
      totalItems: number;
      warnings: string[];
    }
  | { ok: false; error: string };

const PREVIEW_LIMIT = 5;
// Total page fetches per call, counting the pasted URL itself. Keeps the
// worst case inside the route's maxDuration.
const MAX_PAGE_FETCHES = 4;

export async function discoverFeed(input: {
  url: string;
  feedback?: string;
  previousConfig?: unknown;
}): Promise<DiscoveryResult> {
  let startUrl: string;
  try {
    startUrl = validateFeedUrl(input.url);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const feedback = input.feedback?.trim() || undefined;
  const prevParsed = customFeedConfigSchema.safeParse(input.previousConfig);
  const previousConfig = prevParsed.success ? prevParsed.data : undefined;

  let page = await fetchPage(startUrl);
  // Dead link? Restart the search from the site root.
  if (!page.ok && new URL(startUrl).pathname !== "/") {
    const rootUrl = new URL("/", startUrl).toString();
    const root = await fetchPage(rootUrl);
    if (root.ok) {
      startUrl = rootUrl;
      page = root;
    }
  }
  if (!page.ok) {
    return { ok: false, error: `Nie udało się pobrać strony: ${page.error}` };
  }

  try {
    // Crawl loop: the model either configures the current page or hands back
    // candidate links to the real listing (e.g. when given a homepage).
    const visited = new Set([startUrl]);
    const queue: string[] = [];
    let fetches = 1;
    let current = { url: startUrl, html: page.html, insecureTls: page.insecureTls };
    let lastZero:
      | { url: string; html: string; insecureTls: boolean; config: CustomFeedConfig; outcome: string }
      | null = null;
    let navigateNotes = "";

    while (true) {
      const isStart = current.url === startUrl;
      const proposal = await proposeFeedConfig({
        url: current.url,
        html: simplifyHtmlForLlm(current.html),
        previousConfig: isStart ? previousConfig : undefined,
        previousOutcome:
          isStart && previousConfig
            ? describeOutcome(extractCustomItems(current.html, current.url, previousConfig))
            : undefined,
        userFeedback: feedback,
      });

      if (proposal.kind === "config") {
        const extraction = extractCustomItems(current.html, current.url, proposal.config);
        if (extraction.items.length > 0) {
          return buildSuccess(input.url, current, proposal, extraction);
        }
        lastZero = {
          ...current,
          config: proposal.config,
          outcome: describeOutcome(extraction),
        };
      } else {
        navigateNotes = proposal.notes ?? "";
        for (const candidate of proposal.candidates) {
          try {
            const abs = new URL(candidate, current.url);
            abs.hash = "";
            const validated = validateFeedUrl(abs.toString());
            if (!visited.has(validated) && sameSite(startUrl, validated)) {
              queue.push(validated);
            }
          } catch {
            // unusable candidate — skip
          }
        }
      }

      // Advance to the next fetchable candidate, within budget.
      let advanced = false;
      while (queue.length > 0 && fetches < MAX_PAGE_FETCHES) {
        const next = queue.shift()!;
        if (visited.has(next)) continue;
        visited.add(next);
        fetches++;
        const fetched = await fetchPage(next);
        if (!fetched.ok) continue;
        current = { url: next, html: fetched.html, insecureTls: fetched.insecureTls };
        advanced = true;
        break;
      }
      if (!advanced) break;
    }

    // No page yielded items. Give the most recent config attempt one
    // self-correction round before reporting back.
    if (lastZero) {
      const retry = await proposeFeedConfig({
        url: lastZero.url,
        html: simplifyHtmlForLlm(lastZero.html),
        previousConfig: lastZero.config,
        previousOutcome: lastZero.outcome,
        userFeedback: feedback,
      });
      if (retry.kind === "config") {
        const extraction = extractCustomItems(lastZero.html, lastZero.url, retry.config);
        return buildSuccess(input.url, lastZero, retry, extraction);
      }
    }

    return {
      ok: false,
      error: `Nie udało mi się znaleźć listy publikacji w tym serwisie. Sprawdzone strony: ${[...visited].join(", ")}.${navigateNotes ? ` ${navigateNotes}` : ""} Wklej adres strony z listą aktualności albo podpowiedz, gdzie szukać (np. „to jest w zakładce Media → Komunikaty”).`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function buildSuccess(
  pastedUrl: string,
  page: { url: string; insecureTls: boolean },
  proposal: { sourceName: string; config: CustomFeedConfig; notes?: string },
  extraction: ReturnType<typeof extractCustomItems>,
): DiscoveryResult {
  const config: CustomFeedConfig = page.insecureTls
    ? { ...proposal.config, allowInsecureTls: true }
    : proposal.config;
  let discovered = true;
  try {
    discovered = validateFeedUrl(pastedUrl) !== page.url;
  } catch {
    // unparseable pasted URL — keep discovered=true so the UI shows where we landed
  }
  return {
    ok: true,
    url: page.url,
    discovered,
    sourceName: proposal.sourceName,
    notes: proposal.notes ?? "",
    config,
    totalItems: extraction.items.length,
    warnings: extraction.warnings,
    preview: extraction.items.slice(0, PREVIEW_LIMIT).map((i) => ({
      title: i.title,
      url: i.url,
      publishedAt: i.publishedAt?.toISOString() ?? null,
      excerpt: i.excerpt ?? null,
    })),
  };
}

type FetchedPage =
  | { ok: true; html: string; insecureTls: boolean }
  | { ok: false; error: string };

// Fetch with the TLS fallback some PL gov sites need (see http.ts), and an
// early bail for client-rendered pages the scraper can't read.
async function fetchPage(url: string): Promise<FetchedPage> {
  for (const allowInsecureTls of [false, true]) {
    try {
      const res = await scrapeFetch(url, { timeoutMs: 12_000, allowInsecureTls });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const html = await res.text();
      if (html.replace(/\s+/g, "").length < 500) {
        return {
          ok: false,
          error: "ta strona buduje swoją treść dopiero w przeglądarce, więc nie można jej odczytać automatycznie",
        };
      }
      return { ok: true, html, insecureTls: allowInsecureTls };
    } catch (e) {
      if (allowInsecureTls) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }
  return { ok: false, error: "unreachable" };
}

// Crawl guard: stay on the same site (subdomain moves like nik.gov.pl →
// www.nik.gov.pl are fine), never wander to third-party domains.
function sameSite(a: string, b: string): boolean {
  const ha = new URL(a).hostname.replace(/^www\./, "");
  const hb = new URL(b).hostname.replace(/^www\./, "");
  return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
}

function describeOutcome(r: ReturnType<typeof extractCustomItems>): string {
  const sample = r.items
    .slice(0, 5)
    .map(
      (i) =>
        `- "${i.title}" (${i.publishedAt?.toISOString().slice(0, 10) ?? "no date"}) excerpt: ${i.excerpt ? `"${i.excerpt.slice(0, 120)}…"` : "none"}`,
    )
    .join("\n");
  return [
    `itemSelector matched ${r.matchedElements} element(s); extracted ${r.items.length} item(s).`,
    r.warnings.length ? `Warnings: ${r.warnings.join("; ")}` : null,
    sample ? `Sample:\n${sample}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function validateFeedUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("To nie wygląda na prawidłowy adres URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Obsługiwane są tylko adresy http(s).");
  }
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^[\d.]+$/.test(host) || // literal IPv4
    host.includes(":") // literal IPv6
  ) {
    throw new Error("Adresy lokalne oraz adresy IP nie są dozwolone.");
  }
  return u.toString();
}
