import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { scrapeFetch } from "./http";
import { extractArticleText } from "./extract";

// Sources whose certs aren't in Node's CA bundle (Certum etc).
const INSECURE_TLS_SLUGS = new Set(["uodo"]);

/**
 * Ensure `alerts.full_text` is populated for the given alert.
 * Idempotent: if the column is non-empty, just returns it.
 * Returns null if extraction failed (caller decides whether to surface).
 */
export async function ensureFullText(alertId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("alerts")
    .select("id, url, full_text, source_id")
    .eq("id", alertId)
    .single();
  if (error || !data) return null;
  if (data.full_text && data.full_text.length > 80) return data.full_text;

  const { data: source } = await admin
    .from("sources")
    .select("slug")
    .eq("id", data.source_id)
    .single();

  try {
    const res = await scrapeFetch(data.url, {
      allowInsecureTls: INSECURE_TLS_SLUGS.has(source?.slug ?? ""),
      timeoutMs: 20_000,
    });
    if (!res.ok) return null;
    const text = extractArticleText(await res.text());
    if (text.length < 80) return null;
    await admin.from("alerts").update({ full_text: text }).eq("id", alertId);
    return text;
  } catch {
    return null;
  }
}
