-- User-added sources: the feed setup agent stores a CSS-selector config here,
-- consumed by the 'custom-css' adapter. created_by is informational only —
-- sources stay global (readable by every signed-in user), writes go through
-- server actions with the service role, same as alert summaries.

alter table public.sources
  add column config jsonb,
  add column created_by uuid references auth.users(id) on delete set null;
