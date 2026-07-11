-- E1 — Turn Integrity (in-flight turn guard + version-checked writes)
-- Build contract: M8/E1_TURN_INTEGRITY_SPEC.md (Fable 5), built by Opus.
--
-- APPLY THIS IN SUPABASE **BEFORE** MERGING THE E1 CODE.
-- The two CREATE UNIQUE INDEX statements below are ALSO the pre-flight check:
-- if either fails with a duplicate-key error, STOP — do NOT force it. That means
-- a duplicate is_current row already exists and must be investigated first
-- (prep verified zero duplicates on 2026-07-02, so a failure = something new).
--
-- Rollback: these objects are safe to leave under old code. The partial unique
-- indexes only reject writes that WOULD have corrupted state; the lock table is
-- inert unless lib/turn-lock.js writes to it. DROP only if something unforeseen
-- rejects a legitimate write.

-- ── P1: per-session in-flight turn lock ──────────────────────────────────────
create table if not exists public.m8_turn_locks (
  session_id  text primary key,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null
);
alter table public.m8_turn_locks enable row level security;
-- Service-role only (matches the rest of M8's write tables; the anon key never
-- touches locks). Drop-and-recreate so re-running this migration is idempotent.
drop policy if exists "service role full access" on public.m8_turn_locks;
create policy "service role full access" on public.m8_turn_locks
  for all using (true) with check (true);

-- ── P2: make the duplicate is_current state UNREPRESENTABLE ───────────────────
-- One current row per fact key. Facts are global (upsertFact queries by
-- memory_key WITHOUT a session filter), so this index is global too. The
-- `memory_key is not null` filter keeps session-summary rows (role='summary',
-- no memory_key) and raw turns unconstrained.
create unique index if not exists ux_m8_conversations_current_fact
  on public.m8_conversations (memory_key)
  where is_current = true and memory_key is not null;

-- One current row per (thread, singleton kind) in the research notebook.
-- Non-singleton kinds are append-only and intentionally unconstrained.
create unique index if not exists ux_m8_research_notes_current_singleton
  on public.m8_research_notes (thread, kind)
  where is_current = true and kind in ('status', 'next_step');
