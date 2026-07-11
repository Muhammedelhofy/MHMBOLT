# E1 Spec — Turn Integrity (in-flight turn guard + version-checked writes)

Authored by Fable 5 (2026-07-02) from `E1_PREP_MAP.md` (Sonnet prep) + direct code
verification of every cited site. **This is the build contract for an Opus session.**
Per `STRATEGY_2026H2.md` E1. No code was changed in this session.

---

## 0. Diagnosis — which prep findings are the real E1 targets

| Finding | Site | Verdict | Why |
|---|---|---|---|
| 1 — `upsertFact` | [lib/memory.js:567](lib/memory.js) | **CONFIRMED — primary target** | Two extractors fire un-awaited off the SAME user message ([memory.js:479](lib/memory.js) + [:482](lib/memory.js)); both can read "no current row" and both insert `is_current=true`. `m8_conversations` has NO unique constraint on `memory_key` (checked `migrations/*.sql`) — nothing at the DB stops the duplicate. Highest likelihood AND highest impact (memory poisoning = the confirmed E1 pain). |
| 2 — `persistNote` | [lib/notebook.js:460](lib/notebook.js) | **CONFIRMED — secondary, fix comes ~free** | Identical select-current → flip-false → insert shape on `m8_research_notes` singleton kinds (`status`, `next_step`; per-thread). Single-caller today, but the invariant is a comment, not a constraint. Same two-layer fix applies. |
| 3 — alerting `patchAlert`/`upsertAlertRow` | [lib/alerting.js:801-835](lib/alerting.js) | **REAL but DOWNGRADED — one-line hardening only** | `fleet_alerts` has `unique (condition, driver_key)` (migrations/fleet_alerts.sql:24) → duplicate rows are IMPOSSIBLE; the race is last-write-wins on fields. The state machine re-derives from live fleet data every fleet turn, so a clobbered transition self-heals next turn; only counters (`times_raised`, `consecutive_clear`) and timestamps can skew. The turn guard (P1) already serializes the realistic scenario (same session double-fire). Ship only the optional CAS in P4. |
| 4 — cron consolidator vs live turn | [lib/memory-consolidator.js:159-192](lib/memory-consolidator.js) | **CONFIRMED — needs a SEPARATE fix, not the turn lock** | See §5. The per-session turn lock is the wrong shape for a cross-session nightly sweep. Fix = recency fence (skip facts < 15 min old) + the P2 unique index makes the worst case fail-loud instead of corrupt. |
| 5 — module-level caches | fleet/notebook/semantic-router/wallet | **OUT OF SCOPE — do not touch** | Read-side, intentionally TTL-bounded (30s–5min), no persisted corruption possible. Worst case = one stale READ served from a warm instance for one TTL window. E1 is about WRITES. Opus: do not add cross-instance cache invalidation, do not touch these four caches. |

**New fact the prep missed (changes the design):** `orchestrateStream` DELEGATES
non-streamable turns back into `orchestrate()` with `precomputedRoute`
([orchestrator.js:5922](lib/orchestrator.js)). A lock acquired inside
`orchestrate()` would therefore double-acquire/self-block on every delegated
stream turn. **The turn guard must live in the HTTP handlers**
(`api/chat.js`, `api/chat-stream.js`), each of which runs exactly once per
request — never inside the orchestrator.

**Checked and clean (no work needed):** entity writes are cron-only
single-writer (Build-110 moved them out of the live turn; watermarked), and
`saveMemory`'s raw-turn inserts are append-only (no read-then-write).

---

## Architecture — three layers, correctness lives at the bottom

```
Layer 3  Turn guard (per-session in-flight lock)   — reduces conflict FREQUENCY
Layer 2  Extractor chaining (sequential, same turn) — removes the TIGHTEST race
Layer 1  DB: partial unique indexes + CAS writes    — makes bad state UNREPRESENTABLE
```

Correctness must NOT depend on layers 2–3. If the lock table is down or the
kill-flag is off, Layer 1 alone guarantees no duplicate `is_current` rows —
a losing writer gets a loud, handled error instead of silent corruption.

**Deliberate non-decision, recorded:** no `version` integer column. Supersession
is monotonic (a row goes current→superseded exactly once, never back), so
`UPDATE … WHERE id = <id-just-read> AND is_current = true` IS the version check
— equivalent CAS semantics, zero migration risk on the biggest live table.

---

## P1 — In-flight turn guard (per-session server-side lock)

### Migration (part of `migrations/E1_turn_integrity.sql`)
```sql
create table if not exists public.m8_turn_locks (
  session_id  text primary key,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null
);
alter table public.m8_turn_locks enable row level security;
create policy "service role full access" on public.m8_turn_locks
  for all using (true) with check (true);
```

### New module `lib/turn-lock.js`
- `acquireTurnLock(sessionId)` →
  1. Skip entirely (return `{acquired:true, skipped:true}`) when:
     `process.env.M8_TURN_LOCK === "off"` (kill flag), OR
     `isEphemeralSession(sessionId)`, OR session id matches the eval/battery
     prefixes (`/^(l5_|eval_|od_|battery_)/`) — batteries may parallelize and
     must not fight over locks.
  2. `INSERT` the row with `expires_at = now + TTL` (TTL = 200_000 ms; the
     fleet path's function budget is 180s, +margin).
  3. On unique-violation (23505 / PostgREST 409): read the row, call
     `lockDecision(row, Date.now())` (pure, below). `takeover` → CAS-update
     `SET acquired_at=now(), expires_at=now()+TTL WHERE session_id=? AND
     expires_at < now()` with `.select()`; 0 rows back = lost the takeover
     race → `busy`.
  4. **Fail-open:** ANY infra error (Supabase down, timeout) → log +
     `{acquired:true, failOpen:true}`. The guard is hygiene; Layer 1 owns
     correctness. Never let the lock table take down chat.
- `releaseTurnLock(sessionId)` → `DELETE WHERE session_id=?`, non-fatal,
  called in `finally`. Crash-safety = TTL takeover, not release.
- **Pure decision function (PS-mirror target):**
  `lockDecision(existingRow, nowMs)` → `"takeover"` if
  `expires_at < nowMs`, else `"busy"`.

### Wiring — HTTP handlers ONLY (see delegation trap above)
- `api/chat.js` and `api/chat-stream.js`: acquire after body validation,
  wrap the `orchestrate`/`orchestrateStream` call in `try/finally` with release.
- On `busy`: respond **200** with a normal-shaped payload whose text is
  `"⏳ I'm still working on your previous message — give it a few seconds and try again."`
  (M8's never-throw posture; a 409 would render as a red error in the UI).
  Streaming handler emits the same text as a single chunk, same shape as its
  existing single-chunk fallback.
- Crons (`cron-summarize`, `cron-explore`, `cron-verify`, `morning-brief`) do
  **NOT** take turn locks — see P5.

Cost: +1 insert, +1 delete per real chat turn. Acceptable.

---

## P2 — DB constraints: make the duplicate state unrepresentable

Same migration file. **`CREATE UNIQUE INDEX` fails loudly if duplicates exist —
that IS the pre-flight check.** Prep verified zero duplicates on 2026-07-02;
if the index creation ever errors, STOP and investigate, don't force it.

```sql
-- one current row per fact key (facts are global — upsertFact queries without session filter)
create unique index if not exists ux_m8_conversations_current_fact
  on public.m8_conversations (memory_key)
  where is_current = true and memory_key is not null;

-- one current row per (thread, singleton kind) in the research notebook
create unique index if not exists ux_m8_research_notes_current_singleton
  on public.m8_research_notes (thread, kind)
  where is_current = true and kind in ('status', 'next_step');
```

Note the `memory_key is not null` filter: session-summary rows (`role='summary'`,
no `memory_key`) must stay unconstrained.

**Apply order matters:** run this migration in Supabase BEFORE merging the P3
code. During the gap, current code hitting the index during a real race would
log its existing non-fatal `console.error` and drop one write — strictly better
than today's silent duplicate. Window is minutes; acceptable.

---

## P3 — Version-checked (CAS) supersession writes

### `upsertFact` (lib/memory.js:567) — rewrite the write path, keep the filters
Keep untouched: key/statement validation, `isFleetFigureFact`, `isTransientFact`,
embedding, contradiction flags, insert payload shape.

New flow (max 2 attempts, then give up non-fatally — matches existing posture):
1. SELECT current row for key (as today).
2. If current row exists and `content === statement` → return (unchanged).
3. If current row exists → **CAS supersede:**
   `.update({is_current:false, superseded_at:…}).eq("id", cur.id).eq("is_current", true).select("id")`
   — 0 rows returned ⇒ another writer superseded it first ⇒ **restart from 1**
   (attempt 2).
4. INSERT the new current row. On unique-violation (error code `23505` or
   message containing `ux_m8_conversations_current_fact`) ⇒ another writer's
   insert landed first ⇒ **restart from 1** (attempt 2) — the re-read will
   usually hit the "unchanged" exit in step 2, since same-turn racers carry
   the same fact.
5. Second failure ⇒ `console.error("[M8] upsertFact lost race twice for key …")`
   and return. Never throw.

**Pure decision function (PS-mirror target):**
`upsertRetryDecision({phase: "supersede"|"insert", casRows, errCode, attempt})`
→ `"proceed" | "retry" | "give_up"`. All branching above routes through it.

### `persistNote` (lib/notebook.js:460) — same treatment, singleton kinds only
- The supersede loop (notebook.js:473-478) gains the same `.eq("is_current", true).select()`
  CAS shape (it updates by id already — just add the guard + result check).
- The INSERT gains the same 23505-retry (one retry) against
  `ux_m8_research_notes_current_singleton`. Non-singleton kinds are append-only
  and untouched.
- Reuse the SAME `upsertRetryDecision` helper — do not fork the logic.

### `summarizeSession` fact loop (memory.js:711)
No change — it calls `upsertFact`, which is now safe. Its un-awaited launch
(orchestrator.js:5542, :6067) stays as-is.

---

## P4 — Layer 2 + alert hardening (small, bounded)

1. **Chain the per-turn extractors** (memory.js:479-482). Replace the two
   independent fire-and-forgets with ONE background promise that runs them
   sequentially:
   ```js
   _maybeCaptureRelationship(sessionId, userMessage)
     .then(() => _maybeExtractFact(sessionId, userMessage))
     .catch(() => {});
   ```
   Deterministic capture runs FIRST (free, reliable); the LLM extractor then
   re-reads and usually no-ops on the same key. Zero added latency (still
   background); removes the tightest same-turn race entirely.
2. **Alert CAS (optional, one line):** `patchAlert` (alerting.js:811) gains an
   optional `expectedState` param appended as `&state=eq.<expectedState>` to the
   PATCH filter; `applyAndCollect` passes `row.state` when it has a row. A
   0-row PATCH is silently fine — the next fleet turn re-derives. Do NOT
   restructure the alert state machine; counters self-heal.

---

## P5 — Finding 4 (cron vs live): recency fence, NOT the turn lock

The turn lock is per-session; the nightly consolidator sweeps ALL sessions'
facts — taking every lock is the wrong shape and would starve chat.

Fix in `fetchFacts` (memory-consolidator.js:126):
```js
.lt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
```
A fact younger than 15 minutes is never a consolidation candidate; live turns
complete in ≤ 180s, so cron and live can no longer touch the same row. Belt +
suspenders: even if they did, the consolidator's `update(...merged_into...)`
should ALSO gain `.eq("is_current", true).select()` (same CAS shape, reuse the
helper) so a row the live path just superseded is skipped, not re-flipped.
The P2 index already guarantees the end state can't be two-current.

Env override for the fence: `M8_CONSOLIDATOR_MIN_AGE_MIN` (default 15).

---

## Kill flags & rollout (his conventions — flags are inert until MERGED)

| Flag | Default | Effect |
|---|---|---|
| `M8_TURN_LOCK` | on (unset) | `off` ⇒ handlers skip acquire/release entirely |
| `M8_CAS_WRITES` | on (unset) | `off` ⇒ upsertFact/persistNote fall back to the pre-E1 write path (keep the old path behind the flag for ONE build, delete next build) |
| `M8_CONSOLIDATOR_MIN_AGE_MIN` | 15 | 0 ⇒ fence off |

Order of operations:
1. Apply `migrations/E1_turn_integrity.sql` in Supabase (indexes + lock table).
   If either index errors on duplicates → stop, report, do not force.
2. Merge code to main (explicit deploy OK first — deploy-then-self-verify rule).
3. Self-verify against OPEN prod (see test plan) and paste real responses.

Rollback: flags off = behavior reverts code-side instantly. The indexes are
safe to leave in place under old code (they only reject writes that would have
corrupted state). `drop index` only if something unforeseen rejects legitimate
writes.

---

## Test plan

### PS 5.1 mirrors (Node ABSENT on host — pure functions only, mirror the JS exactly)
`M8/tests/e1_turn_integrity.tests.ps1` asserting:
- `lockDecision`: fresh row → busy; expired row → takeover; boundary (expires_at == now) → busy.
- `upsertRetryDecision`: full matrix — supersede CAS 0-rows/attempt-1 → retry; insert 23505/attempt-1 → retry; any failure at attempt-2 → give_up; clean paths → proceed.
- Watch the known PS-mirror gotchas (PS 5.1 `-lt` on strings, hashtable vs object) — a PS-only failure with JS logic sound = fix the mirror.

### Live test script (`M8/tests/E1_LIVE_TEST.md`) — real prod chat
1. "My cousin Tarek is visiting" → then immediately SQL-check: exactly ONE
   `is_current=true` row for `cousin_name` (extractor chaining + index proof).
2. Two tabs, same session id, send simultaneously → second tab gets the ⏳
   busy message; first completes normally (turn guard proof).
3. Normal fleet question → alerts still evaluate, no error (alert CAS is inert
   on the happy path).
4. SQL: `select memory_key, count(*) from m8_conversations where is_current
   group by memory_key having count(*) > 1;` → zero rows, permanently.
5. Next morning: consolidator cron log shows a normal run (recency fence
   didn't break the sweep).

### What Opus must NOT do
- Touch the four read caches (Finding 5) or add cache invalidation.
- Add a `version` column to `m8_conversations`.
- Put the lock inside `orchestrate()`/`orchestrateStream()` (delegation trap).
- Give crons turn locks.
- Change the alert state machine beyond the optional PATCH filter.
- Touch the Bolt fleet spine (`api/bolt/*`, sync, 7am brief) — hands-off live core.
