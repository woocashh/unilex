import Link from "next/link";
import type { Source } from "@/lib/supabase/types";
import { sourceColor } from "@/lib/sourceColor";
import { SourceAvatar } from "./SourceAvatar";

export function SidebarSources({
  sources,
  countBySource,
  selectedSlug,
  buildHref,
}: {
  sources: Source[];
  countBySource: Map<string, number>;
  selectedSlug?: string;
  /** Build the href for a source row (null → "all sources"). */
  buildHref: (slug: string | null) => string;
}) {
  const sorted = [...sources].sort(
    (a, b) => (countBySource.get(b.id) ?? 0) - (countBySource.get(a.id) ?? 0),
  );
  const total = [...countBySource.values()].reduce((a, b) => a + b, 0);

  return (
    <aside className="rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Źródła
      </h2>

      <ul className="space-y-0.5">
        <li>
          <Row
            href={buildHref(null)}
            selected={!selectedSlug}
            avatar={
              <span
                aria-hidden
                className="grid h-7 w-7 place-items-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
              >
                WSZ
              </span>
            }
            label="Wszystkie źródła"
            count={total}
          />
        </li>

        {sorted.map((s) => {
          const count = countBySource.get(s.id) ?? 0;
          return (
            <li key={s.id}>
              <Row
                href={buildHref(s.slug)}
                selected={selectedSlug === s.slug}
                avatar={
                  <SourceAvatar
                    name={s.name}
                    slug={s.slug}
                    size={28}
                    color={sourceColor(s)}
                  />
                }
                label={s.name}
                count={count}
              />
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function Row({
  href,
  selected,
  avatar,
  label,
  count,
}: {
  href: string;
  selected: boolean;
  avatar: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 transition ${
        selected
          ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
          : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
      }`}
    >
      {avatar}
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span
        className={`text-xs tabular-nums ${
          count > 0
            ? selected
              ? "text-zinc-900 dark:text-zinc-100"
              : "text-zinc-600 dark:text-zinc-400"
            : "text-zinc-400 dark:text-zinc-600"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
