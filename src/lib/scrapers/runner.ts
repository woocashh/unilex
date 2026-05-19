import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Source } from "@/lib/supabase/types";
import { getAdapter } from "./registry";
import { makeAdapterFetch } from "./http";
import type { NormalizedItem } from "./types";

const ADAPTER_TIMEOUT_MS = 25_000;

type RunResult = {
  source: string;
  ok: boolean;
  itemsFound: number;
  itemsNew: number;
  error?: string;
};

export async function runAllScrapers(): Promise<RunResult[]> {
  const admin = createSupabaseAdminClient();
  const { data: sources, error } = await admin
    .from("sources")
    .select("*")
    .eq("enabled", true);
  if (error) throw error;

  const results = await Promise.allSettled(
    (sources as Source[]).map((s) => runOne(s, admin)),
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          source: sources![i].slug,
          ok: false,
          itemsFound: 0,
          itemsNew: 0,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
  );
}

async function runOne(
  source: Source,
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<RunResult> {
  const adapter = getAdapter(source.adapter_key);
  const startedAt = new Date();

  const { data: runRow, error: runErr } = await admin
    .from("scrape_runs")
    .insert({ source_id: source.id, started_at: startedAt.toISOString() })
    .select("id")
    .single();
  if (runErr) throw runErr;
  const runId = runRow!.id as string;

  if (!adapter) {
    const error = `No adapter registered for key '${source.adapter_key}'`;
    await admin
      .from("scrape_runs")
      .update({ finished_at: new Date().toISOString(), error })
      .eq("id", runId);
    await admin
      .from("sources")
      .update({ last_run_at: new Date().toISOString(), last_error: error })
      .eq("id", source.id);
    return { source: source.slug, ok: false, itemsFound: 0, itemsNew: 0, error };
  }

  const deadline = new Date(Date.now() + ADAPTER_TIMEOUT_MS);
  let items: NormalizedItem[] = [];
  let error: string | undefined;

  try {
    items = await withTimeout(
      adapter.fetchItems({
        baseUrl: source.base_url,
        deadline,
        fetch: makeAdapterFetch(ADAPTER_TIMEOUT_MS),
      }),
      ADAPTER_TIMEOUT_MS,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  let itemsNew = 0;
  if (items.length > 0 && !error) {
    const rows = items.map((i) => ({
      source_id: source.id,
      external_id: i.externalId,
      url: i.url,
      title: i.title,
      published_at: i.publishedAt?.toISOString() ?? null,
      raw_excerpt: i.excerpt ?? null,
      // Adapters that already have the body (CSV/API) write it here so the
      // alert page skips the lazy HTML scrape.
      ...(i.fullText ? { full_text: i.fullText } : {}),
      ...(i.streamUrl ? { stream_url: i.streamUrl } : {}),
    }));

    const { data: inserted, error: upErr } = await admin
      .from("alerts")
      .upsert(rows, { onConflict: "source_id,external_id", ignoreDuplicates: true })
      .select("id");
    if (upErr) {
      error = upErr.message;
    } else {
      itemsNew = inserted?.length ?? 0;
    }
  }

  const finishedAt = new Date().toISOString();
  await admin
    .from("scrape_runs")
    .update({
      finished_at: finishedAt,
      items_found: items.length,
      items_new: itemsNew,
      error: error ?? null,
    })
    .eq("id", runId);

  await admin
    .from("sources")
    .update({ last_run_at: finishedAt, last_error: error ?? null })
    .eq("id", source.id);

  return {
    source: source.slug,
    ok: !error,
    itemsFound: items.length,
    itemsNew,
    error,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Adapter timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
