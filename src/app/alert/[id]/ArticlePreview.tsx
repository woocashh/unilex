"use client";

import { useState } from "react";

const COLLAPSED_CHARS = 1600;

export function ArticlePreview({
  body,
  sourceUrl,
}: {
  body: string | null;
  sourceUrl: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!body) {
    return (
      <p className="mt-5 rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
        Nie udało się pobrać treści ze źródła. Otwórz oryginał poniżej.
      </p>
    );
  }

  const overflows = body.length > COLLAPSED_CHARS;
  const visible = !overflows || expanded ? body : body.slice(0, COLLAPSED_CHARS);
  const paragraphs = splitParagraphs(visible);

  return (
    <div className="mt-5">
      <div className="relative">
        <div className="space-y-3 text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {overflows && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent dark:from-zinc-900" />
        )}
      </div>

      {overflows && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {expanded ? (
              <>
                <Chevron direction="up" /> Show less
              </>
            ) : (
              <>
                <Chevron direction="down" /> Show more
              </>
            )}
          </button>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Open original ↗
          </a>
        </div>
      )}
    </div>
  );
}

function Chevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ transform: direction === "up" ? "rotate(180deg)" : undefined }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Heuristic paragraph splitter for normalized plain text — chunks on sentence
// boundaries every ~320 chars so the body reads as paragraphs instead of one wall.
function splitParagraphs(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const sentence of text.trim().split(/(?<=[.!?])\s+/)) {
    if (cur.length + sentence.length > 320 && cur.length > 0) {
      out.push(cur.trim());
      cur = sentence;
    } else {
      cur += (cur ? " " : "") + sentence;
    }
  }
  if (cur) out.push(cur.trim());
  return out;
}
