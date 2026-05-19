import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Alert, Source } from "@/lib/supabase/types";
import { parseDateRange } from "@/lib/dateRange";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { TopNav } from "@/components/TopNav";
import { FilterBar, type StatusFilter } from "@/components/FilterBar";
import { FeedItem } from "@/components/FeedItem";
import { ApplyReadState } from "@/components/ClientReadState";

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
  if (status === "open") alertsQuery = alertsQuery.is("actioned_at", null);
  if (status === "actioned") alertsQuery = alertsQuery.not("actioned_at", "is", null);
  if (query) {
    const safe = query.replace(/[%,]/g, " ");
    alertsQuery = alertsQuery.or(
      `title.ilike.%${safe}%,raw_excerpt.ilike.%${safe}%`,
    );
  }

  const [
    { data: alerts },
    {
      data: { user },
    },
  ] = await Promise.all([alertsQuery, supabase.auth.getUser()]);

  const sourceById = new Map<string, Source>(allSources.map((s) => [s.id, s]));

  const readIds = new Set<string>();
  if (user && alerts?.length) {
    const { data: reads } = await supabase
      .from("alert_reads")
      .select("alert_id")
      .in("alert_id", alerts.map((a) => a.id));
    for (const r of reads ?? []) readIds.add(r.alert_id);
  }

  const grouped = groupByDay(alerts ?? []);
  const hasFilters = !!query || !!selectedSource || !range.isDefault || !!status;

  return (
    <>
      <TopNav />
      <ApplyReadState />
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
              {alerts?.length ?? 0} item{(alerts?.length ?? 0) === 1 ? "" : "s"}
            </span>
            <span aria-hidden>·</span>
            <span>
              {range.isDefault
                ? "Last 7 days"
                : `${format(range.start, "MMM d, yyyy", { locale: enUS })} – ${format(range.end, "MMM d, yyyy", { locale: enUS })}`}
            </span>
            {hasFilters && (
              <>
                <span aria-hidden>·</span>
                <a
                  href="/feed"
                  className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Clear all filters
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
                  {format(new Date(day), "EEEE, MMMM d", { locale: enUS })}
                </h2>
                <div className="space-y-2">
                  {items.map((a) => (
                    <FeedItem
                      key={a.id}
                      alert={a}
                      source={sourceById.get(a.source_id)}
                      read={readIds.has(a.id)}
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
        Nothing matches the current filters.
      </p>
      <p className="mt-1">
        {hasFilters ? (
          <a className="underline hover:text-zinc-900 dark:hover:text-zinc-100" href="/feed">
            Clear all filters
          </a>
        ) : (
          "Try widening the date range above."
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
