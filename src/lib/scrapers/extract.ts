import * as cheerio from "cheerio";

const STRIP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "aside",
  "iframe",
  "svg",
  "form",
  ".cookie",
  "[class*='cookie']",
  "[class*='menu']",
  "[class*='nav']",
  "[class*='footer']",
  "[class*='breadcrumb']",
  "[class*='related']",
  "[class*='share']",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  // Visually-hidden elements often hold widget config or accessibility text
  // that shouldn't appear in extracted body. gov.pl uses <pre id="pageMetadata"
  // class="hide">{...JSON...}</pre> for its Vue widgets.
  ".hide",
  "[hidden]",
  "[aria-hidden='true']",
  "#pageMetadata",
  "pre#pageMetadata",
];

const ARTICLE_SELECTORS = [
  "article",
  "main",
  "[role='main']",
  ".article-area__article",
  ".editor-content",
  ".content",
  "#content",
  ".post-content",
];

/**
 * Generic article body extractor. Strips boilerplate, then picks the
 * largest plausible content container by text length and returns plain text.
 * Designed for Polish gov listing/article pages — accurate enough for LLM
 * summarization input without a full Readability port.
 */
export function extractArticleText(html: string): string {
  const $ = cheerio.load(html);

  for (const sel of STRIP_SELECTORS) {
    $(sel).remove();
  }

  let best = "";
  for (const sel of ARTICLE_SELECTORS) {
    $(sel).each((_, el) => {
      const text = normalize($(el).text());
      if (text.length > best.length) best = text;
    });
    if (best.length > 600) break;
  }

  if (best.length < 200) {
    // Fallback: body text minus the structural elements we removed.
    best = normalize($("body").text());
  }

  // Cap input we send to the LLM. Polish gov pages are usually <10k chars
  // of relevant content; clamp to 12k to keep token usage predictable.
  return best.slice(0, 12_000);
}

function normalize(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/[  ​ ]/g, " ")
    .trim();
}
