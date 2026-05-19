-- Unilex initial schema
-- Run via Supabase CLI (`supabase db push`) or paste into the SQL editor.

create extension if not exists pgcrypto;

-- Sources: one row per scraper target
create table public.sources (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  base_url     text not null,
  adapter_key  text not null,
  enabled      boolean not null default true,
  last_run_at  timestamptz,
  last_error   text,
  created_at   timestamptz not null default now()
);

-- Alerts: one row per scraped item, deduped by (source, external_id)
create table public.alerts (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.sources(id) on delete cascade,
  external_id   text not null,
  url           text not null,
  title         text not null,
  published_at  timestamptz,
  raw_excerpt   text,
  full_text     text,
  summary       text,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  unique (source_id, external_id)
);

create index alerts_published_at_idx on public.alerts (published_at desc);
create index alerts_source_published_idx on public.alerts (source_id, published_at desc);
create index alerts_tags_gin on public.alerts using gin (tags);

-- Observability: one row per scraper invocation per source
create table public.scrape_runs (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references public.sources(id) on delete cascade,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  items_found  int not null default 0,
  items_new    int not null default 0,
  error        text
);

create index scrape_runs_source_started_idx on public.scrape_runs (source_id, started_at desc);

-- Per-user read state
create table public.alert_reads (
  user_id   uuid not null references auth.users(id) on delete cascade,
  alert_id  uuid not null references public.alerts(id) on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (user_id, alert_id)
);

-- Personal saved lists
create table public.lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create index lists_user_idx on public.lists (user_id);

create table public.list_items (
  list_id    uuid not null references public.lists(id) on delete cascade,
  alert_id   uuid not null references public.alerts(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (list_id, alert_id)
);

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.sources       enable row level security;
alter table public.alerts        enable row level security;
alter table public.scrape_runs   enable row level security;
alter table public.alert_reads   enable row level security;
alter table public.lists         enable row level security;
alter table public.list_items    enable row level security;

-- Sources & alerts: any signed-in user can read; only service role writes.
create policy "sources_read"   on public.sources       for select to authenticated using (true);
create policy "alerts_read"    on public.alerts        for select to authenticated using (true);
create policy "runs_read"      on public.scrape_runs   for select to authenticated using (true);

-- Read state: owned by user
create policy "reads_owner_select" on public.alert_reads for select to authenticated
  using (user_id = auth.uid());
create policy "reads_owner_write"  on public.alert_reads for insert to authenticated
  with check (user_id = auth.uid());
create policy "reads_owner_delete" on public.alert_reads for delete to authenticated
  using (user_id = auth.uid());

-- Lists: owned by user
create policy "lists_owner_all" on public.lists for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- list_items: only if you own the parent list
create policy "list_items_owner_select" on public.list_items for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "list_items_owner_write" on public.list_items for insert to authenticated
  with check (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "list_items_owner_delete" on public.list_items for delete to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));
