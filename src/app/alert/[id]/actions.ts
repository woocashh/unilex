"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureFullText } from "@/lib/scrapers/article";
import { summarize } from "@/lib/ai/openrouter";

type Result = { ok: true } | { ok: false; error: string };

export async function toggleActioned(
  alertId: string,
  next: boolean,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Brak autoryzacji" };

  if (next) {
    const { error } = await supabase
      .from("alert_actions")
      .upsert({ user_id: user.id, alert_id: alertId });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("alert_actions")
      .delete()
      .eq("user_id", user.id)
      .eq("alert_id", alertId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/alert/${alertId}`);
  revalidatePath("/feed");
  return { ok: true };
}

export async function markRead(alertId: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Brak autoryzacji" };

  const { error } = await supabase
    .from("alert_reads")
    .upsert(
      { user_id: user.id, alert_id: alertId },
      { onConflict: "user_id,alert_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function generateSummary(alertId: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Brak autoryzacji" };

  // Summaries are global cached content — write with admin to bypass RLS.
  const admin = createSupabaseAdminClient();
  const { data: alert, error } = await admin
    .from("alerts")
    .select("id, source_id, title, url, published_at, summary")
    .eq("id", alertId)
    .single();
  if (error || !alert) return { ok: false, error: error?.message ?? "Nie znaleziono alertu" };
  if (alert.summary) return { ok: true };

  const { data: source } = await admin
    .from("sources")
    .select("name")
    .eq("id", alert.source_id)
    .single();

  const bodyText = await ensureFullText(alertId);
  if (!bodyText) return { ok: false, error: "Nie udało się pobrać treści artykułu ze źródła" };

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
