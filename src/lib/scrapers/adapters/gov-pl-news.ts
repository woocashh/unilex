import * as cheerio from "cheerio";
import type { SourceAdapter, NormalizedItem } from "../types";

// Shared adapter for gov.pl/web/<ministry>/wiadomosci|aktualnosci pages.
// Each item lives inside .art-prev > ul > li:
//   <div class="event"><span class="date">DD.MM.YYYY</span></div>
//   <div class="title"><a href="/web/<ministry>/<slug>"> TITLE </a></div>
export const govPlNewsAdapter: SourceAdapter = {
  key: "gov-pl-news",
  async fetchItems({ baseUrl, fetch }): Promise<NormalizedItem[]> {
    const res = await fetch(baseUrl);
    if (!res.ok) throw new Error(`gov.pl ${baseUrl} returned ${res.status}`);
    const $ = cheerio.load(await res.text());

    const items: NormalizedItem[] = [];
    $(".art-prev ul li").each((_, el) => {
      const $el = $(el);
      const $a = $el.find(".title a").first();
      const href = $a.attr("href");
      const title = $a.text().trim();
      if (!href || !title) return;

      const url = new URL(href, baseUrl).toString();
      // Use the URL path as the externalId — gov.pl URLs are stable per article.
      const externalId = new URL(url).pathname;

      const dateText = $el.find(".event .date").first().text().trim();
      const publishedAt = parsePlDate(dateText);

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
