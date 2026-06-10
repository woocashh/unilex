import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Alert, Source } from "@/lib/supabase/types";
import { parseDateRange } from "@/lib/dateRange";
import { plural } from "@/lib/plural";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { TopNav } from "@/components/TopNav";
import { FilterBar, type StatusFilter } from "@/components/FilterBar";
import { FeedItem } from "@/components/FeedItem";

type SearchParams = Promise<{
  from?: string;
  to?: string;
  source?: string;
  q?: string;
  status?: string;
}>;

export default async function FeedPage({ searchParams }: { searchParams: SearchParams }) {
  const { from, to, source: sourceSlug, q: rawQuery, status: rawStatus } = await searchParams;
  const range = parseDateRange({ from, to });
  const query = (rawQuery ?? "").trim();
  const status: StatusFilter =
    rawStatus === "open" || rawStatus === "actioned" ? rawStatus : "";

  const supabase = await createSupabaseServerClient();

  const { data: sources } = await supabase.from("sources").select("*");
  const allSources = (sources ?? []) as Source[];
  const selectedSource = sourceSlug
    ? allSources.find((s) => s.slug === sourceSlug)
    : undefined;

  let alertsQuery = supabase
    .from("alerts")
    .select("*")
    .gte("published_at", range.start.toISOString())
    .lte("published_at", range.end.toISOString())
    .order("published_at", { ascending: false })
    .limit(500);

  if (selectedSource) alertsQuery = alertsQuery.eq("source_id", selectedSource.id);
  if (query) {
    const safe = query.replace(/[%,]/g, " ");
    alertsQuery = alertsQuery.or(
      `title.ilike.%${safe}%,raw_excerpt.ilike.%${safe}%`,
    );
  }

  const [
    { data: alertsRaw },
    {
      data: { user },
    },
  ] = await Promise.all([alertsQuery, supabase.auth.getUser()]);

  const sourceById = new Map<string, Source>(allSources.map((s) => [s.id, s]));

  const readIds = new Set<string>();
  const actionedIds = new Set<string>();
  if (user && alertsRaw?.length) {
    const ids = alertsRaw.map((a) => a.id);
    const [{ data: reads }, { data: actions }] = await Promise.all([
      supabase.from("alert_reads").select("alert_id").in("alert_id", ids),
      supabase.from("alert_actions").select("alert_id").in("alert_id", ids),
    ]);
    for (const r of reads ?? []) readIds.add(r.alert_id);
    for (const a of actions ?? []) actionedIds.add(a.alert_id);
  }

  // Status filter is per-user, so it's applied in memory after the fetch.
  const alerts = (alertsRaw ?? []).filter((a) => {
    if (status === "open") return !actionedIds.has(a.id);
    if (status === "actioned") return actionedIds.has(a.id);
    return true;
  });

  const grouped = groupByDay(alerts);
  const hasFilters = !!query || !!selectedSource || !range.isDefault || !!status;

  return (
    <>
      <TopNav />
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <FilterBar
            fromDay={range.fromDay}
            toDay={range.toDay}
            isDefaultRange={range.isDefault}
            initialQuery={query}
            selectedSlug={selectedSource?.slug ?? ""}
            selectedStatus={status}
            sources={allSources.filter((s) => s.enabled)}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>
              {alerts.length} {plural(alerts.length, "pozycja", "pozycje", "pozycji")}
            </span>
            <span aria-hidden>·</span>
            <span>
              {range.isDefault
                ? "Ostatnie 7 dni"
                : `${format(range.start, "d MMM yyyy", { locale: pl })} – ${format(range.end, "d MMM yyyy", { locale: pl })}`}
            </span>
            {hasFilters && (
              <>
                <span aria-hidden>·</span>
                <a
                  href="/feed"
                  className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Wyczyść wszystkie filtry
                </a>
              </>
            )}
          </div>
        </div>

        {grouped.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <div className="space-y-6">
            {grouped.map(([day, items]) => (
              <section key={day}>
                <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {format(new Date(day), "EEEE, d MMMM", { locale: pl })}
                </h2>
                <div className="space-y-2">
                  {items.map((a) => (
                    <FeedItem
                      key={a.id}
                      alert={a}
                      source={sourceById.get(a.source_id)}
                      read={readIds.has(a.id)}
                      actioned={actionedIds.has(a.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium text-zinc-700 dark:text-zinc-300">
        Brak wyników dla bieżących filtrów.
      </p>
      <p className="mt-1">
        {hasFilters ? (
          <a className="underline hover:text-zinc-900 dark:hover:text-zinc-100" href="/feed">
            Wyczyść wszystkie filtry
          </a>
        ) : (
          "Spróbuj poszerzyć zakres dat powyżej."
        )}
      </p>
    </div>
  );
}

function groupByDay(alerts: Alert[]): [string, Alert[]][] {
  const map = new Map<string, Alert[]>();
  for (const a of alerts) {
    const day = (a.published_at ?? a.created_at).slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(a);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}
