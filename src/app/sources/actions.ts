"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

export async function deleteSource(sourceId: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Brak autoryzacji" };

  const admin = createSupabaseAdminClient();
  const { data: source, error } = await admin
    .from("sources")
    .select("id, adapter_key")
    .eq("id", sourceId)
    .single();
  if (error || !source) return { ok: false, error: "Nie znaleziono źródła." };

  // Built-in sources are backed by hand-written adapters and can't be
  // recreated from the UI — only user-added feeds are deletable.
  if (source.adapter_key !== "custom-css") {
    return {
      ok: false,
      error: "Można usuwać tylko źródła dodane przez użytkowników.",
    };
  }

  // Cascades to alerts (and their read/list state) via FK constraints.
  const { error: delErr } = await admin
    .from("sources")
    .delete()
    .eq("id", sourceId);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/sources");
  revalidatePath("/feed");
  return { ok: true };
}
