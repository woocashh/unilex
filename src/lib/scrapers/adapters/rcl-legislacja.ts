import * as cheerio from "cheerio";
import { request } from "undici";
import type { SourceAdapter, NormalizedItem } from "../types";

// RCL — legislacja.gov.pl listing.
// typeId=2  → Projekty ustaw
// typeId=10 → Projekty rozporządzeń
// Table columns: Tytuł | Wnioskodawca | Numer | Utworzony | Zmodyfikowany.
// We emit a distinct alert per project AND per modification by folding the
// modified date into the externalId.
//
// The site sits behind F5 BIG-IP, which sends the full chunked body but never
// closes the connection promptly — `res.text()` would hang until the adapter
// deadline. We read the stream manually and bail after a short idle gap.
export const rclLegislacjaAdapter: SourceAdapter = {
  key: "rcl-legislacja",
  async fetchItems({ baseUrl }): Promise<NormalizedItem[]> {
    const html = await fetchWithIdleTimeout(baseUrl);
    const $ = cheerio.load(html);

    const items: NormalizedItem[] = [];
    $("tr").each((_, el) => {
      const $tds = $(el).find("td");
      if ($tds.length < 5) return;

      const $a = $tds.eq(0).find("a[href*='/projekt/']").first();
      const href = $a.attr("href");
      const title = $a.text().trim();
      if (!href || !title) return;

      const url = new URL(href, baseUrl).toString();
      const projectId = url.match(/\/projekt\/(\d+)/)?.[1];
      if (!projectId) return;

      const createdText = $tds.eq(3).text().trim();
      const modifiedText = $tds.eq(4).text().trim();
      const createdAt = parsePlDate(createdText);
      const modifiedAt = parsePlDate(modifiedText);

      const isUpdate = !!modifiedText && modifiedText !== createdText;
      const stamp = (isUpdate ? modifiedText : createdText).replace(/-/g, "");
      const externalId = stamp ? `${projectId}@${stamp}` : projectId;
      const displayTitle = isUpdate ? `[Aktualizacja] ${title}` : title;

      const number = $tds.eq(2).text().trim();
      const applicant = $tds.eq(1).text().trim();
      const excerptParts = [number, applicant].filter(Boolean);

      items.push({
        externalId,
        url,
        title: displayTitle,
        publishedAt: isUpdate ? modifiedAt : createdAt,
        excerpt: excerptParts.length ? excerptParts.join(" — ") : undefined,
      });
    });

    return items;
  },
};

async function fetchWithIdleTimeout(
  url: string,
  { idleMs = 2000, hardMs = 20_000 }: { idleMs?: number; hardMs?: number } = {},
): Promise<string> {
  const controller = new AbortController();
  const hardTimer = setTimeout(() => controller.abort(), hardMs);
  const res = await request(url, {
    method: "GET",
    headers: {
      "user-agent":
        "UnilexBot/0.1 (+https://unilex.app; contact: hello@unilex.app)",
      accept: "text/html,application/xhtml+xml",
      "accept-language": "pl,en;q=0.8",
    },
    signal: controller.signal,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    clearTimeout(hardTimer);
    throw new Error(`RCL ${url} returned ${res.statusCode}`);
  }

  const chunks: Buffer[] = [];
  let idleTimer: NodeJS.Timeout | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const armIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          controller.abort();
          resolve();
        }, idleMs);
      };
      armIdle();
      res.body.on("data", (c: Buffer) => {
        chunks.push(c);
        armIdle();
      });
      res.body.on("end", () => resolve());
      res.body.on("error", (e) => {
        // Aborting the request causes an error here — treat as graceful end
        // if we already have body bytes.
        if (chunks.length > 0) resolve();
        else reject(e);
      });
    });
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    clearTimeout(hardTimer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parsePlDate(s: string): Date | undefined {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
}
