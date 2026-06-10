// Minimal types until we wire `supabase gen types typescript`.

export type Source = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  adapter_key: string;
  enabled: boolean;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  /** Selector config for the 'custom-css' adapter; null for built-in adapters. */
  config: unknown | null;
  created_by: string | null;
};

export type Alert = {
  id: string;
  source_id: string;
  external_id: string;
  url: string;
  title: string;
  published_at: string | null;
  raw_excerpt: string | null;
  full_text: string | null;
  summary: string | null;
  tags: string[];
  stream_url: string | null;
  created_at: string;
};
