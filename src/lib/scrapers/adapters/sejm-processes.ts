import type { SourceAdapter, NormalizedItem } from "../types";

// Sejm — legislative processes. Each row is one act-level process (a project
// may bundle multiple druki). We surface items with recent `changeDate` so
// the feed reflects activity, not just initial filing.
const API = "https://api.sejm.gov.pl/sejm/term10/processes";
// Bot-walled in headless but works in a browser.
const PUBLIC_BASE = "https://www.sejm.gov.pl/Sejm10.nsf/PrzebiegProc.xsp";
const MAX_ITEMS = 200;
const LOOKBACK_DAYS = 90;

type ApiProcess = {
  number: string;
  title?: string;
  documentType?: string;
  documentDate?: string;
  changeDate?: string;
  closureDate?: string;
  displayAddress?: string;
  ELI?: string;
  passed?: boolean;
  printsConsideredJointly?: string[];
  links?: { rel: string; href: string }[];
};

export const sejmProcessesAdapter: SourceAdapter = {
  key: "sejm-processes",
  async fetchItems({ fetch }): Promise<NormalizedItem[]> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 19); // YYYY-MM-DDTHH:mm:ss — LocalDateTime per Sejm OpenAPI.
    const url = `${API}?limit=${MAX_ITEMS}&modifiedSince=${encodeURIComponent(since)}`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      timeoutMs: 25_000,
    });
    if (!res.ok) throw new Error(`Sejm processes API ${res.status}`);
    const procs = (await res.json()) as ApiProcess[];

    const items: NormalizedItem[] = [];
    for (const p of procs) {
      if (!p.number) continue;
      // We use changeDate (latest activity) as published_at — that matches
      // "this process moved recently" semantics, more useful than the
      // original filing date for an activity feed.
      const publishedAt = parseDateTime(p.changeDate) ?? parseISODate(p.documentDate);
      if (!publishedAt) continue;

      const title = p.title?.trim() || `${p.documentType ?? "Proces"} nr ${p.number}`;
      const eliLink = p.links?.find((l) => l.rel === "eli")?.href;
      const isapLink = p.links?.find((l) => l.rel === "isap")?.href;
      // Prefer published-act link (eli/isap) over the bot-walled Sejm detail page.
      const url = eliLink ?? isapLink ?? `${PUBLIC_BASE}?nr=${p.number}`;

      items.push({
        externalId: `proc-${p.number}`,
        url,
        title: `Proces nr ${p.number} — ${title}`,
        publishedAt,
        excerpt: [p.documentType, p.displayAddress].filter(Boolean).join(" · "),
        fullText: composeFullText(p),
      });
    }

    items.sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime());
    return items.slice(0, MAX_ITEMS);
  },
};

function composeFullText(p: ApiProcess): string {
  const parts: string[] = [];
  parts.push(`Numer procesu: ${p.number}`);
  if (p.documentType) parts.push(`Rodzaj dokumentu: ${p.documentType}`);
  if (p.documentDate) parts.push(`Data dokumentu: ${p.documentDate}`);
  if (p.changeDate) parts.push(`Ostatnia zmiana: ${p.changeDate.slice(0, 16).replace("T", " ")}`);
  if (p.closureDate) parts.push(`Data zakończenia: ${p.closureDate}`);
  if (p.displayAddress) parts.push(`Publikacja: ${p.displayAddress}`);
  if (p.ELI) parts.push(`ELI: ${p.ELI}`);
  if (p.passed !== undefined) parts.push(`Przyjęte: ${p.passed ? "tak" : "nie"}`);
  if (p.printsConsideredJointly?.length) {
    parts.push(`Druki rozpatrywane łącznie: ${p.printsConsideredJointly.join(", ")}`);
  }

  if (p.links?.length) {
    parts.push("", "LINKI");
    for (const l of p.links) parts.push(`- ${l.rel}: ${l.href}`);
  }

  if (p.title) parts.push("", "TYTUŁ", p.title);
  return parts.join("\n");
}

function parseISODate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function parseDateTime(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}
