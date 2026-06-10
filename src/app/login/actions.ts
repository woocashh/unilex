"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function signIn(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rawNext = String(formData.get("next") ?? "/feed");
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/feed";

  if (!email || !password) {
    return { ok: false, error: "Adres e-mail i hasło są wymagane." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, error: "Nieprawidłowy adres e-mail lub hasło." };
  }
  redirect(next);
}
