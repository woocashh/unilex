import * as cheerio from "cheerio";
import type { SourceAdapter, NormalizedItem } from "../types";

// UODO — Aktualności. Items are <a class="ui-card"> with .ui-card__title and
// a DD.MM.YYYY date inside .ui-card__description > span. Many ui-card elements
// on the page are menu tiles without a date — we filter those out by requiring
// a parseable date AND a URL path that matches /pl/<num>/<num>.
export const uodoAdapter: SourceAdapter = {
  key: "uodo",
  async fetchItems({ baseUrl, fetch }): Promise<NormalizedItem[]> {
    const res = await fetch(baseUrl, { allowInsecureTls: true });
    if (!res.ok) throw new Error(`UODO ${baseUrl} returned ${res.status}`);
    const $ = cheerio.load(await res.text());

    const items: NormalizedItem[] = [];
    $("a.ui-card").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      const title = $el.find(".ui-card__title").first().text().trim();
      if (!href || !title) return;

      const url = new URL(href, baseUrl).toString();
      // News items live at /pl/<sectionId>/<articleId> — the article ID is
      // the trailing segment. Anchor to the end so the regex doesn't grab
      // the section ID (which would collapse 700+ items onto one external_id
      // and silently dedupe everything to a single row).
      const path = new URL(url).pathname;
      const idMatch = /\/\d+\/(\d+)$/.exec(path);
      if (!idMatch) return;
      const externalId = idMatch[1];

      const dateText = $el.find(".ui-card__description span").first().text().trim();
      const publishedAt = parsePlDate(dateText);
      // News cards always have a date — skip if missing (probably a menu tile).
      if (!publishedAt) return;

      items.push({ externalId, url, title, publishedAt });
    });

    return items;
  },
};

function parsePlDate(s: string): Date | undefined {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
}
