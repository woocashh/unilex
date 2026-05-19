import { parse } from "csv-parse/sync";
import type { SourceAdapter, NormalizedItem } from "../types";

// KPRM — Wykaz prac legislacyjnych i programowych RM (WPLiP). The page is a
// Vue SPA, but the underlying register is served as a CSV download that
// contains every detail field per project. We fetch the CSV, compose a rich
// `fullText` per row from all CSV columns, sort newest-first, cap at MAX_ITEMS.
const CSV_URL = "https://www.gov.pl/register-file/Rejestr_20874195.csv";
const MAX_ITEMS = 200;

type CsvRow = Record<string, string>;

// Order matters — this is how sections appear in the article body.
const META_FIELDS: Array<[string, string]> = [
  ["Rodzaj dokumentu", "Rodzaj dokumentu"],
  ["Typ dokumentu", "Typ dokumentu"],
  ["Informacja dodatkowa", "Informacja dodatkowa"],
  ["Status realizacji", "Status realizacji"],
  ["Organ odpowiedzialny", "Organ odpowiedzialny"],
  ["Organ odpowiedzialny za opracowanie projektu", "Organ opracowujący"],
  ["Organ współpracujący przy opracowaniu projektu", "Organ współpracujący"],
  ["Osoba odpowiedzialna", "Osoba odpowiedzialna"],
  ["Planowane przyjęcie przez RM", "Planowane przyjęcie przez RM"],
  ["Informacja o rezygnacji z prac nad projektem", "Rezygnacja"],
];

const SECTION_FIELDS: Array<[string, string]> = [
  [
    "Cele projektu oraz informacja o przyczynach i potrzebie rozwiązań planowanych w projekcie",
    "Cele projektu",
  ],
  [
    "Istota rozwiązań planowanych w projekcie, w tym proponowane środki realizacji",
    "Istota rozwiązań",
  ],
  [
    "Oddziaływanie na życie społeczne nowych regulacji prawnych",
    "Oddziaływanie społeczne",
  ],
  [
    "Spodziewane skutki i następstwa projektowanych regulacji prawnych",
    "Spodziewane skutki",
  ],
  [
    "Sposoby mierzenia efektów nowych regulacji prawnych",
    "Sposoby mierzenia efektów",
  ],
];

export const govPlWplipAdapter: SourceAdapter = {
  key: "gov-pl-wplip",
  async fetchItems({ fetch }): Promise<NormalizedItem[]> {
    const res = await fetch(CSV_URL, { timeoutMs: 25_000 });
    if (!res.ok) throw new Error(`WPLiP CSV returned ${res.status}`);
    const csv = await res.text();

    const rows: CsvRow[] = parse(csv, {
      columns: true,
      delimiter: ";",
      relax_column_count: true,
      trim: true,
      bom: true,
      skip_empty_lines: true,
    });

    const items: NormalizedItem[] = [];
    for (const row of rows) {
      const id = row["Numer projektu"]?.trim();
      const title = row["Tytuł"]?.trim();
      const url = row["Podgląd"]?.trim();
      if (!id || !title || !url) continue;

      const publishedAt = parsePlDateTime(row["Data publikacji"]);
      if (!publishedAt) continue;

      const goals = row[
        "Cele projektu oraz informacja o przyczynach i potrzebie rozwiązań planowanych w projekcie"
      ]?.trim();
      const excerpt = goals ? goals.slice(0, 400) : undefined;

      items.push({
        externalId: id,
        url,
        title,
        publishedAt,
        excerpt,
        fullText: composeFullText(id, row),
      });
    }

    items.sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime());
    return items.slice(0, MAX_ITEMS);
  },
};

function composeFullText(id: string, row: CsvRow): string {
  const parts: string[] = [];

  // Header: numer projektu + nice metadata block.
  parts.push(`Numer projektu: ${id}`);
  for (const [key, label] of META_FIELDS) {
    const v = row[key]?.trim();
    if (v) parts.push(`${label}: ${v}`);
  }

  // Long-form sections, each separated by a blank line so the reader's
  // paragraph splitter naturally breaks between them.
  for (const [key, label] of SECTION_FIELDS) {
    const v = row[key]?.trim();
    if (!v) continue;
    parts.push("", `${label.toUpperCase()}`, v);
  }

  return parts.join("\n");
}

function parsePlDateTime(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
}
