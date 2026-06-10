"use client";

import { useState, useTransition } from "react";
import { deleteSource } from "./actions";

// Two-step inline confirmation — deleting a source also drops all its alerts.
export function DeleteSourceButton({
  sourceId,
  sourceName,
}: {
  sourceId: string;
  sourceName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-red-300 hover:text-red-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-900 dark:hover:text-red-400"
      >
        Usuń
      </button>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">
          Usunąć „{sourceName}” i wszystkie jego pozycje?
        </span>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteSource(sourceId);
              if (!result.ok) {
                setError(result.error);
                setConfirming(false);
              }
            })
          }
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Usuwanie…" : "Tak, usuń"}
        </button>
        <button
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
        >
          Anuluj
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
