# E1 Prep Map — Turn Integrity (stale-state races)

Prepared by a Sonnet session (2026-07-02) so the Fable 5 E1 session opens with a
diagnosis surface instead of spending quota on file discovery. Per
`STRATEGY_2026H2.md` E1: "In-flight turn guard + version-checked memory/entity
writes (stateless serverless races → stale answers)" — confirmed pain #2.

**Method:** grepped every read-then-write pattern in `M8/lib` touching shared
state (`is_current` flags, module-level caches, alert state), then checked
Supabase for footprints of an actual race having fired. No code was changed.

## Finding 1 — `upsertFact` (lib/memory.js:567) — the core race site
Read-then-conditionally-update-then-insert with **no version check, no lock**:
```
existing = SELECT ... WHERE memory_key=key AND is_current=true LIMIT 1
if existing changed: UPDATE existing SET is_current=false
INSERT new row with is_current=true
```
Called from THREE independent paths that can overlap for the **same fact key**:
- `_maybeExtractFact` (memory.js:445) — LLM-based extraction, fired from
  `saveMemory` **without await** (`.catch(() => {})`, memory.js:479).
- `_maybeCaptureRelationship` (memory.js:413) — deterministic regex path,
  ALSO fired without await from the same `saveMemory` call (memory.js:482).
- `summarizeSession`'s fact loop (memory.js:711), which can fire on a
  **different session_id** if two sessions discuss the same durable fact
  (e.g. "Sara is my wife") close in time.

Because (1) and (2) both run per turn, un-awaited, off the SAME user message,
a message like "Sara is my wife" can trigger BOTH extractors to call
`upsertFact({key:"spouse_name", ...})` nearly simultaneously. If both read
"no current row" before either inserts, you get **two `is_current=true` rows
for the same key** — a live duplicate-fact bug, not just theoretical.

**Nested TOCTOU:** `_maybeCaptureRelationship` itself does a read
(`_findConflictingPersonFact`, memory.js:392) then calls `upsertFact` (another
read+write) — two round trips with no transaction between them.

## Finding 2 — `persistNote` (lib/notebook.js:460) — same pattern, different table
Comment at line 456 says "called ONCE per turn from the orchestrator STORE
phase" — this is an **assumption, not an enforced invariant**. Same
select-current → update-false → insert-new shape as Finding 1, for the
research-notebook ledger's singleton kinds (status/next_step). A retried or
duplicated STORE-phase call would race identically.

## Finding 3 — `patchAlert` / `upsertAlertRow` (lib/alerting.js:811+)
Alert state machine (`raised → acknowledged → in_progress → resolved →
re_raised/snoozed`) is read via `evaluateAlerts` and written via
`applyAndCollect` on EVERY fleet turn (orchestrator.js ~3781). Two fleet
questions in quick succession (or a delegated-turn double-fire, see B-169f's
fix for a related but distinct issue) both read the alert row, both compute a
transition, both write — last-write-wins with no version check.

## Finding 4 — background CRON vs. live-turn race (cross-process, not just cross-request)
`lib/memory-consolidator.js` (nightly sweep, Build-85e) reads `is_current=true`
rows and writes `merged_into` + `is_current=false` on groups it consolidates
(lines 130, 168, 185). This is a **second, independent process** doing the
exact same read-then-write on `is_current` that `upsertFact` does live. If the
nightly sweep runs while a live chat turn is mid-`upsertFact` for a row the
sweep is also touching, there is no lock between the cron and the live path.

## Finding 5 — module-level caches (Vercel warm-instance staleness, NOT bugs by design, but relevant)
Four in-memory caches survive across invocations on a warm Lambda instance:
`fleet.js:234 _recCache` (30s TTL), `notebook.js:444 _threadCache` (30s TTL),
`semantic-router.js:175 _exemplarCache` (no TTL, warms once), `wallet.js:482
_membersCache` (5min TTL). These are **intentional, bounded, documented**
staleness for READ paths — not the E1 bug class. Flagging so Fable doesn't
mistake them for the target; the real risk is a write invalidating the cache
in ITS OWN process's memory while a DIFFERENT warm instance still serves the
old cached value (invalidation doesn't propagate cross-instance). Worth one
line in the E1 design ("is this in scope or explicitly out?") but likely OUT
— these are read-side, low-stakes, already TTL-bounded.

## Client-side mitigation that already exists (partial, not sufficient)
`M8/js/chat.js:114-115` disables the send button while a request is in
flight (`if (btn.disabled) return; btn.disabled = true;`) — blocks
same-tab double-submit. Does **not** protect against: two tabs/devices on
the same session, a client-perceived timeout that re-enables the button while
the server is still processing (the fleet cache comment references a 180s
function budget), or any retry at the network/CDN layer.

## Live evidence gathered — NONE found (checked, not skipped)
Queried `m8_conversations` in the real Supabase project:
- Zero rows where the same `memory_key` has more than one `is_current=true`
  row (checked both globally and per-session_id).
- Checked tight-timestamp pairs on the same `session_id`; the only 0-second
  pairs found are the paired user+assistant rows from a single `saveMemory`
  insert call — an artifact of the query, not evidence of a race.

**Honest read:** the race conditions above are structural (found by reading
the code), not yet confirmed by a data footprint. Either it hasn't fired yet,
consolidation quietly cleans up duplicates before anyone notices, or the
window is just narrow enough not to have been hit. Fable's job is to assess
real-world likelihood/impact per site and design the guard — not to hunt for
a smoking gun that isn't in the DB.

## Suggested Fable session scope
1. Confirm/refute Findings 1-4 as the actual E1 targets (vs. anything this
   map missed — this was one grep pass, not exhaustive).
2. Design the "in-flight turn guard" (per-session, so two overlapping
   requests for the same sessionId can't both mutate state) — decide
   client-guard vs. server-side (advisory lock / version column / a
   `turn_lock` row) and where it needs to sit (just `upsertFact`? all four
   write sites? a shared helper?).
3. Design "version-checked memory/entity writes" — likely an optimistic
   version column (or `WHERE is_current=true AND id=<id-just-read>` compare-
   and-swap on the UPDATE) so a losing writer detects the conflict instead of
   silently clobbering.
4. Decide whether Finding 4 (cron vs. live) needs the SAME guard or a
   separate one (cron could simply skip rows younger than N minutes).
5. Explicitly scope Finding 5 OUT (or note why not) so Opus doesn't scope-creep.
6. Output: a spec Opus can execute — which files, which functions, what the
   guard looks like, and what the PS mirror test needs to assert.
