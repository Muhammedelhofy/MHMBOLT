# Bolt Dashboard — Post-FINALIZE Data-Integrity RE-AUDIT (READ-ONLY)

**Date:** 2026-07-07 (~15:30 Riyadh) · **Session:** Fable 5 · high · **Mode:** read-only re-audit — zero writes, zero deploys, zero cron invocations.
**Baseline:** [BOLT_DATA_INTEGRITY_FINDINGS.md](BOLT_DATA_INTEGRITY_FINDINGS.md) (F1–F8, 2026-07-06). This doc re-verifies every backbone claim against the LIVE system after the FINALIZE ladder landed, quantifies the known stale-block bug, and catalogues every residual discrepancy.
**Probes:** live `GET /api/bolt/health` · 9 read-only SQL `SELECT`s on the live Supabase (`fleet_data`, `fleet_data_backup`, `sheet_ambassador_sync`, `ambassadors`, `sheet_stage_snapshot`) · full code-trace of `api/bolt/*` + the merge/roster/block/tier/incentive engines in `index.html` (worktree pinned at `origin/main` = b825baa).
**One denied probe, disclosed:** a `POST /api/bolt/sync` (code-verified to write nothing — it only fetches from Bolt and returns JSON) was blocked by the session's read-only permission gate. Everything below is proven without it; where it would have added per-driver certainty, the one-click alternative for Muhammad is noted.

> 🔴 = real bug, action needed · 🟡 = watch / decide · 🟢 = verified clean

---

## 1 · VERDICT

**The dashboard is trustworthy for handoff EXCEPT for 2 real bugs, both in the same subsystem: the Blocks queue is wrong in BOTH directions (R1), and every CSV upload silently wipes the live Bolt/vehicle states off the newest day (R2 — the root cause that feeds R1).** The roster spine (F1/F2/F3) genuinely held: 101 reconciles with the portal, the partial-overwrite data-loss class is dead, LEFT-FLEET and phantom-identity classes have collapsed to zero. Tier math and Incentives↔P&L parity are structurally sound.

| # | Finding | Verdict | Severity | Fix size |
|---|---|---|---|---|
| R1 | **Blocks queue wrong both ways: 28 shown vs 32 real — 5 stale + 9 invisible** | 🔴 | HIGH — his daily unblock worklist | Opus (fix session in flight covers half) |
| R2 | **CSV-over-cron merge wipes `bs`/`vs`/reason/categories per driver** | 🔴 | MED-HIGH — blinds R1's detector + vehicle blocks daily | tiny→Opus |
| R3 | Block log carries 29 duplicate open rows (57 rows / 28 drivers) + cleaned rows can resurrect cross-device | 🟡 | LOW-MED | 1 click + tiny |
| R4 | 02–04 Jul days permanently activity-only (pre-F1 damage); only partial backup recovery exists | 🟡 | LOW | decision + Sonnet |
| R5 | Trips semantics: cron counted 382 orders for 06 Jul, dashboard displays 368 — S2 QA still needs one portal eyeball | 🟡 | LOW | Muhammad, 5 min |
| R6 | Star Map/Today tier ladder is a hand-copied REPLICA of `tierStatusFor` (no parity test); Captains deck ladder is a third, different-by-design math | 🟡 | LOW | Sonnet |
| R7 | **Roster truth: 101 = 100 portal + 1 deact — reconciles; F1 merge held under live fire** | 🟢 | — | — |
| R8 | **LEFT FLEET / phantom identities: exactly 2 departed keys, both plausible; 103 all-time vs 101 roster** | 🟢 | — | — |
| R9 | **Tier engine: Today == Finance == Star Map holds; no double-count; July numbers reconcile exactly** | 🟢 | — | — |
| R10 | **Incentives ↔ P&L: one shared engine, three call sites — parity is structural, holds when nationality fills** | 🟢 | — | — |
| R11 | Infra: health green, 17/17 nightly backups, all 3 sheet crons ran last night; F4 (concurrency guard), m2 (hoursOnline), legacy `h`/`fmt` blob keys remain open as known/accepted | 🟢 | — | — |

---

## 2 · R1 🔴 — THE BLOCKS QUEUE, QUANTIFIED (the confirmed finding + its full scale)

**Displayed:** the Blocked chip (Today, Captains, Star Map, Blocks tab) = **28** = unique drivers with an open block-log row (`getBlockLog().filter(e => !e.dateUnblocked)` — `index.html:11015`, `5363`).
**Reality (last night's cron pull, 06 Jul 21:03 UTC, the freshest full-state snapshot):** **31 suspended + 1 deactivated = 32 non-active** drivers on the roster.
**Overlap: only 23.** So the queue has **5 false positives** (18% of what's shown) and misses **8 suspended + 1 deactivated** (28% of the truth).

### 2a · The 5 STALE open blocks (live-verified non-suspended, still shown BLOCKED)

| Driver | Shown blocked since | Wrongly in queue for |
|---|---|---|
| ABDULRAHMAN ALSHAHRANI | 12 Jun 2026 | ~25 days |
| Mashal Al Habah | 19 Jun 2026 | ~18 days |
| ALI ALSHAHRANI (the originally proven case) | 29 Jun 2026 | ~8 days |
| Raed Alharbi | 01 Jul 2026 | ~6 days |
| Ali Ahmed | 06 Jul 2026 | ~1 day |

**Proof method (set-consistency, no write needed):** on the merged 06 Jul entry, drivers absent from the newest CSV kept the cron's state — and that surviving suspended-set (31) contains none of these 5. All 5 are present in the newest Bolt earnings export (which listed exactly the 69 non-suspended captains — zero overlap with the 31 suspended, P(coincidence) ≈ 0). Therefore all 5 were non-suspended as of the last cron pull. Definitive per-driver confirmation for Muhammad: press **⚡ Sync from Bolt** in the dashboard once — it repopulates every `bs` live (and its `updateBlockLog` pass will auto-close any it can see transition).

### 2b · The 9 INVISIBLE blocked drivers (genuinely suspended, NOT in the queue)

Bandar Alruwaili · Dhafer Alyami · Hadi Alrashdi · MESFER MOHAMMED ALQAHTANI · Meshari Azmi · Munahi Al Dawsari · Nayef Al-Balawi · Sahal Alotaibi (all `bs='suspended'`) + ARIF ALMANHALI (`deactivated`). None has an open block-log row, so they appear in NO worklist, and their **"bonus at stake" is not counted** — while the 5 stale drivers' stake IS counted (`index.html:5452`). The at-stake total is simultaneously over- and under-stated.

### 2c · Root cause (code) — bigger than the day-window

`updateBlockLog` (`index.html:5070`) is the ONLY writer of automatic block events, and it is called from exactly ONE place: the browser's manual "Sync from Bolt" path (`index.html:2116`). Consequences:

1. **The nightly cron never updates the block log.** `cron-sync.js` writes the day straight to Supabase; when the browser later merges that day in via `fetchFromCloud → mergeHistories`, no block detection runs. The primary data feed is invisible to the queue.
2. **A close requires WITNESSING the transition**: previous synced day `bs≠active` AND new day `bs=active`, compared over exactly one day-pair. Any unblock that happens between manual syncs is never seen → the open row is stranded forever (the confirmed bug; all 5 stale rows above are this class).
3. **Opens have the same blindness** — the 9 invisible drivers were suspended on days only the cron saw, so no row was ever created.
4. R2 (below) blinds the detector further: after a CSV upload the previous day's `bs` is `''` for every non-suspended captain, so `wasBlocked` is false even when it shouldn't be.

**Fix shape (for the in-flight fix session / next session):** the "blocked now" SET should be derived from the latest roster-bearing entry's live `bs` (the same one-truth pattern F2 used for the roster), with the block LOG kept for history/duration only — plus a reconcile pass that opens/closes log rows against that set on every data arrival (cron merge included, not just manual sync). Half of this (stale-close) is what the parallel fix session is writing; the seed-opens-from-roster half must not be forgotten.

---

## 3 · R2 🔴 — CSV UPLOADS WIPE LIVE STATES (new sibling class, found by this audit)

**Live evidence (06 Jul entry, after this morning's 09:25 UTC CSV upload):** 69 drivers `bs=''` / `vs=''` · 31 `suspended` · 1 `deactivated` · **zero `active`**. Same pattern on 05 Jul (68 empty) and 01 Jul (68 empty + 22 kept). Last night the cron stored full states for all 101; this morning's upload erased them for every captain present in the CSV.

**Root cause:** F1's `mergeDayEntries` (`index.html:4638`) is a per-driver **replace**, not a per-field merge — `newer wins` takes the CSV's driver object wholesale, and a CSV row carries no `boltState`/`vehicleState`/`rating`/`categories`. Bolt's earnings export lists every **non-suspended** captain (incl. idle, as zero rows), so exactly the suspended/deactivated survive with states — which is the only reason `getRosterReconciliation` still reads "101 = 100 portal + 1 deact" correctly today. That's luck of the export format, not design.

**Blast radius:**
- **Vehicle-blocked panel shows 0 right now** — genuinely unknowable, because any vehicle-suspension among the 69 was wiped this morning. A car-blocked driver who drove yesterday is invisible until the next midnight cron.
- Blocks-tab state chips, driver-panel "CURRENTLY BLOCKED" strips, suspension categories/reasons — blank for CSV-covered drivers until the next cron.
- `updateBlockLog`'s transition detector reads `''` as "not blocked" (see R1.4).
- Historical state data on every CSV-merged day is permanently gone (the wipe self-heals for *current* state each midnight because the cron writes a fresh day, but merged days stay stripped).

**Fix size: tiny→Opus.** In `mergeDayEntries`, on a per-driver clash, take activity fields from the newer side but retain state/profile fields (`bs, bsr, bsc, bss, vs, vsr, vp, cat, ic, hcp, ra, sc`) from whichever side has them non-empty (in practice: the roster-bearing side). One function, fixture-testable offline against the real 06 Jul blob shape.

---

## 4 · R3 🟡 — BLOCK-LOG HYGIENE: 29 duplicate open rows + resurrection path

Live: **84 total rows, 57 open, 28 unique open drivers** → 29 duplicate open rows. The dedupe machinery already exists (`dedupeBlockLog`, the "Clean N duplicate rows" button) — it just hasn't been pressed. The dups inflate TOTAL EVENTS and per-driver history counts (the "49 rows for 20 people" class, still alive).

**Watch:** cleanup can be undone by the sync topology. `fetchFromCloud` merges block logs by **id-union with local-wins** (`index.html:5883`) and there are no tombstones — any second device/browser still holding the old 84-row log will re-push deleted rows to the cloud, and they'll flow back. Same-id closures survive (local wins), but *deletions* don't. Fine for a single-device workflow; becomes real if the share-link is used on a second machine. Fix: clean on the main device, immediately sync, and avoid old sessions pushing — or add a tombstone list (tiny).

---

## 5 · R4 🟡 — THE PRE-F1 SCAR: 02–04 Jul are permanently activity-only

The 05-Jul-14:57 partial-upload clobber (original audit §2) was never healed: 02/03/04 Jul still hold **67 drivers each**. F1 prevents new occurrences (proof in R7) but does not repair old ones. Backup recovery map (live `fleet_data_backup` reads):

| Day | Live now | Best available in backups | Recoverable? |
|---|---|---|---|
| 01 Jul | 90 | 90 (backup 2026-07-06) | already at best |
| 02 Jul | 67 | **75** (backup 2026-07-04) | partial (+8 drivers) |
| 03 Jul | 67 | **80** (backup 2026-07-04) | partial (+13) |
| 04 Jul | 67 | 67 (all backups post-clobber) | ❌ gone |
| 05 Jul | 98 | 98 | intact |

**Impact today is cosmetic:** the July union (101) already equals the roster because 06 Jul covers everyone, so no count on any surface is currently wrong because of this. It only degrades those three days' per-day idle/roster detail. Decision for Muhammad: restore 02–03 Jul from the 2026-07-04 backup (Sonnet session, one-off merge script through the same `mergeDayEntries` path) or accept and move on. Recommendation: **accept** — the value is marginal and the restore touches the live blob.

---

## 6 · R5 🟡 — TRIPS vs BOLT (S2 QA, still needs one human eyeball)

Two "orders" numbers exist for the same day and they are NOT the same thing:
- `last_cron` for 06 Jul says **382 orders** = raw order rows from `getFleetOrders` (includes rows without `net_earnings` — typically cancelled/unpriced; `lib.js:141-167` only increments a driver's `orders` when `net_earnings != null`).
- Every displayed "Trips" figure (Today strip `index.html:11764`, Captains table, driver panel) sums **per-driver `orders`** = **368** for 06 Jul. The stored `to` field was also recomputed to 368 when the day was re-merged (`buildDayEntry:4621`).

So the dashboard consistently shows **finished/priced trips**, and the 14-trip gap to the raw pull is expected, not a bug — but whether 368 or 382 matches what Bolt's PORTAL calls "trips" for 06 Jul is the one check no probe here can do. **Method for Muhammad (5 min):** portal → Reports → 06 Jul → compare the trips total against the dashboard's 368 for the same day. If the portal shows ~382, the label should say "completed trips" (or count all rows); if ~368, S2 closes 🟢. Note CSV-sourced days take their per-driver order counts from Bolt's own CSV columns, so provenance differs per day-source — same eyeball verdict covers both.

---

## 7 · R6 🟡 — TIER-LADDER ENGINES: one truth, one replica, one deliberate variant

- **Finance** reads `tierStatusFor` (`index.html:8511`) — the S4 one-truth engine. ✓
- **Today + Star Map** read `smTierDetail` (`12136`, `12758`, `12804`) — which **replicates** `tierStatusFor` line-for-line instead of calling it, adding a `below` bucket and an `income <= 0` skip. Behaviorally identical today (a zero-income driver can't get a `tierFloor` — `bonusForDriver:4170` derives pace from income). But this is exactly the hand-copy pattern that silently drifted in the codec (Build-167) until a parity test pinned it. **Fix: Sonnet — either have `smTierDetail` call `tierStatusFor` for the tier buckets, or add a parity assertion to the test suite.**
- **Captains deck** ladder (`3633-3644`) is a third math — projection bands `bandOf(proj)` over `R.current`, excluding blocked+idle, labeled "(proj.)". Different by design (it answers "where will people land", not "tier status"), but it CAN show different counts than Finance for the same month, which invites "which is right?" questions during handoff. Cosmetic decision: keep + tooltip, or repoint.

**Live tier numbers reconcile exactly (R9 🟢):** July union-of-drivers = 101 = roster (zero off-roster earners, zero double-count), 51 earners so far, 0 banked ≥ 4k yet (day 7). June: 66 in-month drivers, 51 earners, 15 banked ≥ 4k. The prompt's "106 vs 101" figure is not reproducible in today's data — with the earners-vs-roster labeling landed, nothing currently on screen contradicts the roster.

---

## 8 · R7/R8 🟢 — THE ROSTER SPINE HELD (the old F1/F2/F3 classes are closed)

- **F1 per-driver merge survived live fire twice this week:** 05 Jul kept **98** drivers through a later CSV re-upload (pre-F1 this exact sequence destroyed 02–04 Jul), and 06 Jul kept **101** through this morning's upload; 01 Jul was *enriched* 74→90 by union. The merged days correctly retain `s:'cron'` (`mergeDayEntries` rosterSrc), so `getRosterEntry` still picks them. The 87-vs-97 class is dead. (Caveat: the merge preserves the *set*, not the *state fields* — that's R2.)
- **Roster reconciliation displays truth:** 101 total = 69 active + 31 suspended + 1 deactivated; portal = 101 − 1 = 100. The Data-Health line "101 = 100 portal + 1 deact" matches the live blob and `health` (`lastCron: drivers 101, ok:true`).
- **LEFT FLEET (F3 class): clean.** All-time union = **103** keys vs 101 on roster → exactly 2 departed: JAMAL ALSHAMMARI (last seen 23 Jun, 2,573 SAR lifetime) and Mohammad Alnajashi (last seen 09 Jun, 155 SAR). Both look like genuine departures, not artifacts. The phantom-identity class (was 100 keys vs 98 real) has collapsed — zero CSV↔API name splits detectable. F6 (ID-first keying) can stay unbuilt for handoff.

---

## 9 · R10 🟢 — INCENTIVES ↔ P&L: parity is structural

One engine, `incentiveTotalsFor` (`index.html:9305`), three readers: the Incentives tab (`9383`), the Finance P&L line (`7497` reads `.totals.grandSar`), and Star Map I5 (`12539`, sums to the same grandSar by construction). Both sides are 0 today and will MOVE TOGETHER when nationality data fills, because they render from the same call — parity cannot diverge without editing the engine itself. Residual watches, neither a parity risk: (a) incentive **overrides** merge local-wins per key across devices — a transient cross-device disagreement is possible until a sync completes; (b) the EGP→SAR conversion is a single shared rate fn. Data blocker status (live mirror): nationality **90/163** filled (was 68/153), ambassador 115/163, Team 17/17 ✓.

---

## 10 · R11 🟢 — INFRA + KNOWN-OPEN ITEMS (verified, unchanged posture)

- `GET /health`: all green — `bolt.ok`, `supabase.ok`, `lastCron ok` (06 Jul, 101 drivers, 382 orders), **backups 17/17 nightly, latest 2026-07-06** (F8 shipped: health now exposes backups). Sheet crons all ran last night: DRIVERS mirror 22:07, stage snapshot 21:58, ambassadors 17 rows.
- **F4 (dual-writer concurrency guard) remains open by plan** — the cron still does two whole-blob writes per night (`cron-sync.js:98-103` `writeCronLog` re-read/re-write) and the browser still pushes the whole blob including history from ~20 call sites. This morning's 09:25 browser write over last night's cron day is a live demonstration that the window is real (no data was lost — merge semantics handled it — but R2's state-wipe rode in on it). Ship F4 as planned, on a watched night.
- m2 (hoursOnline pre-window credit) still open — minor undercount for overnight drivers. m3: legacy `h`/`fmt` keys still sit in the blob (dead weight only; both still present in live `jsonb_object_keys`). m1 is FIXED (`paginateAll` now loops on `all.length < total` — `lib.js:39-58`). RLS posture unchanged and intentional.

---

## 11 · RECOMMENDED FIX ORDER

| # | Action | Who / size | Touches live? |
|---|---|---|---|
| 1 | **Land the in-flight stale-block fix**, extended to BOTH directions: derive "blocked now" from the latest roster-bearing entry's `bs` (F2 pattern), reconcile the log (open + close) on every data arrival incl. cron-merged days — not only manual sync | Opus (fix session running) | index.html only |
| 2 | **R2 state-preserving merge**: per-field retention of `bs/vs/…` in `mergeDayEntries` when the newer side is state-less | tiny→Opus (can fold into #1 — same file, same subsystem) | index.html only |
| 3 | **Muhammad, 2 clicks:** press "Clean 29 duplicate rows" on the Blocks tab, then "⚡ Sync from Bolt" once (confirms the 5 stale drivers live + auto-closes what it can) | Muhammad | no |
| 4 | **S2 trips eyeball**: portal 06 Jul trips vs dashboard 368 (method in §6) | Muhammad, 5 min | no |
| 5 | smTierDetail parity test (or make it call `tierStatusFor`) | Sonnet | no |
| 6 | F4 concurrency guard — as originally planned, explicit deploy-OK, watched night | Opus · high 🔴 | YES |
| 7 | Optional: restore 02–03 Jul from the 2026-07-04 backup (75/80 drivers) — recommend SKIP | Sonnet | YES (blob) |

**Handoff line for the tool:** after #1–#3 land, every number on the dashboard traces to a verifiable source: roster → last cron pull (reconciled to portal), blocked → live Bolt states, tiers → one shared engine, incentives → one shared engine, money → invoice-or-pace with the invoice affordance. #4 is the last unverified label.

---

## 12 · WHAT THIS SESSION TOUCHED

**Live system: nothing.** All probes were `GET /api/bolt/health` + read-only SQL `SELECT`s (9 queries, listed in the header). No table written, no cron invoked, no deploy, no code file modified. One intended read-only probe (`POST /api/bolt/sync` — verified in code to perform no writes) was blocked by the session's permission gate and is disclosed in the header; its evidence was replaced by the set-consistency proof in §2a. This report is the session's only artifact, committed on branch `audit/data-integrity-reaudit` in its own worktree (`Bolt-wt-reaudit/`), never touching the working tree the parallel fix session uses.
