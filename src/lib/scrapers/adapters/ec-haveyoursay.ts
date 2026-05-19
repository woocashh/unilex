import type { SourceAdapter, NormalizedItem } from "../types";

// EU Commission "Have Your Say" — JSON API behind the SPA. We pull the
// most recent initiatives across all stages, prefer Polish translations
// of titles, and link back to the public PL detail page.
const API = "https://ec.europa.eu/info/law/better-regulation/brpapi/searchInitiatives";
const SIZE = 50;
const DETAIL_BASE = "https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives";

type Translation = { value: string; language: string; field: string };
type Status = {
  frontEndStage?: string;
  feedbackStartDate?: string; // "YYYY/MM/DD HH:mm:ss"
  isCurrent?: boolean;
};
type Initiative = {
  id?: number;
  reference?: string;
  shortTitle?: string;
  initiativeTranslations?: Translation[];
  currentStatuses?: Status[];
};
type ApiResponse = {
  initiativeResultDtoPage?: { content?: Initiative[] };
};

export const ecHaveYourSayAdapter: SourceAdapter = {
  key: "ec-haveyoursay",
  async fetchItems({ fetch }): Promise<NormalizedItem[]> {
    // Default order is freshness-by-most-recent-status — known sort fields
    // (startDate, feedbackStartDate) return 406 on this endpoint.
    const url = `${API}?language=PL&size=${SIZE}`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      timeoutMs: 20_000,
    });
    if (!res.ok) throw new Error(`EC API returned ${res.status}`);
    const json = (await res.json()) as ApiResponse;
    const content = json.initiativeResultDtoPage?.content ?? [];

    const items: NormalizedItem[] = [];
    for (const it of content) {
      if (!it.id) continue;
      const id = String(Math.trunc(it.id));

      // Prefer Polish translation of the title, fall back to English shortTitle.
      const pl = it.initiativeTranslations?.find(
        (t) => t.language === "PL" && t.field === "SHORT_TITLE",
      )?.value;
      const title = (pl || it.shortTitle || "").trim();
      if (!title) continue;

      const status =
        it.currentStatuses?.find((s) => s.isCurrent) ?? it.currentStatuses?.[0];
      const publishedAt = parseEcDate(status?.feedbackStartDate);

      items.push({
        externalId: it.reference || id,
        url: `${DETAIL_BASE}/${id}_pl`,
        title,
        publishedAt,
        excerpt: status?.frontEndStage
          ? humanizeStage(status.frontEndStage)
          : undefined,
      });
    }
    return items;
  },
};

function parseEcDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  // Format: "2026/05/13 15:08:21"
  const m = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

function humanizeStage(stage: string): string {
  // Display-friendly labels for the most common stages.
  const map: Record<string, string> = {
    PLANNING_WORKFLOW: "Etap planowania",
    PUBLIC_CONSULTATION: "Konsultacje publiczne",
    FEEDBACK_PERIOD: "Okres opinii publicznej",
    ADOPTED: "Przyjęte",
  };
  return map[stage] ?? stage.replace(/_/g, " ").toLowerCase();
}
