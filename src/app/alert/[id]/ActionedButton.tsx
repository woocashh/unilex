"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { toggleActioned } from "./actions";

export function ActionedButton({
  alertId,
  initialActionedAt,
}: {
  alertId: string;
  initialActionedAt: string | null;
}) {
  const [actionedAt, setActionedAt] = useState<string | null>(initialActionedAt);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    const next = !actionedAt;
    const optimisticTimestamp = next ? new Date().toISOString() : null;
    setActionedAt(optimisticTimestamp);
    startTransition(async () => {
      const res = await toggleActioned(alertId, next);
      if (!res.ok) {
        setActionedAt(initialActionedAt);
        setError(res.error);
      }
    });
  }

  const isActioned = !!actionedAt;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={isActioned}
        className={
          isActioned
            ? "inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100 disabled:opacity-60 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900"
            : "inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        }
      >
        <CheckIcon filled={isActioned} />
        {isActioned ? "Actioned" : "Mark as actioned"}
      </button>
      {isActioned && actionedAt && (
        <p className="text-xs text-zinc-500">
          on {format(new Date(actionedAt), "d MMM yyyy, HH:mm", { locale: pl })}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">Failed: {error}</p>
      )}
    </div>
  );
}

function CheckIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.5 14.5l-4-4 1.4-1.4 2.6 2.6 6.6-6.6 1.4 1.4-8 8z" />
    </svg>
  ) : (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
