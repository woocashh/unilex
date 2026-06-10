"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runSourceById } from "@/lib/scrapers/runner";
import { customFeedConfigSchema } from "@/lib/scrapers/adapters/custom-css";
import {
  discoverFeed,
  validateFeedUrl,
  type DiscoveryResult,
} from "@/lib/ai/feedDiscovery";
import { scrapeFetch } from "@/lib/scrapers/http";
import { extractArticleText } from "@/lib/scrapers/extract";

// NOTE: "use server" files may only export async functions — even type-only
// re-exports break Turbopack's server-action transform. Result types live in
// @/lib/ai/feedDiscovery; import them from there.

export async function analyzeFeedUrl(input: {
  url: string;
  feedback?: string;
  previousConfig?: unknown;
}): Promise<DiscoveryResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Brak autoryzacji" };

  return discoverFeed(input);
}

// Full entry view for the setup page's side panel — the article body read
// with the same extractor the alert page uses after a feed is saved.
export async function previewArticle(input: {
  url: string;
  allowInsecureTls?: boolean;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Brak autoryzacji" };

  let url: string;
  try {
    url = validateFeedUrl(input.url);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const res = await scrapeFetch(url, {
      timeoutMs: 15_000,
      allowInsecureTls: !!input.allowInsecureTls,
    });
    if (!res.ok) {
      return { ok: false, error: "Nie udało się otworzyć tego artykułu." };
    }
    const text = extractArticleText(await res.text());
    if (text.length < 80) {
      return {
        ok: false,
        error: "Nie udało się automatycznie odczytać treści tego artykułu.",
      };
    }
    return { ok: true, text };
  } catch {
    return { ok: false, error: "Nie udało się otworzyć tego artykułu." };
  }
}

export async function saveFeedSource(input: {
  url: string;
  name: string;
  config: unknown;
}): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Brak autoryzacji" };

  let url: string;
  try {
    url = validateFeedUrl(input.url);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Najpierw nadaj kanałowi nazwę." };
  const parsed = customFeedConfigSchema.safeParse(input.config);
  if (!parsed.success) return { ok: false, error: "Nieprawidłowa konfiguracja kanału — uruchom analizę ponownie." };

  // Sources are global content — written with the service role, like summaries.
  const admin = createSupabaseAdminClient();
  const slug = await uniqueSlug(admin, slugify(name) || new URL(url).hostname.replace(/\./g, "-"));

  const { data: inserted, error } = await admin
    .from("sources")
    .insert({
      slug,
      name,
      base_url: url,
      adapter_key: "custom-css",
      enabled: true,
      config: parsed.data,
      created_by: userData.user.id,
    })
    .select("id, slug")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Zapis nie powiódł się" };
  }

  // Populate the feed right away so the user lands on results, not an empty
  // page. A failure here is not fatal — cron retries on its schedule.
  try {
    await runSourceById(inserted.id);
  } catch {
    // sources.last_error already records it
  }

  revalidatePath("/feed");
  return { ok: true, slug: inserted.slug };
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  base: string,
): Promise<string> {
  const { data } = await admin
    .from("sources")
    .select("slug")
    .like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }
}
