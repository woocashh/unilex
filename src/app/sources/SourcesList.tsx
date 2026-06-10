"use client";

import { useState } from "react";
import type { Source } from "@/lib/supabase/types";
import { sourceColor } from "@/lib/sourceColor";
import { SourceAvatar } from "@/components/SourceAvatar";
import { DeleteSourceButton } from "./DeleteSourceButton";

// last_run_at pre-formatted by the server page — see the comment there.
type SourceRow = Source & { lastRunLabel: string | null };

// Diacritic-insensitive matching, so "zrodla" finds "źródła".
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase();
}

export function SourcesList({ sources }: { sources: SourceRow[] }) {
  const [query, setQuery] = useState("");

  const needle = fold(query.trim());
  const filtered = needle
    ? sources.filter((s) =>
        fold(`${s.name} ${s.slug} ${s.base_url}`).includes(needle),
      )
    : sources;

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Szukaj źródła po nazwie lub adresie…"
        className="mb-4 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
      />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          Brak źródeł pasujących do „{query.trim()}”.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <SourceAvatar name={s.name} slug={s.slug} color={sourceColor(s)} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold">
                    {s.name}
                  </span>
                  <span
                    className={
                      s.adapter_key === "custom-css"
                        ? "rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }
                  >
                    {s.adapter_key === "custom-css" ? "WŁASNE" : "WBUDOWANE"}
                  </span>
                  {!s.enabled && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                      WYŁĄCZONE
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <a
                    href={s.base_url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate hover:underline"
                  >
                    {s.base_url}
                  </a>
                  {s.lastRunLabel && (
                    <>
                      <span aria-hidden>·</span>
                      <span>ostatnie pobranie: {s.lastRunLabel}</span>
                    </>
                  )}
                </div>
                {s.last_error && (
                  <p className="mt-1 truncate text-xs text-red-600 dark:text-red-400">
                    Błąd: {s.last_error}
                  </p>
                )}
              </div>

              {s.adapter_key === "custom-css" && (
                <DeleteSourceButton sourceId={s.id} sourceName={s.name} />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
