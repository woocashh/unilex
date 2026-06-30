import type { SourceAdapter, NormalizedItem, AdapterContext } from "../types";

const API = "https://api.sejm.gov.pl/sejm/term10/interpellations";
const PUBLIC_BASE = "https://sejm.gov.pl/sejm10.nsf/interpelacja.xsp";
const LOOKBACK_DAYS = 30;
const PAGE_LIMIT = 2000;
const MAX_ITEMS = 200;
// Individual-item probing: the Sejm CDN caches the list endpoint for cloud
// IPs, so we supplement with /interpellations/{num} fetches for items above
// the list's max num. Stop after this many consecutive 404s (handles sparse
// gaps in the numbering).
const PROBE_BATCH = 30;
const PROBE_MAX_CONSECUTIVE_MISS = 40;
const PROBE_MAX_ITEMS = 1500;

type Link = { rel: string; href: string };
type Attachment = { URL: string; name: string; lastModified?: string };
type Reply = {
  from?: string;
  receiptDate?: string;
  prolongation?: boolean;
  onlyAttachment?: boolean;
  attachments?: Attachment[];
  links?: Link[];
};
type Recipient = { name?: string; sent?: string; answerDelayedDays?: number };
type ApiInterpellation = {
  num: number;
  title?: string;
  receiptDate?: string;
  sentDate?: string;
  lastModified?: string;
  answerDelayedDays?: number;
  from?: string[];
  recipientDetails?: Recipient[];
  replies?: Reply[];
  links?: Link[];
};

export const sejmInterpelacjeAdapter: SourceAdapter = {
  key: "sejm-interpelacje",
  async fetchItems(ctx): Promise<NormalizedItem[]> {
    const cutoffMs = Date.now() - LOOKBACK_DAYS * 86_400_000;
    const sinceDay = new Date(cutoffMs).toISOString().slice(0, 10);

    // The list endpoint appears to serve Vercel's cloud egress IPs a stale
    // snapshot (frozen since early June while the public API is current). Bust
    // any naive edge cache two ways: jitter the `limit` (a param the WAF
    // accepts, so the query-string cache key changes every run) and send
    // no-cache request headers. `limit` stays oversized so nothing is dropped.
    const limit = PAGE_LIMIT + (Date.now() % 100);
    const res = await ctx.fetch(
      `${API}?limit=${limit}&since=${sinceDay}`,
      {
        headers: {
          accept: "application/json",
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
        timeoutMs: 30_000,
      },
    );
    if (!res.ok) throw new Error(`Sejm interpellations API ${res.status}`);
    const list = (await res.json()) as ApiInterpellation[];

    let maxNum = 0;
    let maxReceipt = "";
    for (const it of list) {
      if (typeof it.num === "number" && it.num > maxNum) maxNum = it.num;
      if (it.receiptDate && it.receiptDate > maxReceipt) maxReceipt = it.receiptDate;
    }
    console.log(
      `[sejm-interpelacje] list returned ${list.length} items; ` +
        `maxNum=${maxNum} maxReceipt=${maxReceipt} since=${sinceDay} limit=${limit}`,
    );

    // The Sejm CDN caches the list endpoint for cloud IPs, making it lag
    // the real state by days/weeks. Supplement by probing individual item
    // endpoints (/interpellations/{num}) starting above the list's max.
    const probed = await probeNewItems(ctx, maxNum);
    if (probed.length) {
      const seen = new Set(list.map((it) => it.num));
      for (const p of probed) {
        if (!seen.has(p.num)) {
          list.push(p);
          seen.add(p.num);
        }
      }
      const probedMax = probed.reduce((m, it) => Math.max(m, it.num ?? 0), 0);
      console.log(
        `[sejm-interpelacje] probed ${probed.length} new items above list max; ` +
          `probedMax=${probedMax}`,
      );
    }

    const items: NormalizedItem[] = [];
    for (const it of list) {
      if (!it.num || !it.title) continue;
      const publishedAt = parseISODate(it.receiptDate);
      if (!publishedAt || publishedAt.getTime() < cutoffMs) continue;

      const webLink =
        it.links?.find((l) => l.rel === "web-description")?.href ??
        `${PUBLIC_BASE}?typ=int&nr=${it.num}`;

      items.push({
        externalId: `interp-${it.num}`,
        url: webLink,
        title: `Interpelacja nr ${it.num} — ${it.title}`,
        publishedAt,
        excerpt: it.title.slice(0, 280),
        fullText: composeFullText(it),
      });
    }

    items.sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime());
    return items.slice(0, MAX_ITEMS);
  },
};

async function probeNewItems(
  ctx: AdapterContext,
  startAfterNum: number,
): Promise<ApiInterpellation[]> {
  if (startAfterNum <= 0) return [];
  const found: ApiInterpellation[] = [];
  let consecutiveMiss = 0;

  for (
    let base = startAfterNum + 1;
    consecutiveMiss < PROBE_MAX_CONSECUTIVE_MISS &&
    found.length < PROBE_MAX_ITEMS &&
    Date.now() < ctx.deadline.getTime() - 5_000;
    base += PROBE_BATCH
  ) {
    const nums = Array.from({ length: PROBE_BATCH }, (_, i) => base + i);
    const results = await Promise.allSettled(
      nums.map((n) => fetchOne(ctx, n)),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        found.push(r.value);
        consecutiveMiss = 0;
      } else {
        consecutiveMiss++;
      }
    }
  }
  return found;
}

async function fetchOne(
  ctx: AdapterContext,
  num: number,
): Promise<ApiInterpellation | null> {
  try {
    const res = await ctx.fetch(`${API}/${num}`, {
      headers: { accept: "application/json" },
      timeoutMs: 10_000,
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiInterpellation;
  } catch {
    return null;
  }
}

function composeFullText(it: ApiInterpellation): string {
  const parts: string[] = [];
  parts.push(`Numer interpelacji: ${it.num}`);
  if (it.receiptDate) parts.push(`Data wpływu: ${it.receiptDate}`);
  if (it.sentDate) parts.push(`Skierowana: ${it.sentDate}`);
  if (it.lastModified) parts.push(`Ostatnia zmiana: ${it.lastModified.slice(0, 10)}`);
  if (typeof it.answerDelayedDays === "number" && it.answerDelayedDays > 0) {
    parts.push(`Opóźnienie odpowiedzi: ${it.answerDelayedDays} dni`);
  }

  if (it.recipientDetails?.length) {
    parts.push("", "ADRESACI");
    for (const r of it.recipientDetails) {
      const bits = [r.name, r.sent ? `(wysłano ${r.sent})` : null].filter(Boolean);
      parts.push(`- ${bits.join(" ")}`);
    }
  }

  if (it.replies?.length) {
    parts.push("", `ODPOWIEDZI (${it.replies.length})`);
    for (const r of it.replies) {
      const head = [r.from, r.receiptDate ? `· ${r.receiptDate}` : null]
        .filter(Boolean)
        .join(" ");
      parts.push(`- ${head || "(brak danych)"}`);
      if (r.attachments?.length) {
        for (const a of r.attachments) parts.push(`  · ${a.name}: ${a.URL}`);
      }
    }
  } else {
    parts.push("", "ODPOWIEDZI", "Brak odpowiedzi.");
  }

  if (it.title) parts.push("", "TYTUŁ", it.title);
  return parts.join("\n");
}

function parseISODate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
