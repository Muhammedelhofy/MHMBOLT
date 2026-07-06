# Bolt Dashboard — Data-Integrity Investigation (READ-ONLY) + Fix Plan

**Date:** 2026-07-06 · **Session:** Fable 5 · high (FINALIZE design pass) · **Mode:** read-only — no live data, no crons, no deploys touched.
**Probes used:** live `GET /api/bolt/health`, live Supabase reads (anon key via `/api/bolt/config`, same reads the browser does) + two read-only SQL `SELECT`s via MCP, and a full code-trace of `api/bolt/*` + the sync/merge/count paths in `index.html`. Every number below is from the LIVE system on 2026-07-06 (~05:00 Riyadh).

> 🔴 = needs Muhammad's decision/action · 🟢 = FYI / already healthy

---

## 1 · VERDICTS — the five backbone questions

| # | Question (brief A/D/E) | Verdict | Evidence |
|---|---|---|---|
| 1 | **Is the Bolt API pull complete?** (oidc.bolt.eu + node.bolt.eu) | 🟢 **YES — complete.** | Last night's cron pulled **98 drivers** (66 `active` + 31 `suspended` + 1 `deactivated`) + 423 orders for 05 Jul. Token + gateway healthy (`health`: `bolt.ok=true`). Roster-seeding in `lib.js` works: drivers with zero orders still land in the day entry. |
| 2 | **Then why 87 (dashboard) vs 97 (portal)?** | 🔴 **Dashboard-side counting, 4 stacked causes — see §2.** | The portal's 97 ≈ the cron's 98 minus the 1 `deactivated` driver. The dashboard under-counts whenever it counts **union-of-names over the selected days** and those days are **activity-only entries** (CSV uploads / pre-fix days). |
| 3 | **Does a sheet edit reach the dashboard?** | 🟢 **YES — verified at every hop** … ⚠ **but only nightly.** | All 3 crons ran last night: fleet 21:52, stage-log 21:51, sheet-mirror 22:10 UTC. Live tables: `sheet_ambassador_sync` 153 rows, `sheet_stage_snapshot` 156 rows / 10 stages, `ambassadors` 17 rows (Team 17/17 ✓). **The "⇅ Sync from sheet" button does NOT read the sheet — it reads the Supabase mirror**, so a same-day sheet edit is invisible until the next 21:45 UTC cron. Misleading, not broken. |
| 4 | **`fleet_data` dual-writer (C1)** | 🔴 **Confirmed, and slightly worse than the arch review:** the cron does **two** full-blob read-modify-writes per night (main write + a second one for `last_cron`), and the browser writes the whole blob **including `khair_history`** from ~20 `syncToCloud()` call sites. No conditional write anywhere. Race window is small (seconds) but real. | `cron-sync.js:97-102,133-142`, `index.html syncToCloud()` (≈8184-8245). |
| 5 | **Are the nightly cron + backups actually reliable?** | 🟢 **YES.** | `fleet_data_backup` = **16 rows, one per night, 20 Jun → 05 Jul, zero gaps** (service-key SQL; the table is invisible to the anon key — correct RLS posture, but it means the dashboard itself can't display backup health; see F8). Hobby-plan lateness last night ≈ 52 min — normal. |

---

## 2 · THE 87-vs-97 MECHANISM — proven with live data

**The live history right now (newest first, `dc` = drivers in the day's entry):**

| Day | dc | uploadedAt | What it is |
|---|---|---|---|
| 05 Jul | **98** | 05 Jul 21:52 (midnight cron) | ✅ Full roster day (API, seeded) |
| 04 Jul | **67** | **05 Jul 14:57** | ⚠ Activity-only upload |
| 03 Jul | **67** | **05 Jul 14:57** | ⚠ Activity-only upload |
| 02 Jul | **67** | **05 Jul 14:57** | ⚠ Activity-only upload |
| 01 Jul | 74 | 02 Jul 12:02 | ⚠ Activity-only upload |
| 30 Jun … back | 45–74 | various | ⚠ Pre-roster-fix days (all activity-only) |

**Four stacked causes, in order of importance:**

1. **A later partial upload silently REPLACES a complete cron day.** `mergeHistories()` resolves a same-day conflict by *newest `uploadedAt` wins* (deliberate — it lets a correction overwrite a bad entry). Proof it fires the wrong way: 02–04 Jul were complete 98-driver cron days at midnight; at 14:57 on 05 Jul a 3-day upload replaced all three with 67-driver versions. **The mirror silently lost 31 drivers × 3 days.**
2. **CSV/manual uploads only contain drivers with activity.** Bolt's CSV export is an earnings report, not a roster. Every CSV-sourced day is structurally a subset (67 ≈ drivers who drove; 98 = fleet).
3. **Fleet counts are computed as union-of-names over the SELECTED days.** Captains (`buildCourierSummaryTable`), aggregated views (`buildAggregatedDrivers`) etc. count who *appears in the period*. Pick a month whose days are all activity-only (all of June) → union lands in the 80s → "87". The portal's 97 is a *current roster*, a different animal. The two numbers can never agree while views count unions of activity.
4. **Name-keyed identity splits drivers.** Aggregation keys by lowercased *name* (`driverId` admitted to be unstable across CSV report types). Live: union over all 58 stored days = **100 unique keys** vs 98 real — ≥2 phantom identities from renames/spelling (Arabic↔EN).

**A fifth landmine, currently dormant:** `getDepartedKeys()` defines "the roster" as *whatever period sorts newest and has drivers*. Today that's the cron's 98-roster day — correct. But upload a partial CSV for *today* and it becomes the roster: ~28 zero-order-but-active drivers instantly get **LEFT FLEET** badges (open-block drivers are protected; idle actives are not).

**Where "87" specifically:** any union-over-period surface during a CSV-only stretch (June: per-day 45–74, month union ≈ 87). Not one buggy line — a *semantics* problem: **activity entries are being used as roster.**

---

## 3 · SHEET → DASHBOARD FLOW — hop-by-hop verification (live, last night)

```
Google Sheet (17-GCTaqEiCvCrcCrDvBm9DcCtljPcAJ3RpJTBkAJs0s)
  ├─ DRIVERS tab ──── 21:45 UTC cron (sync-sheet.js) ──► sheet_ambassador_sync  153 rows, synced 22:10:31 ✓
  ├─ AMBASSADORS tab ─ same cron ─────────────────────► ambassadors             17 rows, Team 17/17, 22:10:33 ✓
  └─ STAGE LOG/SNAPSHOT ─ 21:30 UTC cron (sync-stage-log.js) ─► sheet_stage_log 315 · snapshot 156 (10 stages), 21:51:04 ✓
Browser reads all three tables directly with the anon key (cached per page-load). ✓
```

- **Data blockers status (D1/D2):** Nationality **68/153** filled (was ~33 — being filled, 85 to go) · ambassador attribution 105/153 · Team **done** 17/17.
- **The gap is latency, not plumbing:** edits land on the dashboard after the nightly mirror. The "⇅ Sync from sheet" button *re-reads the stale mirror* and its name promises more than it does. Fix = F5.
- Mirror hygiene is good: ghost-row deletion + phone-dedupe + empty-read guards all present in `sync-sheet.js`.

---

## 4 · C1 — dual-writer, exact current shape

- **Writers:** midnight cron (`service` key) and any browser (`anon` key — RLS allows it *by design*, see memory note). Both do read-whole-blob → mutate → write-whole-blob via upsert. No `updated_at` guard, no retry.
- **Cron writes twice per run:** main write (backup → merge day → write) then `writeCronLog()` re-reads and writes the whole blob again just to set `last_cron`. Doubles the collision surface for zero benefit — `last_cron` can ride the main write (failure-path write stays).
- **Browser writes the whole blob — including history — on every `syncToCloud()`**, which fires on profile edits, settings, block-log changes, month reconcile, etc. (~20 call sites). The blob also still carries dead legacy keys `h` + `fmt` (pre-Build-106 cron format, never read).
- **Race consequence proven possible** (not observed): browser read at T₀ → cron writes new day at T₁ → browser writes T₀-based merge at T₂ → the cron's day vanishes from cloud AND is *not* self-healed next night (next cron merges only *its own* new day). Recovery = `fleet_data_backup` (healthy) or a manual Bolt re-sync of the lost date.
- **Why it hasn't bitten:** the window is seconds, at midnight, when nobody edits. The 02–04 Jul overwrite in §2 was NOT this race — it was `mergeHistories` semantics working as (mis)designed.

---

## 5 · MINOR FINDINGS (recorded, low priority)

| # | Finding | Exposure today |
|---|---|---|
| m1 | `paginateAll` exits on `items.length < limit` — if Bolt ever serves pages smaller than the requested 1000, the pull silently truncates to page 1. | None at current scale (423 orders, 98 drivers ≪ 1000). Harden in F7 anyway — it's 2 lines. |
| m2 | `hoursOnline` ignores time online *before* the first in-window state log (driver online across midnight loses the pre-first-log stretch). | Small daily-hours undercount for overnight drivers. |
| m3 | Legacy `h`/`fmt` keys still stored in the blob every write. | Dead weight only. Drop in F4's write path. |
| m4 | Anon-key can overwrite the whole `fleet_data` row (shareable via the page). | Known + accepted (internal tool, nightly backups). Re-check only if a link leaks. |
| m5 | Backup health invisible to the dashboard (RLS-hidden from anon). | Settings health card can't show "16/16 backups ✓". F8 exposes a count via a tiny `security definer` SQL function or the existing `health.js` (service key). |

---

## 6 · FIX PLAN — ranked, for the execution sessions

**Nothing here is done yet. Order matters: F1 kills the active data-loss class; F4 is the only 🔴 touches-live item and ships last, on a watched night.**

| # | Fix | What changes | Model · Effort | Risk to live core |
|---|---|---|---|---|
| **F1** | **Per-driver day-entry merge (kill partial-overwrite).** A new entry for an existing period no longer replaces it wholesale: per-driver merge — incoming drivers overwrite matching keys, existing drivers *absent* from the incoming entry are RETAINED (as-is if incoming is activity-only). Wholesale replace stays available behind an explicit "force replace" confirm (the correction path `mergeHistories` was built for). Tag every entry with a source: codec gains `s: 'cron'|'api'|'csv'` (additive, both codec copies + parity test). | `index.html` `mergeHistories`/upload path, `codec.js` + inline mirror, `cron-sync.js` packEntry (adds `s:'cron'`) | Opus · med | MED — cron file touched additively; fixture-tested round-trip before OK |
| **F2** | **One fleet-roster truth.** New `getFleetRoster()` = drivers of the latest *roster-bearing* entry (src `cron`/`api` after F1; interim heuristic: latest entry whose `dc` ≥ 80% of the 14-day max `dc`). Every "fleet size" display reads THIS; period views relabel their number "with activity in ⟨period⟩"; Settings Data-Health card shows the reconciliation line: *"Roster 98 = portal 97 + 1 deactivated"*. | `index.html` count surfaces (Captains header, Star Map, Analytics, Today, Data Health) | Sonnet · med (mechanical once F1 lands) | NONE (display semantics) |
| **F3** | **`getDepartedKeys` hardening.** "Latest roster update" = latest roster-bearing entry (same rule as F2), never a partial CSV day. | `index.html:2804` | folds into F2 | NONE |
| **F4** | **C1 concurrency guard (arch-review SPEC 3, refined).** (a) Conditional write: both writers carry the read `updated_at`, write via `UPDATE … WHERE updated_at = seen` (PostgREST `If-Unmodified-Since` semantics / eq-filter PATCH); on 0-rows → re-read, re-merge, retry once, then surface. (b) Cron folds `last_cron` into the single main write. (c) Browser sends `khair_history` **only when history is dirty** (CSV upload / manual Bolt sync / day delete set a flag) — routine profile/settings syncs stop carrying history at all. (d) Drop legacy `h`/`fmt` keys. Two-writer test against a throwaway `id='__concurrency_test__'` row only. | `cron-sync.js`, `index.html` sync layer | **Opus · high 🔴** | HIGH — ship behind Muhammad's explicit deploy-OK on a night he can watch; `fleet_data_backup` is the net |
| **F5** | **On-demand sheet refresh.** New `POST /api/bolt/sync-sheet-now`: same module functions as the cron path, auth = a `DASH_SYNC_KEY` env var the Settings page stores locally (never the CRON_SECRET), server-side rate-limit (reject if last run < 60s via a timestamp in the mirror table). Button becomes two honest actions: **"Refresh mirror now"** (calls the endpoint, then re-reads) and the existing local re-match. | new endpoint + small Settings/Ambassadors UI | Sonnet · med | LOW — additive endpoint; cron path untouched |
| **F6** | **ID-first driver identity (optional, recommended).** Key by `driverId` (API uuid) with name fallback + the existing nameMapping as alias store — heals the 100-vs-98 phantom keys and Arabic/EN rename splits. Bigger blast radius (every aggregation) — schedule as its own session AFTER F1–F4 settle, or explicitly skip for handoff and document the quirk. | `index.html` keying helpers | Opus · high | MED (frontend only, wide) |
| **F7** | **Small hardenings:** `paginateAll` loops on `all.length < total` with a max-page guard (m1); hoursOnline window-start credit (m2). | `lib.js` | Sonnet · low | LOW (lib is shared — verify with one manual `/api/bolt/sync` before/after) |
| **F8** | **Backup visibility:** `health.js` (already service-key) adds `backups: {count, latest}` from `fleet_data_backup`; Settings health card displays it. | `health.js` + card | Sonnet · low | NONE |

**Acceptance for the whole backbone (QA pass, cross-cutting D):**
1. Dashboard fleet count == portal count ± explained rows, and the Data-Health card *states the reconciliation* ("98 = 97 portal + 1 deactivated").
2. Upload a partial CSV for an existing cron day → roster preserved, activity updated, no LEFT-FLEET badges appear.
3. Kill-test on the throwaway row: stale-browser-write after cron-write loses nothing.
4. Sheet edit → "Refresh mirror now" → visible on dashboard in < 60 s.
5. "Orders" columns verified as TRIPS against the portal for one known day (Build-128 label audit — see tab spec #9).
6. Incentives month total == Finance P&L incentive line for the same month (formula parity assertion).

---

## 7 · WHAT THIS SESSION TOUCHED

**Live system: nothing.** All probes were `GET`/`SELECT` (health endpoint, anon REST reads, 2 read-only SQL queries). No table written, no cron invoked, no deploy. The `/api/bolt/sync` endpoint was **not** invoked either (it's read-only server-side, but unnecessary — `last_cron` already answered the completeness question).
