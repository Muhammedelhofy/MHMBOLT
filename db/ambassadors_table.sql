-- ambassadors — canonical ambassador names mirrored from the onboarding sheet's
-- AMBASSADORS tab by api/bolt/sync-sheet.js, read by the dashboard dropdown (index.html
-- refreshAmbassadorList) so adding an ambassador is done in ONE place: the sheet.
--
-- Run this ONCE in the Supabase SQL Editor for BOLT project ltqpoupferwituusxwal.
-- RLS posture matches sheet_ambassador_sync / sheet_stage_log: RLS on, anon may SELECT only,
-- all writes go through the service key (which bypasses RLS). Idempotent — safe to re-run.

create table if not exists public.ambassadors (
  name       text primary key,          -- canonical name (sheet AMBASSADORS!A)
  aliases    text,                       -- comma-separated aliases incl. Arabic (sheet col B)
  active     boolean not null default true,  -- sheet col C; blank in the sheet is treated as active
  updated_at timestamptz not null default now()
);

alter table public.ambassadors enable row level security;

-- Anon (the dashboard's browser key) may read only.
drop policy if exists "ambassadors anon read" on public.ambassadors;
create policy "ambassadors anon read"
  on public.ambassadors
  for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policy for anon: those are blocked for the browser key and only the
-- service key (used by api/bolt/sync-sheet.js) can write, since it bypasses RLS entirely.
