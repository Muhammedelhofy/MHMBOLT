# Bolt Fleet System — Architecture Review & Ranked Improvement Plan

**Date:** 2026-07-04 · **Reviewer session:** Fable 5 · high · **Mode:** READ-ONLY (no code changed, staged, or deployed)
**Scope:** the Bolt fleet **dashboard** (`MHMBOLT` repo — `index.html` + `api/bolt/*` + 3 Vercel crons, Supabase `ltqpoupferwituusxwal`) and the Google-Sheet **onboarding** automation it syncs from.
**Guardrail honoured:** the live core (nightly Bolt sync + 3 crons + backups) was mapped, never touched. The parallel M8 repo was not opened.

> **How to read this:** 🔴 = needs a decision/action from you · 🟢 = FYI only. Every backlog row carries **Impact / Effort / Risk-to-live-core**. Code problems and data problems are kept in separate tables — don't build code for a data gap.

---

## 1. STRUCTURE MAP — how it actually fits together today

### 1.1 The three sources of truth

| Layer | Where | What it holds |
|---|---|---|
| **Bolt Fleet API** | `oidc.bolt.eu` (token) + `node.bolt.eu/fleet-integration-gateway` | Orders, driver profiles, state-logs, suspensions — the raw fleet truth |
| **Google Sheet** (`17-GCTaqEiCvCrcCrDvBm9DcCtljPcAJ3RpJTBkAJs0s`) | Google cloud, Apps Script | Onboarding pipeline (16-stage, Iqama-keyed), ambassador attribution, nationality |
| **Supabase** `ltqpoupferwituusxwal` | cloud Postgres | The dashboard's persisted state + the sheet mirrors |

### 1.2 Data flow (nightly + on-demand)

```
                        ┌─────────────────── BOLT FLEET API ───────────────────┐
                        │ getCompanies · getFleetOrders · getFleetStateLogs ·    │
                        │ getDrivers (rating/score/vehicle/suspension/categories)│
                        └───────────────┬───────────────────────────────────────┘
                                        │  lib.js  fetchAndAggregateFleet(date)   ← SHARED by both syncs
                    ┌───────────────────┴────────────────────┐
                    ▼                                         ▼
      cron-sync.js  (CRON 21:00 UTC = 00:00 Riyadh)     sync.js  (manual, POST /api/bolt/sync {date})
      syncs YESTERDAY-Riyadh, packs c1,                 returns aggregated drivers to the BROWSER
      writes fleet_data.khair_history                   (browser then packs c1 + writes fleet_data)
      + fleet_data_backup (pre-overwrite) + last_cron
                    │                                         │
                    ▼                                         ▼
              ┌───────────────────────── SUPABASE ─────────────────────────┐
              │ fleet_data (id='fleet')  ← ONE jsonb blob = whole app state │◄──────┐
              │ fleet_data_backup (1 row/day)                               │       │ anon key
              │ ambassadors · sheet_ambassador_sync                         │       │ read+WRITE
              │ sheet_stage_log · sheet_stage_snapshot                      │       │
              └───────▲───────────────────────────────────▲────────────────┘       │
                      │ service key (write)               │ anon key (read)         │
     ┌────────────────┴───────────┐        ┌──────────────┴───────────────┐   ┌─────┴──────────────┐
     │ sync-sheet.js CRON 21:45   │        │  BROWSER  index.html          │   │ BROWSER syncToCloud │
     │  DRIVERS  → sheet_amb_sync  │        │  /api/bolt/config → SB url+key│   │ read-modify-WRITE   │
     │  AMBASSADORS → ambassadors  │        │  fetchFromCloud → unpack c1   │   │ whole fleet_data    │
     │ sync-stage-log.js CRON 21:30│        │  → merge into localStorage    │   │ (user-triggered)    │
     │  STAGE LOG/SNAPSHOT → tables│        │  reads amb/stage tables direct│   └─────────────────────┘
     └───────────▲─────────────────┘        └───────────────────────────────┘
                 │ service-account JWT (RS256), readonly scope
     ┌───────────┴───────────────────────────────────────────┐
     │  GOOGLE SHEET  (Apps Script, 16-stage onboarding)      │
     │  tabs: DRIVERS · AMBASSADORS · STAGE LOG · STAGE SNAPSHOT│
     └────────────────────────────────────────────────────────┘
```

### 1.3 Sync points & schedule (Vercel Hobby — up to ~1h late is NORMAL)

| Cron (UTC) | Riyadh | Endpoint | Writes | Status |
|---|---|---|---|---|
| `0 21 * * *` | 00:00 | `cron-sync.js` | `fleet_data.khair_history` + backup + `last_cron` | 🟢 LIVE, core |
| `30 21 * * *` | 00:30 | `sync-stage-log.js` | `sheet_stage_log`, `sheet_stage_snapshot` | 🟡 LIVE cron, **no-op** until the sheet's STAGE LOG/SNAPSHOT tabs exist |
| `45 21 * * *` | 00:45 | `sync-sheet.js` | `sheet_ambassador_sync`, `ambassadors` | 🟢 LIVE, core |

### 1.4 Supabase schema (reconstructed from code — not read live, per hands-off posture)

| Table | Key | Written by | Read by | Notes |
|---|---|---|---|---|
| `fleet_data` | `id` (`'fleet'`) | cron **and** browser | browser, health.js | **One jsonb blob** = history + profiles + overrides + block-log + settings + mappings |
| `fleet_data_backup` | `id`,`backup_date` | cron only | manual restore | 1 snapshot/day, pre-overwrite |
| `ambassadors` | `name` | sync-sheet (service) | browser (anon read) | RLS: anon SELECT only; `team` drives EGP/SAR |
| `sheet_ambassador_sync` | `id` | sync-sheet (service) | browser (anon read) | DRIVERS mirror: name, phone, ambassador, nationality |
| `sheet_stage_log` | `row_key` | sync-stage-log | browser (pipeline) | append-per-transition |
| `sheet_stage_snapshot` | `driver_id` | sync-stage-log | browser (pipeline) | current stage per driver |
| `fleet_alerts` | ? | — | — | 🔴 In memory's RLS note but **not referenced by any current code** — likely orphan/legacy. Verify & drop or document. |

### 1.5 Known failure modes (mapped, not touched)

1. **`fleet_data` is a single row with two independent writers** (cron + browser), each doing read-modify-write of the *whole* blob with **no locking / no optimistic concurrency**. Last-writer-wins on the entire object → a lost-update is possible (see §2 C1). Mitigated in practice because browser writes are user-triggered and the cron fires at midnight when nobody's on the dashboard; mitigated after-the-fact by the daily backup.
2. **The c1 codec is duplicated** (`index.html` `packDriver/packEntry` **and** `cron-sync.js` `packDriver/packEntry`). It has already drifted at least once (Build-167 comment: `putS("cat", …) // was missing here`). Any new field must be edited in two places or auto-synced days silently lose it.
3. **The browser writes `fleet_data` with the anon key.** RLS therefore allows anon INSERT/UPDATE on that row — so anyone with the anon key (embedded in the page, and shareable via `?sb=` links) can overwrite the entire fleet dataset. "By design" for an internal shared tool; the daily backup is the safety net.
4. **Vercel Hobby cron lateness** (≤ ~1h) is expected; not a bug.
5. **Bolt token / Google JWT** are cached in-memory per warm serverless instance; a cold start re-auths. Fine, but there's no retry/alert if Bolt auth 401s at midnight beyond `last_cron.ok=false` (health card surfaces it next time you look).

---

## 2. RANKED IMPROVEMENT BACKLOG

### 2A. CODE problems (architecture — worth engineering)

| # | Problem | Impact | Effort | Risk to live core | Verdict |
|---|---|---|---|---|---|
| **C1** | **`fleet_data` dual-writer, no concurrency control.** Cron + browser both read-modify-write the whole blob; a lost update can silently drop a synced day or a profile edit. | HIGH (silent data loss) but LOW likelihood | HIGH (design-first) | **HIGH — touches the live core** | 🔴 **Design-only now.** Add optimistic concurrency (conditional write on `updated_at`), don't re-architect storage yet. Spec below. |
| **C2** | **c1 codec duplicated & drifting** between `index.html` and `cron-sync.js`. Proven bug class (Build-167). | MED-HIGH (auto-synced days silently miss fields) | LOW-MED | MED (`cron-sync.js` is live) | 🔴 **Highest value / lowest risk. Do first.** Single source of truth + parity test. Spec below. |
| **C3** | **`index.html` monolith** — 15,376 lines, one `<script>`, 546 functions, no build, no tests. Finance + ambassadors + blocks + pipeline + an embedded **M8 command center** + voice + sci-fi FX all in one file. | HIGH (velocity, regression risk) | HIGH | LOW (frontend only; live core is the crons) | 🟢 **Don't big-bang.** Extract only the *pure, testable* logic (codec, money math, matching) into small importable modules + tests. Delete dead code first (C4). |
| **C4** | **Dead `dailyMode` / `renderDailyView` legacy.** `renderDailyView()` writes to a `dailyContent` DOM node that no longer exists → throws if reached ([index.html:3369](index.html:3369)). Callers `selectDate` + [index.html:6004-6032](index.html:6004) are orphaned; `dailyMode`, `setDailyMode`, the toggle buttons are dead. | LOW (clutter/confusion) | LOW | NONE (provably unreachable frontend) | 🟢 **Cheap win.** Delete after confirming each caller is unreachable. Spec below. |
| **C5** | **JSONBin legacy backend** still fully present (`createBin`, custom-key quota UI, `slimForCloud` 96KB cap, `?bin=`/`?k=` links). Prod auto-configures Supabase via `/api/bolt/config`, so this path is vestigial and doubles the sync/mental surface (the "100KB cap" concept only exists because of it). | MED (maintenance, confusion) | MED | LOW-MED (must confirm SB always configured) | 🟢 Quarantine now; remove once you're sure `config.js` always serves Supabase. Not urgent. |
| **C6** | **Embedded M8 command center + voice + sci-fi FX** inside the dashboard (~29 m8/voice fn defs, 251 `m8*` refs, holo/radar/warp/cortex/biometric). Overlaps a now-separate M8 product; voice was flaky (handoff §2). | MED (weight, duplicated intent) | MED-HIGH | LOW (frontend) | 🟢 Decide intent: keep as a local quick-command layer, or retire the voice half. Not blocking. |
| **C7** | **Doc/comment drift.** `sync-stage-log.js` header says "NOT wired into vercel.json" — but it **is** (cron `30 21`). `OPERATOR_RUNBOOK.md` is dated 2026-06-20/v5.0 and predates 5+ builds. `README.md` is **empty (0 lines)** for a system a non-engineer operates headless. | MED (operator safety) | LOW | NONE | 🔴 Refresh runbook + fix the stale header + write a real README. Cheap, high operator value. |
| **C8** | **`slimForCloud` 96KB budget still runs on the JSONBin path only**, but the constant/logic lingers app-wide and confuses reasoning about Supabase (which has no cap). Coupled to C5. | LOW | LOW | LOW | 🟢 Folds into C5. |

### 2B. Fragility / ops notes (not full features)

- 🟢 **`sync-stage-log` cron fires daily into a no-op** (tabs don't exist yet → 400 caught → syncs nothing). Harmless, but it's an unverified live cron. Either activate it (needs the Apps-Script stage-log module + tabs) or drop it from `vercel.json` to shrink the live surface.
- 🟢 **No alert on a failed midnight sync** beyond `last_cron.ok=false` surfaced in the Settings health card *when you next open it*. A push/email on failure would close the "breaks headless, can't fix" gap. (Respect: don't wire this into the hands-off cron without a plan.)
- 🟢 **Anon-key write exposure** on `fleet_data` (§1.5.3) — acceptable for now given the daily backup; revisit only if a share link ever leaks externally.

### 2C. DATA problems (NOT architecture — do not spec code)

| # | Gap | Blocks | Fix (who) | Verdict |
|---|---|---|---|---|
| **D1** | **DRIVERS `Nationality` column empty (0/109)** in the onboarding sheet | Ambassador-bonus-v2 / 💸 Incentives currency + Saudi-tier logic | Data entry in the sheet | 🔴 **Not code.** The code is done (Build-168) and correctly shows "blocked until filled" instead of wrong numbers. |
| **D2** | **AMBASSADORS `Team` column empty (0/13)** (Egypt/Saudi → EGP/SAR) | Team-based referrer incentive split | Data entry in the sheet | 🔴 **Not code.** Same as D1. |
| **D3** | **Apps-Script STAGE LOG / STAGE SNAPSHOT module not pasted** → tabs don't exist → stage sync is a no-op | 🚦 Onboarding stage-delay analytics | Paste the module + create tabs in the sheet | 🟡 Ops/deploy gap, partly sheet-side. See §4. |

> **The single most important separation in this report:** the Incentives/Ambassador feature is **not** blocked by architecture — it is blocked by two empty spreadsheet columns (D1, D2). Filling ~122 cells unblocks a shipped feature. No code session is needed for it.

---

## 3. TOP SPECS (execute with no further design)

### ⭐ SPEC 1 — Single-source the c1 codec + parity guard  `[Sonnet · medium]`

**Why:** C2 is the best impact:risk trade in the whole backlog — it silently corrupts auto-synced days and has already bitten once.

**Problem today:** `packDriver/packEntry/unpackDriver/unpackEntry` exist in `index.html` (~[8035-8103](index.html:8035)) **and** a hand-mirrored subset in `cron-sync.js` (~[41-79](api/bolt/cron-sync.js:41)). The cron's copy omits many fields (`acceptance`, `tier`, `fleetCut`, finance fields) and must be manually kept in step.

**Deliverable:**
1. Create `api/bolt/codec.js` (CommonJS) exporting `packDriver, unpackDriver, packEntry, unpackEntry, CLOUD_FMT` — the **superset** currently in `index.html`.
2. `cron-sync.js` `require("./codec")` and deletes its local copies. (Cron entries will now carry the full field set — strictly additive; the browser already tolerates extra keys.)
3. Make the browser use the same source without a build step: serve `codec.js` and load it via `<script src="/api/bolt/codec.js">` **or** (simpler, zero-infra) keep the browser copy but add a **parity test** `tests/codec_parity.test.js` that imports both and asserts `Object.keys` equality on a fixture driver, failing CI/local if they diverge. **Pick the `<script src>` route if the browser can fetch `/api/bolt/codec.js` as a static asset on Vercel; otherwise the parity test.**
4. Round-trip test: `unpack(pack(driver)) deep-equals driver` for a fixture covering every field, incl. `cat`, `vs/vsr`, `bsc/bss`, `hcp`, `tl/tn`.

**Guardrails:** additive only; do not change field semantics or the `khair_history` shape; verify a manual Bolt-sync still round-trips before/after. Do not deploy — hand back for Muhammad's explicit OK.

**Done =** one codec definition, cron requires it, a green round-trip + parity test, and a note in the runbook that fields are added in ONE place.

---

### ⭐ SPEC 2 — Dead-code purge + operator-doc refresh  `[Sonnet · low]`

**Why:** C4 + C7 are zero-risk clutter removal that also improves the odds Muhammad can recover the system himself if it breaks.

**Deliverable:**
1. **Prove & delete the `dailyMode` legacy:** confirm nothing reachable calls `renderDailyView` (its `dailyContent` node doesn't exist; callers `selectDate` + [6004-6032](index.html:6004) are orphaned). Remove `renderDailyView`, `setDailyMode`, `selectDate`, the dead callers, the `dailyMode` global, and the toggle-button HTML. Keep `renderSingleDay`/`renderCompareView` (still used by `captainView`). Load the page after removal; zero console errors; Captains tab unchanged.
2. **Fix the stale header** in `sync-stage-log.js` ("NOT wired into vercel.json" → it is; state its real status: LIVE cron, no-op until tabs exist).
3. **Rewrite `README.md`** (currently empty): what the system is, the 3 crons, the sheet dependency, "data lives in Supabase `fleet_data`," and a pointer to `OPERATOR_RUNBOOK.md`.
4. **Refresh `OPERATOR_RUNBOOK.md`:** add the two sheet crons (stage-log + ambassador sync), the "up to ~1h late is normal" note, and the fact that Incentives is blocked on sheet columns (D1/D2), not a bug.

**Guardrails:** frontend + docs only; no change to any `api/bolt/*` behaviour; nothing deployed.

**Done =** page loads clean with the legacy gone, docs match reality, README non-empty.

---

### ⭐ SPEC 3 — Optimistic-concurrency guard on `fleet_data`  `[Opus · high]` 🔴 touches-live, design-first

**Why:** C1 is the deepest fragility. The point of this spec is a **minimal, additive** guard — NOT a storage re-architecture (splitting history into per-day rows is a separate, larger, riskier project to schedule later).

**Problem:** cron and browser both do read → mutate → write of the whole `fleet_data` blob. If the browser read predates a cron write and then writes, the cron's day is lost.

**Deliverable (conservative):**
1. **Detect the race with a conditional write.** On both writers, carry the `updated_at` read alongside the record; on write, use PostgREST `If-Unmodified-Since` / an `updated_at` equality filter (or a Supabase RPC that does `UPDATE … WHERE updated_at = :seen`). If the row moved under you → re-read, re-merge, retry once, then surface a clear status. This is additive and low-risk (falls back to today's behaviour on the retry).
2. **Shrink the browser's write window:** when Supabase is on, have the browser write **only the keys it owns** (mappings/settings/profiles/overrides/block-log via a targeted merge) and let `khair_history` be written **only** on an actual data change (CSV upload / manual Bolt-sync), never on incidental syncs — so routine browser activity can't collide with the cron at all.
3. **Verify** with a scripted two-writer test against a throwaway `id='__concurrency_test__'` row (never `'fleet'`): simulate cron-write + stale-browser-write, assert no day is lost.

**Guardrails (hard):** the live `id='fleet'` row and the midnight cron are HANDS-OFF during dev — test only against a throwaway id. `fleet_data_backup` stays the safety net. Ship behind Muhammad's explicit deploy OK, on a day he can watch the next midnight run. If the conditional-write proves fiddly on PostgREST, stop and report — do not force it.

**Done =** a lost-update is detected and retried instead of silently overwriting, proven on the throwaway row, with the live core untouched until an explicit go.

---

## 4. Apps-Script half — what to export (source is in Google's cloud, not this repo)

The onboarding automation's `.gs` source isn't in the repo, so this review covered the **dashboard-facing contract** it must honour (the tab names + column headers the Vercel syncs read). To review the Apps-Script half properly next session, export it:

**In the sheet → `Extensions → Apps Script`**, then from the editor's left **Files** panel, download/copy **every** file:
1. **All `.gs` files** — at minimum the main `Code.gs` plus any module files (likely: the 16-stage state machine / onboarding logic; the STAGE LOG + STAGE SNAPSHOT writer; ambassador/nationality helpers; any `onEdit`/`onFormSubmit` handlers).
2. **`appsscript.json`** (the manifest — click the ⚙️ *Project Settings* → "Show appsscript.json manifest" if hidden). Shows scopes + time-zone.
3. **Triggers** — from the editor's ⏰ *Triggers* panel, list every trigger (type + which function + schedule). Screenshot or note them; they aren't in the `.gs` export.

**Paste those into a `sheet-apps-script/` folder** (or attach) and the next session can review: the stage machine, the STAGE LOG/SNAPSHOT writers that D3 depends on, the Iqama-keying, and whether the `Nationality`/`Team` columns (D1/D2) are wired to any validation that would make backfilling them safer.

**The contract the dashboard already expects** (so the export can be checked against it):
- `DRIVERS` tab: headers incl. `Driver ID`, `Full Name`, `Phone`, `Source / Ambassador`, `Nationality`.
- `AMBASSADORS` tab: `Name` (canonical), `Aliases`, `Active`, `Team`.
- `STAGE LOG` tab: `When`, `Driver ID`, `Full Name`, `Iqama`, `From Stage`, `To Stage`, `Days in From-Stage`, `Source`, `Editor`.
- `STAGE SNAPSHOT` tab: `Driver ID`, `Iqama`, `Full Name`, `Current Stage`, `Entered Current Stage At`.

---

## 5. Suggested sequencing

| Order | Item | Model · Effort | Why here |
|---|---|---|---|
| 1 | **Fill Nationality + Team columns** (D1, D2) | *you, in the sheet* | Unblocks a shipped feature with ~122 cells; no code |
| 2 | **SPEC 2** dead-code purge + docs | Sonnet · low | Zero risk, clears clutter before deeper work |
| 3 | **SPEC 1** single-source codec | Sonnet · medium | Highest value:risk; kills a live silent-data-loss class |
| 4 | Export the Apps Script (§4) | *you, 10 min* | Unlocks the onboarding-half review + D3 |
| 5 | **SPEC 3** concurrency guard | Opus · high 🔴 | Deepest fix; do only when you can watch a midnight run |
| 6 | C5/C6 (JSONBin + M8/voice retirement) | Sonnet · medium | Optional cleanup once the above land |

---

*Read-only review. Nothing was changed, staged, committed, or deployed. Move this file into Muhammad-OS yourself.*
