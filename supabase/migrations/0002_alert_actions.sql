-- Make "actioned" state per-user instead of global.
-- Mirrors alert_reads. Drops the obsolete global alerts.actioned_at column.

create table public.alert_actions (
  user_id     uuid not null references auth.users(id) on delete cascade,
  alert_id    uuid not null references public.alerts(id) on delete cascade,
  actioned_at timestamptz not null default now(),
  primary key (user_id, alert_id)
);

create index alert_actions_alert_idx on public.alert_actions (alert_id);

alter table public.alert_actions enable row level security;

create policy "actions_owner_select" on public.alert_actions for select to authenticated
  using (user_id = auth.uid());
create policy "actions_owner_write"  on public.alert_actions for insert to authenticated
  with check (user_id = auth.uid());
create policy "actions_owner_delete" on public.alert_actions for delete to authenticated
  using (user_id = auth.uid());

alter table public.alerts drop column if exists actioned_at;
