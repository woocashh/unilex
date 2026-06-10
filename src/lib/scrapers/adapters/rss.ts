import * as cheerio from "cheerio";
import type { SourceAdapter, NormalizedItem } from "../types";

// Generic RSS 2.0 / Atom adapter. Useful where the HTML sits behind bot
// protection but the feed endpoint is open — e.g. rf.gov.pl (Incapsula) at
// https://rf.gov.pl/category/aktualnosci/feed/. base_url is the feed URL.
export const rssAdapter: SourceAdapter = {
  key: "rss",
  async fetchItems({ baseUrl, fetch }): Promise<NormalizedItem[]> {
    const res = await fetch(baseUrl, {
      headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    });
    if (!res.ok) throw new Error(`${baseUrl} returned ${res.status}`);
    const $ = cheerio.load(await res.text(), { xml: true });

    const items: NormalizedItem[] = [];

    // RSS 2.0
    $("item").each((_, el) => {
      const $el = $(el);
      const title = $el.find("title").first().text().trim();
      const link = $el.find("link").first().text().trim();
      if (!title || !link) return;

      // WordPress puts the article body in content:encoded — saving it as
      // full_text lets the alert page and summarizer skip the HTML scrape
      // (which the bot wall would block anyway).
      const fullText = htmlToText($el.find("content\\:encoded").first().text());

      items.push({
        externalId: $el.find("guid").first().text().trim() || urlId(link, baseUrl),
        url: link,
        title,
        publishedAt: parseFeedDate($el.find("pubDate").first().text()),
        excerpt: htmlToText($el.find("description").first().text())?.slice(0, 500),
        fullText,
      });
    });

    if (items.length > 0) return items;

    // Atom
    $("entry").each((_, el) => {
      const $el = $(el);
      const title = $el.find("title").first().text().trim();
      const link =
        $el.find('link[rel="alternate"]').attr("href")?.trim() ||
        $el.find("link").attr("href")?.trim() ||
        "";
      if (!title || !link) return;

      items.push({
        externalId: $el.find("id").first().text().trim() || urlId(link, baseUrl),
        url: link,
        title,
        publishedAt: parseFeedDate(
          $el.find("published").first().text() || $el.find("updated").first().text(),
        ),
        excerpt: htmlToText($el.find("summary").first().text())?.slice(0, 500),
        fullText: htmlToText($el.find("content").first().text()),
      });
    });

    return items;
  },
};

function htmlToText(html: string): string | undefined {
  if (!html.trim()) return undefined;
  const text = cheerio.load(html).root().text().replace(/\s+/g, " ").trim();
  return text || undefined;
}

// RSS dates are RFC 822, Atom dates ISO 8601 — Date.parse handles both.
function parseFeedDate(s: string): Date | undefined {
  if (!s.trim()) return undefined;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? undefined : d;
}

function urlId(link: string, baseUrl: string): string {
  try {
    const u = new URL(link, baseUrl);
    return u.pathname + u.search;
  } catch {
    return link;
  }
}
