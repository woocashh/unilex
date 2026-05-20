import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { pl } from "date-fns/locale";
import type { Alert, Source } from "@/lib/supabase/types";
import { SourceAvatar } from "./SourceAvatar";

// Most PL gov sources only expose a date, parsed by adapters as UTC midnight.
// Treat those as date-only so we render an absolute date instead of a
// misleading "X hours ago" measured from 00:00 UTC.
function isDateOnly(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

function CheckBadgeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.5 14.5l-4-4 1.4-1.4 2.6 2.6 6.6-6.6 1.4 1.4-8 8z" />
    </svg>
  );
}

export function FeedItem({
  alert,
  source,
  read,
  actioned,
}: {
  alert: Alert;
  source?: Source;
  read: boolean;
  actioned: boolean;
}) {
  const publishedAt = alert.published_at ? new Date(alert.published_at) : null;

  return (
    <article>
      <Link
        href={`/alert/${alert.id}`}
        className={
          actioned
            ? "group flex gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 opacity-70 transition hover:opacity-100 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50"
            : "group flex gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        }
      >
        {source && <SourceAvatar name={source.name} slug={source.slug} />}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            {source && (
              <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                {source.name}
              </span>
            )}
            {publishedAt && (
              <>
                <span aria-hidden>·</span>
                <time
                  dateTime={publishedAt.toISOString()}
                  title={format(publishedAt, "PPP", { locale: pl })}
                >
                  {isDateOnly(publishedAt)
                    ? format(publishedAt, "d MMM yyyy", { locale: pl })
                    : formatDistanceToNow(publishedAt, { addSuffix: true, locale: pl })}
                </time>
              </>
            )}
            {actioned ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckBadgeIcon />
                ACTIONED
              </span>
            ) : !read ? (
              <span
                data-unread={alert.id}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                NEW
              </span>
            ) : null}
          </div>

          <h3
            className={
              actioned
                ? "mt-1 line-clamp-3 text-[15px] font-semibold leading-snug text-zinc-600 line-through decoration-zinc-400 decoration-[1px] group-hover:underline dark:text-zinc-400"
                : "mt-1 line-clamp-3 text-[15px] font-semibold leading-snug text-zinc-900 group-hover:underline dark:text-zinc-50"
            }
          >
            {alert.title}
          </h3>

          {alert.raw_excerpt && (
            <p className="mt-1.5 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
              {alert.raw_excerpt}
            </p>
          )}

          {alert.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {alert.tags.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
    </article>
  );
}
