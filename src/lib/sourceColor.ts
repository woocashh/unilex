import type { Source } from "@/lib/supabase/types";

// User-added feeds can carry a custom avatar color in their selector config
// (sources.config.color, set by the feed setup agent). Built-ins return
// undefined and fall back to SourceAvatar's slug-hash color.
export function sourceColor(source?: Source | null): string | undefined {
  const config = source?.config as { color?: unknown } | null | undefined;
  return typeof config?.color === "string" ? config.color : undefined;
}
