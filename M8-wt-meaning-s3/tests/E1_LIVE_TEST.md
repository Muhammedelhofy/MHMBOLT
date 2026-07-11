# E1 — Live Test Script (turn integrity)

🔴 Changes write paths + adds a per-session lock. Run these against OPEN prod
after deploy. Migration is ALREADY applied (indexes + m8_turn_locks table).

## What changed
- **Turn guard** (`lib/turn-lock.js`, wired in `api/chat.js` + `api/chat-stream.js`):
  a second request for a sessionId already in flight gets a friendly ⏳ message
  instead of racing the first. Kill: `M8_TURN_LOCK=off`.
- **CAS writes** (`upsertFact`, `persistNote`): supersede+insert now compare-and-swap
  with one retry; a partial unique index makes duplicate `is_current` rows
  impossible. Kill: `M8_CAS_WRITES=off`.
- **Extractor chaining**: the two per-turn fact extractors run sequentially now.
- **Alert CAS** + **consolidator recency fence** (`M8_CONSOLIDATOR_MIN_AGE_MIN`, default 15).

## Live checks (m8-alpha)

### 1. Duplicate-fact prevention (the core fix)
Send (real session): **"My cousin Tarek is visiting from Cairo"**, wait ~5s, then:
```sql
select memory_key, count(*) from m8_conversations
where is_current = true and memory_key is not null
group by memory_key having count(*) > 1;
```
**PASS:** ZERO rows — permanently. (This query should NEVER return a row again.)
And exactly one current row for the cousin fact:
```sql
select id, content, is_current from m8_conversations
where memory_key = 'cousin_name' order by created_at desc;
```
**PASS:** exactly one `is_current = true`.

### 2. Turn guard (two-request race)
Two browser tabs on the SAME session id, send a slow question in both within ~1s
(or fire two `/api/chat` POSTs with the same sessionId back-to-back via curl).
**PASS:** one completes normally; the other returns the ⏳ "still working on your
previous message" text (HTTP 200, not a red error). Then:
```sql
select * from m8_turn_locks;   -- should be empty shortly after (released in finally)
```
**PASS:** no leftover lock rows once both turns finish (TTL 200s would clear a
crashed one anyway).

### 3. Fleet turn still works (alert CAS is inert on the happy path)
Ask **"fleet report"** → normal answer, no error. Alerts still evaluate.

### 4. Notebook singleton (if you use research notes)
Two rapid status writes to the same thread → exactly one current `status` row:
```sql
select thread, kind, count(*) from m8_research_notes
where is_current = true and kind in ('status','next_step')
group by thread, kind having count(*) > 1;
```
**PASS:** zero rows.

### 5. Consolidator cron (next morning)
Check the cron-summarize/consolidate run log → normal run, non-zero `kept`, and
recent facts (< 15 min old at run time) were skipped, not merged. The recency
fence must not have broken the sweep.

## Rollback (flags — inert code-side instantly, no redeploy of code needed)
- `M8_TURN_LOCK=off` → handlers skip acquire/release.
- `M8_CAS_WRITES=off` → upsertFact/persistNote revert to the pre-E1 blind path.
- `M8_CONSOLIDATOR_MIN_AGE_MIN=0` → fence off.
The unique indexes are safe to leave under old code (they only reject writes that
would have corrupted state). `drop index` only if something unforeseen rejects a
legitimate write.
