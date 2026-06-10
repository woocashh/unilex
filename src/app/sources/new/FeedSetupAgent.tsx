"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { SourceAvatar } from "@/components/SourceAvatar";
import { plural } from "@/lib/plural";
import type { CustomFeedConfig } from "@/lib/scrapers/adapters/custom-css";
import { analyzeFeedUrl, previewArticle, saveFeedSource } from "./actions";
import type {
  DiscoveryResult as AnalyzeResult,
  PreviewItem,
} from "@/lib/ai/feedDiscovery";

type Turn =
  | { role: "user"; text: string }
  | {
      role: "agent";
      text: string;
      error?: boolean;
      preview?: PreviewItem[];
      totalItems?: number;
      warnings?: string[];
      config?: CustomFeedConfig;
      sourceName?: string;
    };

// A preview item opened in the side panel — full entry view like /alert/[id].
type OpenEntry = {
  item: PreviewItem;
  sourceName: string;
  color?: string;
  allowInsecureTls?: boolean;
};

type EntryBody =
  | { url: string; state: "loading" }
  | { url: string; state: "ready"; text: string }
  | { url: string; state: "error"; error: string };

export function FeedSetupAgent() {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [url, setUrl] = useState("");
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [current, setCurrent] = useState<CustomFeedConfig | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [openEntry, setOpenEntry] = useState<OpenEntry | null>(null);
  const [entryBody, setEntryBody] = useState<EntryBody | null>(null);
  const bodyCache = useRef(new Map<string, string>());

  const started = turns.length > 0;

  function openItem(entry: OpenEntry) {
    setOpenEntry(entry);
    const itemUrl = entry.item.url;
    const cached = bodyCache.current.get(itemUrl);
    if (cached) {
      setEntryBody({ url: itemUrl, state: "ready", text: cached });
      return;
    }
    setEntryBody({ url: itemUrl, state: "loading" });
    previewArticle({ url: itemUrl, allowInsecureTls: entry.allowInsecureTls }).then(
      (r) => {
        setEntryBody((prev) => {
          // The user may have opened another item in the meantime.
          if (prev?.url !== itemUrl) return prev;
          if (!r.ok) return { url: itemUrl, state: "error", error: r.error };
          bodyCache.current.set(itemUrl, r.text);
          return { url: itemUrl, state: "ready", text: r.text };
        });
      },
    );
  }

  function pushResult(result: AnalyzeResult, isRefinement: boolean) {
    if (!result.ok) {
      setTurns((t) => [...t, { role: "agent", text: result.error, error: true }]);
      return;
    }
    const unchanged =
      isRefinement &&
      current !== null &&
      JSON.stringify(result.config) === JSON.stringify(current);
    setCurrent(result.config);
    setName((n) => n || result.sourceName);
    // The agent may have crawled away from the pasted URL to find the actual
    // listing — from here on, refine and save against where it landed.
    setUrl(result.url);
    const crawled = result.discovered
      ? `Wklejona strona nie jest sama w sobie listą publikacji, więc rozejrzałem się po serwisie i skonfigurowałem kanał na podstawie ${result.url}. `
      : "";
    const notes = `${crawled}${result.notes ? `${result.notes} ` : ""}`;
    const itemsCount = `${result.totalItems} ${plural(result.totalItems, "pozycję", "pozycje", "pozycji")}`;
    let text: string;
    if (result.totalItems === 0) {
      text = `${notes}Nie udało mi się wyodrębnić żadnych pozycji w ten sposób. Podpowiedz, gdzie na stronie znajdują się publikacje (np. „lista pod nagłówkiem »Aktualności«”), a spróbuję ponownie.`;
    } else if (unchanged) {
      text = `Nie wprowadziłem zmian. ${notes || "O ile mogę ocenić, kanał już działa tak, jak prosisz — opisz dokładniej, co w podglądzie wygląda nie tak."}`;
    } else if (isRefinement) {
      text = `${notes}Zaktualizowany podgląd poniżej pokazuje ${itemsCount} — czy coś jeszcze poprawić, czy zapisujemy?`;
    } else {
      text = `${notes}Znalazłem ${itemsCount}. Podgląd odzwierciedla, jak każda pozycja będzie wyglądać w kanale. Jeśli wszystko się zgadza, zapisz kanał — w przeciwnym razie napisz, co jest nie tak, a poprawię konfigurację.`;
    }
    setTurns((t) => [
      ...t,
      {
        role: "agent",
        text,
        preview: result.preview,
        totalItems: result.totalItems,
        warnings: result.warnings,
        config: result.config,
        sourceName: result.sourceName,
      },
    ]);
  }

  function start(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || pending) return;
    setTurns([{ role: "user", text: trimmed }]);
    startTransition(async () => {
      pushResult(await analyzeFeedUrl({ url: trimmed }), false);
    });
  }

  function sendFeedback(e: React.FormEvent) {
    e.preventDefault();
    const feedback = input.trim();
    if (!feedback || pending) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: feedback }]);
    startTransition(async () => {
      pushResult(
        await analyzeFeedUrl({
          url: url.trim(),
          feedback,
          previousConfig: current ?? undefined,
        }),
        true,
      );
    });
  }

  async function save() {
    if (!current || saving) return;
    setSaving(true);
    setSaveError("");
    const result = await saveFeedSource({ url: url.trim(), name, config: current });
    if (result.ok) {
      router.push(`/feed?source=${result.slug}`);
    } else {
      setSaveError(result.error);
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Chat column — full-width and centered until an entry is opened. */}
      <div
        className={
          openEntry
            ? "w-full min-w-0 space-y-4 lg:w-[42%] lg:shrink-0"
            : "mx-auto w-full max-w-3xl space-y-4"
        }
      >
        <div>
          <h1 className="mb-1 text-lg font-semibold tracking-tight">
            Dodaj źródło
          </h1>
          <p className="mb-4 text-sm text-zinc-500">
            Wklej link do strony z aktualnościami lub komunikatami — może być
            też dowolna strona serwisu, a agent sam znajdzie właściwą. Zobaczysz
            podgląd; poprawiaj go w rozmowie, aż wszystko się zgodzi, i zapisz.
          </p>
        </div>

        {!started && (
          <form
            onSubmit={start}
            className="flex gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.gov.pl/web/rolnictwo/wiadomosci"
              className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
            />
            <button
              type="submit"
              disabled={pending}
              className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              Analizuj
            </button>
          </form>
        )}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
                {turn.text}
              </div>
            </div>
          ) : (
            <AgentBubble key={i} turn={turn} onOpen={openItem} />
          ),
        )}

        {pending && (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            Czytam stronę i przygotowuję podgląd…
          </div>
        )}

        {started && !pending && (
          <form onSubmit={sendFeedback} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Popraw agenta, np. „daty są błędne” albo „pomiń zapowiedzi wydarzeń”"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="shrink-0 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
            >
              Wyślij
            </button>
          </form>
        )}

        {current && !pending && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grow text-sm">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Nazwa kanału
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
                />
              </label>
              <button
                onClick={save}
                disabled={saving || !name.trim()}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Zapisywanie i pierwsze pobieranie…" : "Wygląda dobrze — zapisz kanał"}
              </button>
            </div>
            {saveError && (
              <p className="mt-2 text-sm text-red-600">{saveError}</p>
            )}
          </div>
        )}
      </div>

      {openEntry && (
        <EntryPanel
          entry={openEntry}
          body={entryBody}
          onClose={() => setOpenEntry(null)}
        />
      )}
    </div>
  );
}

function AgentBubble({
  turn,
  onOpen,
}: {
  turn: Extract<Turn, { role: "agent" }>;
  onOpen: (entry: OpenEntry) => void;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 text-sm dark:bg-zinc-900 ${
        turn.error
          ? "border-red-300 dark:border-red-900"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <p className={turn.error ? "text-red-700 dark:text-red-400" : ""}>
        {turn.text}
      </p>

      {turn.warnings && turn.warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-700 dark:text-amber-500">
          {turn.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {turn.preview && turn.preview.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Podgląd — {turn.preview.length} z {turn.totalItems} pozycji, tak jak
            pojawią się w kanale
          </div>
          <div className="space-y-2">
            {turn.preview.map((item, i) => (
              <PreviewFeedItem
                key={i}
                item={item}
                sourceName={turn.sourceName ?? "Nowe źródło"}
                color={turn.config?.color}
                onOpen={() =>
                  onOpen({
                    item,
                    sourceName: turn.sourceName ?? "Nowe źródło",
                    color: turn.config?.color,
                    allowInsecureTls: turn.config?.allowInsecureTls,
                  })
                }
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Kliknij pozycję, żeby zobaczyć pełny podgląd wpisu obok. Jeśli coś
            się nie zgadza, po prostu napisz to poniżej.
          </p>
        </div>
      )}

      {turn.config && (
        <details className="mt-4 text-xs text-zinc-500">
          <summary className="cursor-pointer select-none">
            Szczegóły techniczne
          </summary>
          <pre className="mt-1 overflow-x-auto rounded-md bg-zinc-50 p-2 dark:bg-zinc-950">
            {JSON.stringify(turn.config, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

// Mirrors FeedItem's card so the preview shows exactly what the feed will
// render — clicking opens the full entry view in the side panel.
function PreviewFeedItem({
  item,
  sourceName,
  color,
  onOpen,
}: {
  item: PreviewItem;
  sourceName: string;
  color?: string;
  onOpen: () => void;
}) {
  const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
  return (
    <article>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      >
        <SourceAvatar name={sourceName} slug={sourceName} color={color} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
              {sourceName}
            </span>
            {publishedAt ? (
              <>
                <span aria-hidden>·</span>
                <time dateTime={publishedAt.toISOString()}>
                  {format(publishedAt, "d MMM yyyy", { locale: pl })}
                </time>
              </>
            ) : (
              <>
                <span aria-hidden>·</span>
                <span className="text-amber-700 dark:text-amber-500">
                  nie wyodrębniono daty
                </span>
              </>
            )}
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              NOWE
            </span>
          </div>

          <h3 className="mt-1 line-clamp-3 text-[15px] font-semibold leading-snug text-zinc-900 group-hover:underline dark:text-zinc-50">
            {item.title}
          </h3>

          {item.excerpt && (
            <p className="mt-1.5 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
              {item.excerpt}
            </p>
          )}
        </div>
      </button>
    </article>
  );
}

// Full entry view, mirroring the /alert/[id] page layout, so the user sees
// exactly how an item will read in the app while the chat stays alongside.
function EntryPanel({
  entry,
  body,
  onClose,
}: {
  entry: OpenEntry;
  body: EntryBody | null;
  onClose: () => void;
}) {
  const { item, sourceName, color } = entry;
  const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;

  return (
    <article className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:p-8 lg:sticky lg:top-20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SourceAvatar name={sourceName} slug={sourceName} size={40} color={color} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {sourceName}
            </p>
            <p className="text-xs text-zinc-500">
              {publishedAt
                ? format(publishedAt, "EEEE, d MMMM yyyy", { locale: pl })
                : "data nieznana"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          ✕ Zamknij
        </button>
      </div>

      <h1 className="mt-5 text-xl font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
        {item.title}
      </h1>

      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
      >
        Czytaj na {hostname(item.url)} ↗
      </a>

      <div className="mt-5 max-h-[60vh] overflow-y-auto">
        {(!body || body.state === "loading") && (
          <p className="text-sm text-zinc-500">Odczytuję treść wpisu…</p>
        )}
        {body?.state === "error" && (
          <p className="text-sm text-amber-700 dark:text-amber-500">
            {body.error}
          </p>
        )}
        {body?.state === "ready" && (
          <p className="text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200">
            {body.text}
          </p>
        )}
      </div>

      <p className="mt-5 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        Tak ten wpis będzie wyglądał w aplikacji po zapisaniu kanału.
      </p>
    </article>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
