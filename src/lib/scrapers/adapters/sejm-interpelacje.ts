import type { SourceAdapter, NormalizedItem, AdapterContext } from "../types";

// Sejm — interpelacje. Parliamentary interpellations: written questions from
// MPs to government officials, plus replies. Uses the official Sejm API.
//
// The list endpoint orders by interpellation number ascending and exposes no
// "sort desc" or "since by receiptDate" param — so we binary-search the total
// count, then fetch the tail (newest items).
const API = "https://api.sejm.gov.pl/sejm/term10/interpellations";
const PUBLIC_BASE = "https://sejm.gov.pl/sejm10.nsf/interpelacja.xsp";
const LOOKBACK_DAYS = 30;
const TAIL_FETCH = 500;
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
    const total = await findTotal(ctx);
    if (total === 0) return [];

    const tailOffset = Math.max(0, total - TAIL_FETCH);
    const res = await ctx.fetch(`${API}?limit=${TAIL_FETCH}&offset=${tailOffset}`, {
      headers: { accept: "application/json" },
      timeoutMs: 25_000,
    });
    if (!res.ok) throw new Error(`Sejm interpellations API ${res.status}`);
    const list = (await res.json()) as ApiInterpellation[];

    const cutoffMs = Date.now() - LOOKBACK_DAYS * 86_400_000;
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

/**
 * Binary-search the offset that just barely returns items. Returns the
 * approximate total count (good to within ~20).
 */
async function findTotal(ctx: AdapterContext): Promise<number> {
  // First expand: 1k, 2k, 4k, … until offset is past total.
  let lo = 0;
  let hi = 1_000;
  while (hi < 200_000) {
    const r = await probe(ctx, hi);
    if (r) {
      lo = hi;
      hi *= 2;
    } else {
      break;
    }
  }
  if (lo === 0) return 0;

  // Narrow within (lo, hi) to ~20-row precision.
  while (hi - lo > 20) {
    const mid = Math.floor((lo + hi) / 2);
    const r = await probe(ctx, mid);
    if (r) lo = mid;
    else hi = mid;
  }
  return lo + 20;
}

async function probe(ctx: AdapterContext, offset: number): Promise<boolean> {
  const r = await ctx.fetch(`${API}?limit=1&offset=${offset}`, {
    headers: { accept: "application/json" },
    timeoutMs: 10_000,
  });
  if (!r.ok) return false;
  const arr = (await r.json()) as ApiInterpellation[];
  return Array.isArray(arr) && arr.length > 0;
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
