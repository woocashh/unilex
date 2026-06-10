import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Source } from "@/lib/supabase/types";
import { TopNav } from "@/components/TopNav";
import { SourcesList } from "./SourcesList";

// Formatted on the server in a fixed timezone and passed down as a string —
// formatting Dates inside the client component hydration-mismatches whenever
// the server and browser timezones differ.
const lastRunFormat = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Warsaw",
});

export default async function SourcesPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("sources").select("*").order("name");
  const sources = ((data ?? []) as Source[]).map((s) => ({
    ...s,
    lastRunLabel: s.last_run_at
      ? lastRunFormat.format(new Date(s.last_run_at))
      : null,
  }));

  return (
    <>
      <TopNav />
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Źródła</h1>
            <p className="text-sm text-zinc-500">
              Źródła dodane przez użytkowników można usunąć — razem ze
              wszystkimi ich pozycjami.
            </p>
          </div>
          <Link
            href="/sources/new"
            className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Dodaj źródło
          </Link>
        </div>

        <SourcesList sources={sources} />
      </div>
    </>
  );
}
