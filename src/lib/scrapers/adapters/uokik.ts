import * as cheerio from "cheerio";
import type { SourceAdapter, NormalizedItem } from "../types";

// UOKiK — Aktualności. Each item is an <article> with:
//   <div class="post_date">DD.MM.YYYY</div>
//   <div class="post-title"><h3><a href="...">TITLE</a></h3></div>
export const uokikAdapter: SourceAdapter = {
  key: "uokik",
  async fetchItems({ baseUrl, fetch }): Promise<NormalizedItem[]> {
    const res = await fetch(baseUrl);
    if (!res.ok) throw new Error(`UOKiK ${baseUrl} returned ${res.status}`);
    const $ = cheerio.load(await res.text());

    const items: NormalizedItem[] = [];
    $("article").each((_, el) => {
      const $el = $(el);
      const $a = $el.find(".post-title h3 a").first();
      const href = $a.attr("href");
      const title = $a.text().trim();
      if (!href || !title) return;

      const url = new URL(href, baseUrl).toString();
      const externalId = new URL(url).pathname.replace(/^\/|\/$/g, "") || url;

      const dateText = $el.find(".post_date").first().text().trim();
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
