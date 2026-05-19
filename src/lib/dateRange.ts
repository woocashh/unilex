import { formatISO } from "date-fns";

export type DateRange = {
  start: Date;
  end: Date;
  /** YYYY-MM-DD strings — what we round-trip through the URL and <input type=date>. */
  fromDay: string;
  toDay: string;
  /** True when neither from nor to was set explicitly. */
  isDefault: boolean;
};

const DEFAULT_DAYS = 7;

/** Last 7 calendar days, UTC, ending today (inclusive). */
export function defaultRange(now = new Date()): DateRange {
  const end = endOfDayUTC(now);
  const start = startOfDayUTC(addDaysUTC(now, -(DEFAULT_DAYS - 1)));
  return {
    start,
    end,
    fromDay: isoDay(start),
    toDay: isoDay(end),
    isDefault: true,
  };
}

export function parseDateRange(params: {
  from?: string;
  to?: string;
}): DateRange {
  if (!params.from && !params.to) return defaultRange();

  const now = new Date();
  const startInput = parseDayParam(params.from) ?? addDaysUTC(parseDayParam(params.to) ?? now, -(DEFAULT_DAYS - 1));
  const endInput = parseDayParam(params.to) ?? now;

  const start = startOfDayUTC(startInput);
  let end = endOfDayUTC(endInput);
  if (end < start) end = endOfDayUTC(start);

  return {
    start,
    end,
    fromDay: isoDay(start),
    toDay: isoDay(end),
    isDefault: false,
  };
}

function parseDayParam(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  // Expect YYYY-MM-DD; treat as UTC.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function addDaysUTC(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function isoDay(d: Date): string {
  return formatISO(d, { representation: "date" });
}
