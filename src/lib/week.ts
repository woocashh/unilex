import { startOfISOWeek, endOfISOWeek, formatISO, getISOWeek, getISOWeekYear, parseISO, addWeeks } from "date-fns";

export type WeekRange = { start: Date; end: Date; label: string };
export type { WeekRange as Range };

export function currentWeek(now = new Date()): WeekRange {
  const start = startOfISOWeek(now);
  const end = endOfISOWeek(now);
  return { start, end, label: weekLabel(start) };
}

export function parseWeekParam(param: string | undefined, now = new Date()): WeekRange {
  if (!param) return currentWeek(now);
  // Accept "2026-W19" or an ISO date inside the desired week.
  const m = /^(\d{4})-W(\d{1,2})$/.exec(param);
  if (m) {
    const year = Number(m[1]);
    const week = Number(m[2]);
    // Jan 4 is always in week 1 (ISO 8601).
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const offset = (week - 1) * 7;
    const anchor = new Date(jan4.getTime() + offset * 86400_000);
    return {
      start: startOfISOWeek(anchor),
      end: endOfISOWeek(anchor),
      label: `${year}-W${String(week).padStart(2, "0")}`,
    };
  }
  try {
    const d = parseISO(param);
    return { start: startOfISOWeek(d), end: endOfISOWeek(d), label: weekLabel(d) };
  } catch {
    return currentWeek(now);
  }
}

function weekLabel(d: Date): string {
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`;
}

export function shiftWeekLabel(label: string, weeks: number): string {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(label);
  if (!m) return label;
  const jan4 = new Date(Date.UTC(+m[1], 0, 4));
  const anchor = new Date(jan4.getTime() + (+m[2] - 1) * 7 * 86400_000);
  return weekLabel(addWeeks(anchor, weeks));
}

export function isoDay(d: Date): string {
  return formatISO(d, { representation: "date" });
}
