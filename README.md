# Unilex

Daily feed of Polish government legal publications. Each scraper adapter
turns one source page into normalized "alert" rows in Postgres; the Next.js
app shows the current ISO week, with read state and personal lists per user.

## Stack

- Next.js 16 (App Router, React Server Components, server actions)
- Supabase (Postgres + Auth + RLS)
- TypeScript end to end
- Scraping: `undici` + `cheerio`, one adapter per source, run from a Vercel cron

## Project layout

```
src/
  app/
    feed/                 weekly feed view (server component)
    api/cron/scrape/      cron-triggered scraper orchestrator
  lib/
    scrapers/
      types.ts            SourceAdapter / NormalizedItem contract
      http.ts             undici-based fetch with UA + timeout
      registry.ts         maps adapter_key -> adapter
      runner.ts           orchestrates all enabled sources, writes scrape_runs
      adapters/           one file per source
    supabase/
      server.ts           SSR client (cookie-based session)
      browser.ts          client-side client
      admin.ts            service-role client (cron only)
      types.ts            hand-written types until `supabase gen types`
    week.ts               ISO-week helpers
supabase/
  migrations/0001_init.sql   schema + RLS
  seed.sql                   initial source rows
vercel.json                  daily cron at 05:00 UTC
```

## Setup

1. `npm install` (already done by scaffold).
2. Create a Supabase project. Copy `.env.example` to `.env.local` and fill:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Settings → API → service_role)
   - `CRON_SECRET` (any random string for local dev)
3. Apply the schema:
   - Recommended: `supabase db push` after `supabase link --project-ref <ref>`.
   - Or: paste `supabase/migrations/0001_init.sql` then `supabase/seed.sql` into the SQL editor.
4. `npm run dev` and open `http://localhost:3000/feed`.

## Triggering a scrape locally

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/scrape
```

On Vercel the cron in `vercel.json` calls this route daily at 05:00 UTC
(07:00 Warsaw outside DST). Vercel automatically attaches the `CRON_SECRET`
header when the env var is set.

## Adding a new adapter

1. Create `src/lib/scrapers/adapters/<key>.ts` exporting a `SourceAdapter`.
2. Register it in `src/lib/scrapers/registry.ts`.
3. Insert a row into `sources` with `adapter_key = '<key>'`.
4. Trigger `/api/cron/scrape` to verify; check `scrape_runs` for errors.

The two adapters shipped (`knf`, `uodo`) use best-effort CSS selectors. Before
trusting them in production, save a snapshot of each source page and verify
the selectors.

## Known follow-ups

- LLM summary on first open (column `alerts.summary` reserved).
- Tag taxonomy (column `alerts.tags` reserved).
- Heavier sources (gov.pl SPA pages, Sejm Lotus Domino) — start with HTTP + cheerio,
  fall back to Playwright via a separate worker if needed.
