# Bolt Dashboard FINALIZE — S1 (Mirror-accuracy backbone: the 87-vs-97 fix)

**Date:** 2026-07-06 · **Session:** Opus · high · **Branch:** `bolt-finalize-s1` (off `main`, which now has S0 live)
**Status:** ✅ built + verified on :3017 against **real prod data**. **NOT merged — awaiting deploy-OK.**
⚠️ Touches the **live cron** (`cron-sync.js`) — *additively* (adds one field). Verified by the codec parity test + browser round-trip before hand-off.

Implements F1/F2/F3 from `BOLT_DATA_INTEGRITY_FINDINGS.md`. This is the "backbone before beauty" rung — it must land before S2 restyles any counting surface.

---

## The problem (proven, from the findings)
The dashboard showed **87** drivers, Bolt's portal **97**. Root cause: **activity-only CSV uploads were being used as the roster.**
1. A later partial CSV upload (activity-only, ~67 drivers) **silently replaced** a complete nightly-cron roster day (~98) — `mergeHistories` resolved same-day conflicts by "newest wins, wholesale."
2. "Fleet size" was counted as a **union of who drove** over the selected days — a different animal from a current roster.
3. `getDepartedKeys` treated **any** latest day with drivers as "the roster," so a partial upload for *today* would falsely badge ~28 idle-but-active drivers **LEFT FLEET**.

## What changed (`index.html` +112/−25, `api/bolt/cron-sync.js` +1)

### F1 · Per-driver day-merge + entry source tag — *kills the data-loss class*
- **`mergeDayEntries(older, newer)`** — a new entry for an existing period no longer replaces it wholesale. Drivers are **unioned by key**: the newer entry wins on matching keys; drivers present in the older entry but **absent** from the newer one are **RETAINED**. Aggregates recomputed from the merged set. Wired into **both** `saveToHistory` (a fresh upload) and `mergeHistories` (local↔cloud reconciliation).
- **Source tag** `s: 'cron' | 'api' | 'csv'` added to `packEntry`/`unpackEntry` (inline) and to the **cron's** `packEntry` (`s:'cron'`, additive — the one live-file touch). A merged day keeps a roster source if either side had one, so it still reads as roster-bearing.
- **Force-replace** (wipe a genuinely bad day) is the existing **History → Delete** (`deleteHistoryEntry`) then re-upload — the explicit correction path the old wholesale behaviour used to serve.

### F2 · One fleet-roster truth
- **`getRosterEntry()` / `getFleetRoster()`** — the roster = drivers of the latest **roster-bearing** entry (source `cron`/`api`; interim heuristic for pre-tag history: latest entry whose driver count ≥ 80% of the recent 14-day max). Partial CSV days are ignored.
- **`getRosterReconciliation()`** + a new **Data-Health line** stating the reconciliation on-screen:
  **"Fleet roster (05 Jul 2026) 98 = 97 on Bolt portal + 1 deactivated · 66 active · 31 blocked."**
- Analytics' misleading "Total Drivers / current fleet" KPI (a period-union count) relabeled **"In view · with activity in period"** so it's no longer mistaken for the roster. (Remaining count surfaces adopt `getFleetRoster()` as each is restyled in S2 — the guardrail order.)

### F3 · `getDepartedKeys` hardening
- "Latest roster" now = `getRosterEntry()` (a roster-bearing entry), never a partial CSV day — so a same-day partial upload can't manufacture false LEFT-FLEET badges.

---

## Verification (:3017, real prod data — reads only)
- **Codec parity test green (11/11)** — `packDriver` unchanged, cron-safe (the `s` tag is entry-level, not driver-level).
- **F1 merge (unit, in-browser):** a partial CSV merged into a cron roster → driverCount stays **2/2** (roster retained), the active driver takes the CSV values, the **suspended driver absent from the CSV is RETAINED**, merged source stays `cron`. Source round-trips through pack/unpack.
- **F2/F3 on the LIVE history:** `getFleetRoster()` = **98** (picks 05 Jul, ignores the 67-driver partial days); reconciliation = **98 = 97 portal + 1 deactivated (66 active · 31 suspended)** — exactly the findings' numbers; `getDepartedKeys` = **2** (the real phantom name-splits) instead of a partial-day-induced ~28.
- **Data-Health card** renders the reconciliation line; **Captains / Analytics / Today** (all consumers of `getDepartedKeys`) render clean. **Zero console errors** throughout.

### Acceptance (findings §6) — status
1. ✅ Dashboard fleet count == portal ± explained rows, and Data-Health **states** the reconciliation.
2. ✅ Partial CSV into an existing cron day → roster preserved, no LEFT-FLEET (verified via `mergeDayEntries` + F3).
3. ⏭ Two-writer kill-test → **S6** (concurrency, not S1).
4. ⏭ On-demand sheet refresh → **F5/S5**.
5. ⏭ "Orders"=Trips portal check → **S2 #9** (Captains restyle).

## Note on already-damaged history
The stored 02–04 Jul days are **already** the 67-driver partials (clobbered before this fix). F1 prevents *future* clobbering; those specific past days would need a Bolt re-sync (or `fleet_data_backup` restore) to fully repopulate — a data-recovery task, not code. Crucially, `getRosterEntry` already **ignores** them, so the roster truth (98) is correct today regardless.

## Guardrails
- Own worktree off `main`; only `index.html` + `api/bolt/cron-sync.js` (+ this report) touched. `packEntry`/`packDriver` codec integrity held (parity test).
- Live core otherwise untouched (no writes, no cron invoked, no deploy). Cron change is a single additive field, fixture-verified.
- **STOPPED before merge — deploy-OK needed** (this rung touches the live cron file; ship when convenient — no watched-night required, that's S6).

## Next rung
**S2 — core components + heavy tabs:** A1 driver panel · A2 filter/sort/date system · A3 alert-rail registry · Captains #9 · Blocks #5 · Analytics #4. Counting surfaces there read `getFleetRoster()` (now available).
