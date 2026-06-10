"use client";

import Link from "next/link";
import type { Source } from "@/lib/supabase/types";

export type StatusFilter = "" | "open" | "actioned";

export function FilterBar({
  fromDay,
  toDay,
  isDefaultRange,
  initialQuery,
  selectedSlug,
  selectedStatus,
  sources,
}: {
  fromDay: string;
  toDay: string;
  isDefaultRange: boolean;
  initialQuery: string;
  selectedSlug: string;
  selectedStatus: StatusFilter;
  sources: Source[];
}) {
  const sortedSources = [...sources].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <form
      action="/feed"
      method="get"
      role="search"
      className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center"
    >
      {/* Keyword */}
      <div className="relative md:flex-1 md:min-w-[200px]">
        <SearchIcon />
        <input
          type="search"
          name="q"
          defaultValue={initialQuery}
          placeholder="Szukaj w tytule lub zajawce…"
          autoComplete="off"
          className="h-10 w-full rounded-full border border-zinc-200 bg-white py-2 pl-10 pr-3 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600 dark:focus:ring-zinc-700"
        />
      </div>

      {/* Source */}
      <div className="relative md:w-52">
        <select
          name="source"
          defaultValue={selectedSlug}
          onChange={(e) => e.currentTarget.form?.submit()}
          aria-label="Filtruj według źródła"
          className="h-10 w-full appearance-none rounded-full border border-zinc-200 bg-white pl-4 pr-9 text-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600 dark:focus:ring-zinc-700"
        >
          <option value="">Wszystkie źródła</option>
          {sortedSources.map((s) => (
            <option key={s.id} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <ChevronDownIcon />
      </div>

      {/* Status — segmented control, written into the URL as ?status= */}
      <fieldset className="flex h-10 items-center gap-0.5 rounded-full border border-zinc-200 bg-white p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
        <legend className="sr-only">Filtruj według statusu</legend>
        <StatusOption name="status" value="" current={selectedStatus} label="Wszystkie" />
        <StatusOption name="status" value="open" current={selectedStatus} label="Otwarte" />
        <StatusOption
          name="status"
          value="actioned"
          current={selectedStatus}
          label="Obsłużone"
        />
      </fieldset>

      {/* Date range */}
      <div className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span>Od</span>
          <input
            type="date"
            name="from"
            defaultValue={fromDay}
            max={toDay}
            onChange={(e) => e.currentTarget.form?.submit()}
            className="bg-transparent text-sm text-zinc-800 focus:outline-none dark:text-zinc-200"
          />
        </label>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span>Do</span>
          <input
            type="date"
            name="to"
            defaultValue={toDay}
            min={fromDay}
            onChange={(e) => e.currentTarget.form?.submit()}
            className="bg-transparent text-sm text-zinc-800 focus:outline-none dark:text-zinc-200"
          />
        </label>
      </div>

      {/* Quick reset to last 7 days */}
      {!isDefaultRange && (
        <Link
          href={buildLast7DaysHref(selectedSlug, initialQuery)}
          className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
        >
          Ostatnie 7 dni
        </Link>
      )}
    </form>
  );
}

function buildLast7DaysHref(selectedSlug: string, query: string) {
  const p = new URLSearchParams();
  if (selectedSlug) p.set("source", selectedSlug);
  if (query) p.set("q", query);
  const s = p.toString();
  return s ? `/feed?${s}` : "/feed";
}

function StatusOption({
  name,
  value,
  current,
  label,
}: {
  name: string;
  value: StatusFilter;
  current: StatusFilter;
  label: string;
}) {
  const checked = current === value;
  return (
    <label
      className={
        checked
          ? "cursor-pointer rounded-full bg-zinc-900 px-3 py-1 font-medium text-white dark:bg-white dark:text-zinc-900"
          : "cursor-pointer rounded-full px-3 py-1 font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={checked}
        onChange={(e) => e.currentTarget.form?.submit()}
        className="sr-only"
      />
      {label}
    </label>
  );
}

function SearchIcon() {
  return (
    <svg
      className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
