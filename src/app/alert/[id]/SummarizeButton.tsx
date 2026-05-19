"use client";

import { useState, useTransition } from "react";
import { generateSummary } from "./actions";

export function SummarizeButton({ alertId }: { alertId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await generateSummary(alertId);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-progress disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? (
          <>
            <Spinner /> Generating summary…
          </>
        ) : (
          <>
            <Sparkle /> Generate AI summary
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">Failed: {error}</p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Sparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zm6 11l1 2.8L22 17l-2.8 1L18 21l-1-2.8L14 17l2.8-1L18 13z" />
    </svg>
  );
}
