import { createClient } from "@supabase/supabase-js";

// Service-role client. Server-only. Never import from a "use client" file.
// Used by the cron route to write alerts/scrape_runs bypassing RLS.
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE env vars (URL + SERVICE_ROLE_KEY).");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
