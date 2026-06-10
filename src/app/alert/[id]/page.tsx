import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Alert, Source } from "@/lib/supabase/types";
import { TopNav } from "@/components/TopNav";
import { SourceAvatar } from "@/components/SourceAvatar";
import { sourceColor } from "@/lib/sourceColor";
import { ensureFullText } from "@/lib/scrapers/article";
import { SUMMARIZER_LABEL } from "@/lib/ai/openrouter";
import { SummarizeButton } from "./SummarizeButton";
import { ArticlePreview } from "./ArticlePreview";
import { ActionedButton } from "./ActionedButton";
import { MarkReadOnView } from "@/components/ClientReadState";

type Params = Promise<{ id: string }>;

export default async function AlertPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: alert }, { data: sources }, { data: userData }] = await Promise.all([
    supabase.from("alerts").select("*").eq("id", id).single(),
    supabase.from("sources").select("*"),
    supabase.auth.getUser(),
  ]);

  if (!alert) notFound();
  const a = alert as Alert;
  const source = (sources as Source[] | null)?.find((s) => s.id === a.source_id);

  let actionedAt: string | null = null;
  if (userData.user) {
    const { data: action } = await supabase
      .from("alert_actions")
      .select("actioned_at")
      .eq("alert_id", a.id)
      .maybeSingle();
    actionedAt = action?.actioned_at ?? null;
  }

  // Lazy-scrape: populate full_text on first view so we have body to display
  // and a cached input for summarization later. Safe to call repeatedly.
  const bodyText = a.full_text ?? (await ensureFullText(a.id));
  const publishedAt = a.published_at ? new Date(a.published_at) : null;

  return (
    <>
      <TopNav />
      <MarkReadOnView alertId={a.id} />
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <Link
          href="/feed"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Wróć do aktualności
        </Link>

        <article className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
          {/* Source row */}
          <div className="flex items-center gap-3">
            {source && (
              <SourceAvatar
                name={source.name}
                slug={source.slug}
                size={40}
                color={sourceColor(source)}
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {source?.name ?? "Nieznane źródło"}
              </p>
              <p className="text-xs text-zinc-500">
                {publishedAt
                  ? format(publishedAt, "EEEE, d MMMM yyyy", { locale: pl })
                  : "data nieznana"}
              </p>
            </div>
          </div>

          <h1 className="mt-5 text-2xl font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[28px]">
            {a.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Czytaj na {hostname(a.url)} ↗
            </a>
            {a.stream_url && (
              <a
                href={a.stream_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:ring-red-900"
              >
                <PlayIcon /> Transmisja na żywo
              </a>
            )}
            <ActionedButton alertId={a.id} initialActionedAt={actionedAt} />
          </div>

          {/* Article body preview */}
          <ArticlePreview body={bodyText} sourceUrl={a.url} />

          <hr className="my-6 border-zinc-200 dark:border-zinc-800" />

          {/* Summary section */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Streszczenie AI
              </h2>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {SUMMARIZER_LABEL}
              </span>
            </div>

            {a.summary ? (
              <SummaryMarkdown text={a.summary} />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-zinc-500">
                  Streszczenie nie zostało jeszcze wygenerowane.
                </p>
                <SummarizeButton alertId={a.id} />
              </div>
            )}
          </section>
        </article>
      </div>
    </>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Minimal markdown renderer for the bulleted summary. Handles `- ` lists,
// **bold**, *italic*, paragraphs.
function SummaryMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul
        key={`u${blocks.length}`}
        className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200"
      >
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    const m = /^[-•*]\s+(.*)$/.exec(line);
    if (m) {
      bullets.push(m[1]);
    } else {
      flushBullets();
      blocks.push(
        <p
          key={`p${blocks.length}`}
          className="text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200"
        >
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushBullets();

  return <div className="space-y-3">{blocks}</div>;
}

function renderInline(s: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let i = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(<strong key={i++}>{tok.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}
