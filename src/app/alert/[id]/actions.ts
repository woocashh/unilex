"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureFullText } from "@/lib/scrapers/article";
import { summarize } from "@/lib/ai/openrouter";
import { isAuthed } from "@/lib/auth/requireAuth";

type Result = { ok: true } | { ok: false; error: string };

export async function toggleActioned(
  alertId: string,
  next: boolean,
): Promise<Result> {
  if (!(await isAuthed())) return { ok: false, error: "Unauthorized" };
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("alerts")
    .update({ actioned_at: next ? new Date().toISOString() : null })
    .eq("id", alertId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/alert/${alertId}`);
  revalidatePath("/feed");
  return { ok: true };
}

export async function generateSummary(alertId: string): Promise<Result> {
  if (!(await isAuthed())) return { ok: false, error: "Unauthorized" };
  const admin = createSupabaseAdminClient();

  const { data: alert, error } = await admin
    .from("alerts")
    .select("id, source_id, title, url, published_at, summary")
    .eq("id", alertId)
    .single();
  if (error || !alert) return { ok: false, error: error?.message ?? "Alert not found" };
  if (alert.summary) return { ok: true };

  const { data: source } = await admin
    .from("sources")
    .select("name")
    .eq("id", alert.source_id)
    .single();

  const bodyText = await ensureFullText(alertId);
  if (!bodyText) return { ok: false, error: "Could not extract article body from source" };

  let summary: string;
  try {
    summary = await summarize({
      title: alert.title,
      sourceName: source?.name ?? "",
      url: alert.url,
      publishedAt: alert.published_at,
      bodyText,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  await admin.from("alerts").update({ summary }).eq("id", alertId);
  revalidatePath(`/alert/${alertId}`);
  return { ok: true };
}
