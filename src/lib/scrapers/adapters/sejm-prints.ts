import type { SourceAdapter, NormalizedItem } from "../types";

// Sejm — druki (prints). Bills/proposals filed in the current Sejm term.
// Uses the official api.sejm.gov.pl (no bot wall). Surfaces newest filings.
const API = "https://api.sejm.gov.pl/sejm/term10/prints";
// PDFs are served by the same API host — open access, no bot wall.
// (orka.sejm.gov.pl has an F5 TSPD JS challenge that returns HTML.)
const ATTACHMENT_BASE = "https://api.sejm.gov.pl/sejm/term10/prints";
// Bot-walled in browser-less fetches but works in a real browser.
const PUBLIC_BASE = "https://www.sejm.gov.pl/Sejm10.nsf/druk.xsp";
const MAX_ITEMS = 200;

type ApiPrint = {
  number: string;
  title?: string;
  documentDate?: string; // YYYY-MM-DD
  deliveryDate?: string;
  changeDate?: string;
  attachments?: string[];
  processPrint?: string[];
  term?: number;
};

export const sejmPrintsAdapter: SourceAdapter = {
  key: "sejm-prints",
  async fetchItems({ fetch }): Promise<NormalizedItem[]> {
    const res = await fetch(API, {
      headers: { accept: "application/json" },
      timeoutMs: 25_000,
    });
    if (!res.ok) throw new Error(`Sejm prints API ${res.status}`);
    const prints = (await res.json()) as ApiPrint[];

    const items: NormalizedItem[] = [];
    for (const p of prints) {
      if (!p.number || !p.title) continue;
      const publishedAt = parseISODate(p.documentDate);
      if (!publishedAt) continue;

      const attachment = p.attachments?.[0];
      // Prefer the raw PDF (no bot wall) when present; fall back to the
      // public detail page (works in a browser).
      const url = attachment
        ? `${ATTACHMENT_BASE}/${p.number}/${attachment}`
        : `${PUBLIC_BASE}?nr=${p.number}`;

      items.push({
        externalId: `druk-${p.number}`,
        url,
        title: `Druk nr ${p.number} — ${p.title}`,
        publishedAt,
        excerpt: p.title.slice(0, 280),
        fullText: composeFullText(p),
      });
    }

    items.sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime());
    return items.slice(0, MAX_ITEMS);
  },
};

function composeFullText(p: ApiPrint): string {
  const parts: string[] = [];
  parts.push(`Druk nr: ${p.number}`);
  if (p.documentDate) parts.push(`Data dokumentu: ${p.documentDate}`);
  if (p.deliveryDate) parts.push(`Data wpływu: ${p.deliveryDate}`);
  if (p.changeDate) parts.push(`Ostatnia zmiana: ${p.changeDate.slice(0, 10)}`);
  if (p.processPrint?.length) parts.push(`Powiązane druki: ${p.processPrint.join(", ")}`);

  if (p.attachments?.length) {
    parts.push("", "ZAŁĄCZNIKI");
    for (const a of p.attachments) {
      parts.push(`- ${a}: ${ATTACHMENT_BASE}/${p.number}/${a}`);
    }
  }

  if (p.title) {
    parts.push("", "TYTUŁ", p.title);
  }
  return parts.join("\n");
}

function parseISODate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
