import * as cheerio from "cheerio";
import type { SourceAdapter, NormalizedItem } from "../types";

const MONTHS_PL: Record<string, number> = {
  STY: 0, LUT: 1, MAR: 2, KWI: 3, MAJ: 4, CZE: 5,
  LIP: 6, SIE: 7, WRZ: 8, PAź: 9, PAZ: 9, LIS: 10, GRU: 11,
};

// KNF — Aktualności. Each news item is an <a class="...news-card..."> with a
// day chip <h5>, month-abbrev chip <p.text-sm>, and a title <p.text-base>.
// External ID comes from the `articleId` query parameter on the link.
export const knfAdapter: SourceAdapter = {
  key: "knf",
  async fetchItems({ baseUrl, fetch }): Promise<NormalizedItem[]> {
    const res = await fetch(baseUrl);
    if (!res.ok) throw new Error(`KNF ${baseUrl} returned ${res.status}`);
    const $ = cheerio.load(await res.text());
    const year = new Date().getUTCFullYear();

    const items: NormalizedItem[] = [];
    $("a.news-card").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      const title = $el.find("p.text-base").first().text().trim();
      if (!href || !title) return;

      const url = new URL(href, baseUrl).toString();
      const articleId = new URL(url).searchParams.get("articleId") ?? url;
      const day = parseInt($el.find("h5").first().text().trim(), 10);
      const monthAbbr = $el.find("p.text-sm").first().text().trim().toUpperCase();
      const month = MONTHS_PL[monthAbbr];

      const publishedAt =
        Number.isFinite(day) && month !== undefined
          ? new Date(Date.UTC(year, month, day))
          : undefined;

      items.push({ externalId: articleId, url, title, publishedAt });
    });

    return items;
  },
};
