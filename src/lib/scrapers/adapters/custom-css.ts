import * as cheerio from "cheerio";
import { z } from "zod";
import { parse as parseDate, isValid } from "date-fns";
import { pl } from "date-fns/locale";
import { plural } from "@/lib/plural";
import type { SourceAdapter, NormalizedItem } from "../types";

// Config-driven adapter for user-added sources. The selector config is
// proposed by the feed setup agent (src/lib/ai/feedAgent.ts), refined with the
// user on /sources/new, and stored in sources.config.
export const customFeedConfigSchema = z.object({
  /** Matches one element per article in the listing. */
  itemSelector: z.string().min(1),
  /** Article link, resolved inside an item. Defaults to the first <a>. */
  linkSelector: z.string().optional(),
  /** Title text, resolved inside an item. Defaults to the link text. */
  titleSelector: z.string().optional(),
  /** Publication date text, resolved inside an item. */
  dateSelector: z.string().optional(),
  /** date-fns format for the date text, parsed with the pl locale. */
  dateFormat: z.string().optional(),
  /** Teaser/excerpt text, resolved inside an item. */
  excerptSelector: z.string().optional(),
  /** Keep only the first N extracted items (listing order ≈ newest first). */
  maxItems: z.number().int().min(1).max(100).optional(),
  /** Hex color for the feed's avatar in the app, e.g. "#1b5e20". */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** For sites whose CA chain Node doesn't trust (see http.ts). */
  allowInsecureTls: z.boolean().optional(),
});

export type CustomFeedConfig = z.infer<typeof customFeedConfigSchema>;

export type CustomExtractResult = {
  items: NormalizedItem[];
  /** Human-readable issues for the setup preview ("0 items matched", …). */
  warnings: string[];
  /** How many elements itemSelector matched before link/title filtering. */
  matchedElements: number;
};

// Tried in order after config.dateFormat. Polish month names come from the
// pl locale ("d MMMM yyyy" → "12 maja 2026").
const FALLBACK_DATE_FORMATS = [
  "dd.MM.yyyy",
  "d.M.yyyy",
  "yyyy-MM-dd",
  "dd-MM-yyyy",
  "d MMMM yyyy",
  "d MMM yyyy",
];

export function extractCustomItems(
  html: string,
  baseUrl: string,
  config: CustomFeedConfig,
): CustomExtractResult {
  const $ = cheerio.load(html);
  const items: NormalizedItem[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let datesMissing = 0;

  const matched = $(config.itemSelector);
  matched.each((_, el) => {
    const $el = $(el);
    const $link = $el.is("a")
      ? $el
      : $el.find(config.linkSelector ?? "a").first();
    const href = $link.attr("href")?.trim();
    // Sites often nest the date (or teaser) inside the title element; CSS
    // can't express "text minus child", so drop those nodes from a clone.
    // Each strip falls back to the previous text if it empties the title
    // (e.g. when the excerpt selector turns out to wrap the title itself).
    const $title = (
      config.titleSelector ? $el.find(config.titleSelector).first() : $link
    ).clone();
    const fullTitle = clean($title.text());
    if (config.dateSelector) $title.find(config.dateSelector).remove();
    const withoutDate = clean($title.text()) || fullTitle;
    if (config.excerptSelector) $title.find(config.excerptSelector).remove();
    const title = clean($title.text()) || withoutDate;
    if (!href || !title) return;
    if (href.startsWith("javascript:") || href.startsWith("#")) return;

    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      return;
    }
    const externalId = url.pathname + url.search;
    if (seen.has(externalId)) return;
    seen.add(externalId);

    let publishedAt: Date | undefined;
    if (config.dateSelector) {
      const $date = $el.find(config.dateSelector).first();
      // <time datetime="…"> is more reliable than its rendered text.
      const dateText = $date.attr("datetime")?.trim() || clean($date.text());
      publishedAt = parseItemDate(dateText, config.dateFormat);
      if (!publishedAt) datesMissing++;
    }

    const excerpt = config.excerptSelector
      ? clean($el.find(config.excerptSelector).first().text()) || undefined
      : undefined;

    items.push({ externalId, url: url.toString(), title, publishedAt, excerpt });
  });

  // Warnings are shown in the setup chat to nontechnical users — describe
  // what they see (articles, dates), not selectors.
  if (matched.length === 0) {
    warnings.push("nie udało się znaleźć żadnych pozycji na tej stronie");
  } else if (items.length === 0) {
    warnings.push(
      `znaleziono ${matched.length} ${plural(matched.length, "element", "elementy", "elementów")} listy, ale z żadnego nie udało się odczytać tytułu i linku`,
    );
  }
  if (!config.dateSelector) {
    warnings.push("pozycje nie będą miały daty publikacji");
  } else if (datesMissing > 0) {
    warnings.push(
      `${datesMissing} z ${items.length} pozycji ${plural(datesMissing, "ma", "mają", "ma")} datę, której nie udało się odczytać`,
    );
  }

  const limited = config.maxItems ? items.slice(0, config.maxItems) : items;
  return { items: limited, warnings, matchedElements: matched.length };
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parseItemDate(text: string, format?: string): Date | undefined {
  if (!text) return undefined;
  // Pull a date-shaped substring out of surrounding label text ("Data: …").
  const candidate =
    /\d{4}-\d{2}-\d{2}(?:[T ][\d:.+Z]+)?/.exec(text)?.[0] ??
    /\d{1,2}\.\d{1,2}\.\d{4}/.exec(text)?.[0] ??
    /\d{1,2}[\s ]+\p{L}+[\s ]+\d{4}/u.exec(text)?.[0]?.replace(/[\s ]+/g, " ") ??
    text;

  const formats = format
    ? [format, ...FALLBACK_DATE_FORMATS]
    : FALLBACK_DATE_FORMATS;
  for (const f of formats) {
    const d = parseDate(candidate, f, new Date(), { locale: pl });
    if (isValid(d)) return d;
  }
  // Last resort: ISO timestamps (e.g. from <time datetime>).
  const iso = new Date(candidate);
  return isValid(iso) ? iso : undefined;
}

export const customCssAdapter: SourceAdapter = {
  key: "custom-css",
  async fetchItems({ baseUrl, fetch, config }): Promise<NormalizedItem[]> {
    const parsed = customFeedConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new Error(`Invalid custom feed config: ${parsed.error.message}`);
    }
    const res = await fetch(baseUrl, {
      allowInsecureTls: parsed.data.allowInsecureTls,
    });
    if (!res.ok) throw new Error(`${baseUrl} returned ${res.status}`);
    return extractCustomItems(await res.text(), baseUrl, parsed.data).items;
  },
};
