import Link from "next/link";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { shiftWeekLabel, type WeekRange } from "@/lib/week";

export function WeekNav({
  range,
  buildHref,
}: {
  range: WeekRange;
  /** Build href for a given week label (or null → "today"). */
  buildHref: (weekLabel: string | null) => string;
}) {
  const sameMonth = range.start.getUTCMonth() === range.end.getUTCMonth();
  const startLabel = format(range.start, "MMM d", { locale: enUS });
  const endLabel = format(range.end, sameMonth ? "d, yyyy" : "MMM d, yyyy", {
    locale: enUS,
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Week of
        </p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
          {startLabel} – {endLabel}
        </h1>
      </div>

      <nav className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href={buildHref(shiftWeekLabel(range.label, -1))}
          aria-label="Previous week"
          className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          ←
        </Link>
        <Link
          href={buildHref(null)}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          Today
        </Link>
        <Link
          href={buildHref(shiftWeekLabel(range.label, 1))}
          aria-label="Next week"
          className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          →
        </Link>
      </nav>
    </div>
  );
}
