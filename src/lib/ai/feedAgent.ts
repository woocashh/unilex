// Feed setup agent — given a listing page's HTML, asks an LLM to propose a
// CustomFeedConfig for the 'custom-css' adapter. Called in a loop from
// /sources/new: each round gets the previous config, what it extracted, and
// the user's feedback, until the user accepts the preview.

import * as cheerio from "cheerio";
import { z } from "zod";
import {
  customFeedConfigSchema,
  type CustomFeedConfig,
} from "@/lib/scrapers/adapters/custom-css";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

const configProposalSchema = z.object({
  kind: z.literal("config").default("config"),
  sourceName: z.string().min(1),
  config: customFeedConfigSchema,
  notes: z.string().optional(),
});

// The model picks this when the given page is not itself an article listing —
// the caller then crawls the candidate links looking for the real feed page.
const navigateProposalSchema = z.object({
  kind: z.literal("navigate"),
  candidates: z.array(z.string()).min(1).max(5),
  notes: z.string().optional(),
});

const proposalSchema = z.union([configProposalSchema, navigateProposalSchema]);

export type FeedProposal = z.infer<typeof proposalSchema>;

export type ProposeFeedConfigInput = {
  url: string;
  /** Already simplified — see simplifyHtmlForLlm. */
  html: string;
  previousConfig?: CustomFeedConfig;
  /** What the previous config extracted (count, sample titles, warnings). */
  previousOutcome?: string;
  userFeedback?: string;
};

const SYSTEM_PROMPT = `You configure a CSS-selector based scraper for news/article listing pages (often Polish government and regulator sites). Respond with STRICT JSON only — no markdown fences, no commentary.

FIRST decide whether the given page is itself a listing of dated articles/announcements.

If it is NOT a listing (a homepage, a single article, a section hub, a search or contact page), reply instead with:

{
  "kind": "navigate",
  "candidates": ["up to 3 URLs taken from href values in this HTML, most likely to lead to the site's news/announcements listing, ordered by likelihood"],
  "notes": "one sentence for the user about where you are heading and why"
}

- Prefer Polish or English listings — link text like: aktualności, wiadomości, komunikaty, ogłoszenia, news, announcements, press releases, media, dla mediów.
- Use "navigate" only when the current page is clearly not an article listing; if it plausibly is one, configure it.

If the page IS a listing, reply with:

{
  "kind": "config",
  "sourceName": "short human name for the source, e.g. 'MRiRW — wiadomości'",
  "config": {
    "itemSelector": "CSS selector matching exactly one element per article in the main listing",
    "linkSelector": "optional — selector for the article link, resolved INSIDE an item; omit to use the first <a>",
    "titleSelector": "optional — selector for the title text, resolved INSIDE an item; omit to use the link text",
    "dateSelector": "optional — selector for the publication date, resolved INSIDE an item",
    "dateFormat": "optional — date-fns format for the date text, e.g. 'dd.MM.yyyy' or 'd MMMM yyyy' (Polish month names are handled)",
    "excerptSelector": "optional — selector for a teaser/excerpt, resolved INSIDE an item",
    "maxItems": "optional number — keep only the first N items from the listing; set when the user asks to limit the feed (e.g. 'only the last 5')",
    "color": "optional — hex color like '#1b5e20' for the feed's avatar/icon in the app; set when the user asks about the icon or feed color"
  },
  "notes": "1-2 plain sentences for the user: what you matched and anything worth double-checking"
}

Rules:
- Write "notes" in Polish, for a NONTECHNICAL reader — they are shown verbatim to the user. Never mention CSS, selectors, HTML, classes, config field names, or date formats. Describe what the user sees instead: articles, titles, dates, teasers, the icon color, the number of items. Bad: "Ustawiłem dateSelector na .date z formatem dd.MM.yyyy". Good: "Pobieram tytuły, daty i krótkie zajawki artykułów z listy aktualności".
- Selectors run in cheerio: standard CSS only (no XPath, no :has-text; :has() works).
- itemSelector must target the repeated article containers of the MAIN listing — never navigation menus, sidebars, footers, or cookie banners.
- Prefer stable class names over positional selectors like nth-child.
- If the date sits in a <time datetime="…"> attribute, the scraper reads the attribute automatically — just point dateSelector at the element.
- Omit optional fields you are not confident about rather than guessing.

How extracted items are displayed in the app's feed: a round avatar in the feed's color, source name + date on top, then the title, then the excerpt as a ~2-line teaser. So "summary"/"description"/"teaser" requests map to excerptSelector, "header"/"headline" to titleSelector, icon/color requests to "color", and "only the last N" to "maxItems".

You can ONLY read the listing page you are given. Text that exists solely on the article detail pages is out of reach here (the app fetches full article text separately after items are saved).

When user feedback is present, addressing it is your top priority — change the config specifically in response to it. Your "notes" must then state concretely what you changed and how it answers the feedback. If the request cannot be satisfied from the listing page (the text is not in this HTML, or it is already being extracted), keep the config as it is and say exactly that in notes instead of pretending to change something.`;

export async function proposeFeedConfig(
  input: ProposeFeedConfigInput,
): Promise<FeedProposal> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const parts = [
    `Listing page URL: ${input.url}`,
    input.previousConfig
      ? `Previous config (needs improvement):\n${JSON.stringify(input.previousConfig, null, 2)}`
      : null,
    input.previousOutcome
      ? `What the previous config extracted:\n${input.previousOutcome}`
      : null,
    input.userFeedback ? `User feedback:\n${input.userFeedback}` : null,
    `Simplified page HTML:\n${input.html}`,
  ].filter(Boolean);

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: parts.join("\n\n") },
      ...(lastError
        ? [
            {
              role: "user",
              content: `Your previous reply was not valid (${lastError}). Reply again with strict JSON matching the schema.`,
            },
          ]
        : []),
    ];

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://unilex.local",
        "X-Title": "Unilex",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: "json_object" },
        messages,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenRouter returned no content");

    try {
      const parsed = proposalSchema.safeParse(extractJson(content));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.message.slice(0, 300);
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 300) : "invalid JSON";
    }
  }
  throw new Error(`Agent nie zdołał przygotować prawidłowej konfiguracji: ${lastError}`);
}

function extractJson(s: string): unknown {
  const trimmed = s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

// Strip everything the LLM doesn't need to pick selectors: scripts, styles,
// svg paths, and all attributes except the ones selectors are built from.
export function simplifyHtmlForLlm(html: string, maxChars = 60_000): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, template, link, meta").remove();

  const KEEP_ATTRS = new Set(["class", "id", "href", "datetime", "role"]);
  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    for (const name of Object.keys(el.attribs)) {
      if (!KEEP_ATTRS.has(name)) delete el.attribs[name];
    }
  });

  const body = $("body").html() ?? $.html();
  return body.replace(/\s+/g, " ").slice(0, maxChars);
}
