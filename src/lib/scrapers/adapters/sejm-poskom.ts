import type { SourceAdapter, NormalizedItem } from "../types";

// Sejm — committee sittings. The primary signal is PLANNED sittings (what's
// coming up); FINISHED sittings from the last few days are kept for context.
//
// PLANNED items use today as publishedAt so they surface in the default
// "Last 7 days" feed the day they enter the API; the actual sitting date is
// front-loaded in the title so the user can scan upcoming schedule at a glance.
const COMMITTEES_API = "https://api.sejm.gov.pl/sejm/term10/committees";
const SITTINGS_API = (code: string) =>
  `https://api.sejm.gov.pl/sejm/term10/committees/${code}/sittings`;

const PLANNED_LOOKAHEAD_DAYS = 30;
const FINISHED_LOOKBACK_DAYS = 3;
const MAX_ITEMS = 200;

const PL_MONTHS = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

type Committee = { code: string; name?: string };
type SittingVideo = { playerLink?: string; unid?: string };
type Sitting = {
  code: string;
  num: number;
  date: string; // YYYY-MM-DD
  startDateTime?: string;
  endDateTime?: string;
  agenda?: string;
  room?: string;
  remote?: boolean;
  closed?: boolean;
  status?: "PLANNED" | "FINISHED" | string;
  video?: SittingVideo[];
};

const PLAN_POSKOM_URL = "https://sejm.gov.pl/Sejm10.nsf/PlanPosKom.xsp";

function committeeUrl(code: string): string {
  return `https://www.sejm.gov.pl/sejm10.nsf/agent.xsp?symbol=KOMISJA&NrKadencji=10&Kod=${code}`;
}

// PLANNED sittings → the master schedule (PlanPosKom.xsp) since Sejm doesn't
// expose a per-future-sitting URL.
// FINISHED sittings → the per-sitting transmission archive when available,
// otherwise the committee's landing page.
function finishedSittingUrl(s: Sitting): string {
  return s.video?.[0]?.playerLink ?? committeeUrl(s.code);
}

export const sejmPoskomAdapter: SourceAdapter = {
  key: "sejm-poskom",
  async fetchItems({ fetch }): Promise<NormalizedItem[]> {
    const res = await fetch(COMMITTEES_API, {
      headers: { accept: "application/json" },
      timeoutMs: 20_000,
    });
    if (!res.ok) throw new Error(`Committees API ${res.status}`);
    const committees = (await res.json()) as Committee[];

    const nameByCode = new Map<string, string>();
    for (const c of committees) {
      if (c.code) nameByCode.set(c.code, c.name ?? c.code);
    }

    const now = new Date();
    const todayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const minFinished = new Date(todayUTC.getTime() - FINISHED_LOOKBACK_DAYS * 86_400_000);
    const maxPlanned = new Date(todayUTC.getTime() + PLANNED_LOOKAHEAD_DAYS * 86_400_000);

    const sittingsLists = await Promise.allSettled(
      committees.map(async (c) => {
        const r = await fetch(SITTINGS_API(c.code), {
          headers: { accept: "application/json" },
          timeoutMs: 15_000,
        });
        if (!r.ok) return [] as Sitting[];
        return (await r.json()) as Sitting[];
      }),
    );

    const items: NormalizedItem[] = [];
    for (const result of sittingsLists) {
      if (result.status !== "fulfilled") continue;
      for (const s of result.value) {
        if (!s.code || !s.num || !s.date) continue;
        const sittingDay =
          parseDateTime(s.startDateTime) ?? parseISODate(s.date);
        if (!sittingDay) continue;

        const committeeName = nameByCode.get(s.code) ?? s.code;
        const agendaText = stripHtml(s.agenda ?? "").slice(0, 320);

        const streamUrl = s.video?.[0]?.playerLink;

        if (s.status === "PLANNED") {
          if (sittingDay > maxPlanned) continue;
          items.push({
            externalId: `poskom-${s.code}-${s.num}`,
            url: PLAN_POSKOM_URL,
            title: `📅 Planowane · ${formatPlDate(sittingDay)} ${formatTime(s.startDateTime)} · ${committeeName} · posiedzenie nr ${s.num}`,
            // Discovery day, not sitting day — keeps planowane in the default
            // "Last 7 days" view until they happen.
            publishedAt: todayUTC,
            excerpt: agendaText || undefined,
            fullText: composeFullText(s, committeeName),
            streamUrl,
          });
        } else if (s.status === "FINISHED") {
          if (sittingDay < minFinished) continue;
          items.push({
            externalId: `poskom-${s.code}-${s.num}`,
            url: finishedSittingUrl(s),
            title: `${committeeName} · posiedzenie nr ${s.num}`,
            publishedAt: sittingDay,
            excerpt: agendaText || undefined,
            fullText: composeFullText(s, committeeName),
            streamUrl,
          });
        }
      }
    }

    // Sort: planned soonest-first within today's drop, then finished newest-first.
    items.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
    return items.slice(0, MAX_ITEMS);
  },
};

function composeFullText(s: Sitting, committeeName: string): string {
  const parts: string[] = [];
  parts.push(`Komisja: ${committeeName} (${s.code})`);
  parts.push(`Status: ${s.status === "PLANNED" ? "Planowane" : s.status === "FINISHED" ? "Zakończone" : s.status ?? "?"}`);
  parts.push(`Posiedzenie: ${s.num}`);
  parts.push(`Data: ${s.date}`);
  if (s.startDateTime) parts.push(`Początek: ${s.startDateTime.replace("T", " ").slice(0, 16)}`);
  if (s.endDateTime) parts.push(`Koniec: ${s.endDateTime.replace("T", " ").slice(0, 16)}`);
  if (s.room) parts.push(`Miejsce: ${s.room}`);
  if (s.remote !== undefined) parts.push(`Zdalne: ${s.remote ? "tak" : "nie"}`);
  if (s.closed) parts.push(`Posiedzenie zamknięte`);

  if (s.agenda) {
    parts.push("", "PORZĄDEK OBRAD", stripHtml(s.agenda));
  }
  if (s.video?.length) {
    parts.push("", "TRANSMISJE");
    for (const v of s.video) {
      if (v.playerLink) parts.push(`- ${v.playerLink}`);
    }
  }
  parts.push("", `Strona komisji: ${committeeUrl(s.code)}`);
  return parts.join("\n");
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatPlDate(d: Date): string {
  return `${d.getUTCDate()} ${PL_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatTime(s: string | undefined): string {
  if (!s) return "";
  const m = /T(\d{2}):(\d{2})/.exec(s);
  return m ? `o ${m[1]}:${m[2]}` : "";
}

function parseISODate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function parseDateTime(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
}
