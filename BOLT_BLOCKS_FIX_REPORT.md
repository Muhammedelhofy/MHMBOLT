# Bolt Dashboard — BLOCKS subsystem fix (audit R1 + R2)

**Branch:** `bolt-blocks-fix` (worktree off origin/main `b825baa`) · **Model:** Opus · med-high · **Risk:** MED (block/unblock queue + CSV merge; frontend + merge path — **no cron changes**). **Status: built + verified locally. NOT merged — awaiting Muhammad's deploy-OK (money/queue-affecting).**

Fixes the two same-code findings in [BOLT_DATA_INTEGRITY_REAUDIT.md](BOLT_DATA_INTEGRITY_REAUDIT.md): R1 (blocked queue wrong both ways — 5 stale + 9 invisible) and R2 (CSV upload blanks live states, which blinds R1's detector).

## What changed (all in `index.html`)

| # | Change | Where | Effect |
|---|---|---|---|
| R1 | **`liveBlockedSet()` / `liveBlockedKeys()`** — "blocked NOW" derived from the live `boltState` on the latest **state-bearing** day, not the block-log | new fns after `updateBlockLog` | queue = live-suspended set; block-log is HISTORY only |
| R1 | **`latestStateBearingEntry()`** — latest day that carries states (source `cron`/`api`, or a merged day that retained `bs`) | new fn | **guard**: a state-less CSV day can never derive block state |
| R1 | **`reconcileBlockLog()`** — closes stale opens (live-active) + opens rows for the invisible suspended; runs on every data arrival incl. cron-merged days | new fn | log stays an honest history; the manual-sync-only gap is closed |
| R1 | Repointed the two block-set read sites to `liveBlockedKeys()` | `computeRosterForMonth` (`blockedCount` + per-driver `blocked`), `buildCourierSummaryTable` (not-"left") | Today / Captains / Star Map / alert-rail counts now = real live-suspended |
| R1 | `reconcileBlockLog()` call added at: `renderBlocks`, CSV upload, manual API sync, `fetchFromCloud`, `syncToCloud` | 5 call sites | reconcile on every arrival + before the log is pushed to cloud |
| R2 | **`mergeDriverEntry()`** — per-driver clash is now per-FIELD: newer wins on ACTIVITY, but state/profile fields (`boltState`, suspension, vehicle, categories, cash flag, rating/score, tier, identity) are RETAINED when the newer side is state-less | inside `mergeDayEntries` | a CSV upload updates activity **without** wiping live Bolt/vehicle states |

The block-log's meaning changes from *source of "who is blocked now"* → *history of when/why a block happened*. `updateBlockLog` is kept (harmless; reconcile is a superset).

## Verification (local — done)

- **Offline unit test** (`scratchpad/blocks_fix_test.js`, extracts the REAL functions from the file): **33/33 pass** — liveBlockedSet = suspended+deactivated only; reconcile closes the 5 stale + opens the invisible + keeps genuinely-suspended + is idempotent; the state-less-CSV guard holds; R2 retains `bs`/`vehicleState`/`rating`/`categories` while newer wins on activity and the F1 union still holds.
- **Browser (preview :3020, seeded fixture: 20 active + 5 stale-open + 9 invisible-suspended + 3 overlap + 1 deactivated):**
  - `blockedCount` (computeRosterForMonth) = **13** = `liveBlockedSet` size; chip "Blocked now" = 13; worklist = 13 blocked rows.
  - All **5 stale auto-closed** (0 shown as blocked; they moved to "Unblocked · 7d").
  - All **9 invisible** + 3 overlap + 1 deactivated now appear as open rows.
  - Genuinely-suspended-with-existing-row stays queued (not double-opened); resolved history untouched.
  - **Zero console errors**; renders in **both themes** (light + dark).
- Full-file JS syntax check: clean (1 inline block, 0 errors).

## Self-verify on prod (after deploy-OK + merge)

1. Open the live dashboard, let it pull from cloud, open the **Blocks** tab.
2. Confirm "Blocked now" ≈ the real live-suspended count (~32 per the audit), the ~25-day stale drivers (ALI/ABDULRAHMAN ALSHAHRANI, etc.) are **gone** from the queue, and the 9 (Bandar Alruwaili … Sahal Alotaibi + ARIF ALMANHALI) now appear.
3. Upload an activity CSV → re-open Blocks + the driver panels → live `bs`/vehicle states are **not** blanked.
4. Cross-check against a read-only Supabase `SELECT` on the latest `fleet_data` day: non-active `bs` count == the chip.
