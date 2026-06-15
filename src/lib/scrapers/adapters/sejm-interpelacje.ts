import type { SourceAdapter, NormalizedItem } from "../types";

// Sejm — interpelacje. Parliamentary interpellations: written questions from
// MPs to government officials, plus replies. Uses the official Sejm API.
//
// The API exposes a `since` filter (matched against lastModified). We pass
// `since=<lookback>` and get every interpellation touched in the window in a
// single call — no offset/total juggling. We still filter the result set
// down to items whose receiptDate is within lookback so we only alert on
// genuinely new interpellations, not ancient ones that just got a reply.
// (The `sort` param is blocked by the upstream WAF.)
const API = "https://api.sejm.gov.pl/sejm/term10/interpellations";
const PUBLIC_BASE = "https://sejm.gov.pl/sejm10.nsf/interpelacja.xsp";
const LOOKBACK_DAYS = 30;
// API sorts by num ASC and the WAF blocks ?sort=, so we have to fetch every
// item modified in the window in one shot — otherwise the highest (newest)
// nums get truncated. ~700 items in a 30-day window ≈ 600KB.
const PAGE_LIMIT = 2000;
const MAX_ITEMS = 200;

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

    // DIAGNOSTIC: log how fresh the API response is as seen from Vercel. If
    // maxNum/maxReceipt lag the public API (currently num 17724 / 2026-06-11),
    // the cloud-IP staleness is confirmed and we switch to per-item cursor
    // fetching. Remove once the root cause is resolved.
    let maxNum = 0;
    let maxReceipt = "";
    for (const it of list) {
      if (typeof it.num === "number" && it.num > maxNum) maxNum = it.num;
      if (it.receiptDate && it.receiptDate > maxReceipt) maxReceipt = it.receiptDate;
    }
    console.log(
      `[sejm-interpelacje] api returned ${list.length} items; ` +
        `maxNum=${maxNum} maxReceipt=${maxReceipt} since=${sinceDay} limit=${limit}`,
    );

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
