import * as cheerio from "cheerio";
import type { SourceAdapter, NormalizedItem } from "../types";

// KNF — Komunikaty. Different layout from /aktualnosci: each item is a long
// utility-class <a> linking to /komunikacja/komunikaty?articleId=... with the
// title in the `title` attribute and also rendered as <h6>.
// Date is rendered as a separate "DD MMM YYYY" string near the link.
const MONTHS_PL_FULL: Record<string, number> = {
  styczeń: 0, stycznia: 0,
  luty: 1, lutego: 1,
  marzec: 2, marca: 2,
  kwiecień: 3, kwietnia: 3,
  maj: 4, maja: 4,
  czerwiec: 5, czerwca: 5,
  lipiec: 6, lipca: 6,
  sierpień: 7, sierpnia: 7,
  wrzesień: 8, września: 8,
  październik: 9, października: 9,
  listopad: 10, listopada: 10,
  grudzień: 11, grudnia: 11,
};

export const knfKomunikatyAdapter: SourceAdapter = {
  key: "knf-komunikaty",
  async fetchItems({ baseUrl, fetch }): Promise<NormalizedItem[]> {
    const res = await fetch(baseUrl);
    if (!res.ok) throw new Error(`KNF komunikaty ${baseUrl} returned ${res.status}`);
    const $ = cheerio.load(await res.text());

    const items: NormalizedItem[] = [];
    $('a[href*="/komunikacja/komunikaty?articleId="]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      const titleAttr = $el.attr("title")?.trim();
      const titleText = $el.find("h6").first().text().trim() || $el.text().trim();
      const title = titleAttr || titleText;
      if (!href || !title) return;

      const url = new URL(href, baseUrl).toString();
      const articleId = new URL(url).searchParams.get("articleId");
      if (!articleId) return;

      // Date is rendered inside the link or just below; try several places.
      const dateText = $el.find("[class*='date']").first().text().trim()
        || $el.text().match(/\b\d{1,2}\s+\p{L}+\s+\d{4}\b/u)?.[0]
        || "";
      const publishedAt = parsePlLongDate(dateText);

      items.push({ externalId: articleId, url, title, publishedAt });
    });

    // Dedupe by articleId
    const seen = new Set<string>();
    return items.filter((i) => (seen.has(i.externalId) ? false : seen.add(i.externalId)));
  },
};

function parsePlLongDate(s: string): Date | undefined {
  const m = /^(\d{1,2})\s+(\p{L}+)\s+(\d{4})$/u.exec(s.trim());
  if (!m) return undefined;
  const month = MONTHS_PL_FULL[m[2].toLowerCase()];
  if (month === undefined) return undefined;
  return new Date(Date.UTC(+m[3], month, +m[1]));
}
