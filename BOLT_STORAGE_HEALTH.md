# Bolt Storage Health — `khair_history` fragmentation audit

**Model:** Opus · high · **Date:** 2026-07-07 · **Risk:** MED-HIGH (data-integrity core) · **Status:** READ-ONLY findings — no code changed, awaiting deploy-OK

---

## ⚑ One-line verdict

**The history is HEALTHY — it is NOT fragmenting.** The full nightly-cron roster (101 drivers, all live states) is **present, fresh, and structurally protected** from partial-CSV clobber by the F1/R2 union-merge. The dashboard's roster (101) and blocked count (~32) both derive **cleanly from ONE fresh full-state cron day** — not a stitched patchwork. The coordinator's "recent entries are tiny / numbers match no single day" reading was reading the **dead `h` legacy key** and predates the 06 Jul cron landing; both are now disproven with live evidence.

There is **no active erosion**. There are three secondary, non-fragmentation findings (all LOW), the most useful being a cron-path hardening opportunity.

---

## Evidence base (all live, gathered 2026-07-07)

- Supabase project `ltqpoupferwituusxwal`, table `fleet_data`, id=`fleet` (SQL via MCP).
- Live prod `GET https://mhmbolt.vercel.app/api/bolt/health`.
- Code on `origin/main` @ `3c60d3a` (`index.html`, `api/bolt/*`).

---

## Q1 — Ordering + content: is the full cron roster present & fresh, or crowded out?

### Ordering = **newest-first** (idx 0 = most recent). CONFIRMED two ways:
- **Code:** every writer sorts descending — cron `history.sort((a,b)=>periodSortKey(b.p)-periodSortKey(a.p))` (`api/bolt/cron-sync.js:139`); browser `mergeHistories` (`index.html:6064`) and `getRosterEntry` (`index.html:2467`) sort the same way.
- **Data:** idx 0 = `06 Jul 2026` … descending … idx 58 = `9 May 2026`.

### The 59-entry `khair_history`, recent slice (live SQL):

| idx | period | source | drivers | active | uploaded_at (UTC) |
|----:|--------|--------|--------:|-------:|-------------------|
| 0 | 06 Jul 2026 | **cron** | **101** | 40 | 2026-07-07 09:25 |
| 1 | 05 Jul 2026 | csv | 98 | 38 | 2026-07-06 11:56 |
| 2 | 04 Jul 2026 | csv | 67 | 32 | 2026-07-06 09:41 |
| 3 | 03 Jul 2026 | csv | 67 | 32 | 2026-07-06 09:41 |
| 4 | 02 Jul 2026 | csv | 67 | 35 | 2026-07-06 09:41 |
| 5 | 01 Jul 2026 | csv | 90 | 32 | 2026-07-06 11:56 |
| 6–50 | 30 Jun … 17 May | *(untagged)* | 50→21 | — | morning uploads |
| 51–58 | 16 May … 9 May | *(untagged)* | **3** | — | (oldest) |

**Findings:**
1. ✅ **The full cron roster is present and fresh.** idx 0 = `06 Jul`, `source=cron`, **101 drivers** with a real 101-element driver array, re-written this morning (09:25 UTC).
2. ❌ **The coordinator's "recent = tiny (~3 drivers)" is wrong.** The 3-driver entries are the **oldest** (idx 51–58, early May, back when the fleet had ~3 reporting drivers). They are not recent and are not crowding anything out — they sit at the bottom of a newest-first array.
3. ⚠️ **Only 1 of 59 days is cron-tagged** (`cron_days=1, csv_days=5, untagged_days=53`). The pre-06-Jul days are **manual/partial uploads**, not full cron rosters — their driver counts track *upload size over time* (21 in May → 40s in June → 67–98 in early July as the fleet grew), never the ~101 API roster. This is a **historical backfill gap, not clobber** (see Q3 for why clobber is impossible, and Finding A for why the gap exists).

---

## Q2 — Derivation: where do 101 roster and ~32 blocked actually come from?

### Roster = **101**, from a SINGLE day (not a union)
`getFleetRoster()` → `getRosterEntry()` (`index.html:2464`):
- Sorts newest-first, returns the **first entry that is `source==='cron'|'api'`** (or, for untagged history, dc ≥ 80% of the recent-14 max).
- idx 0 (`06 Jul`, cron) matches immediately → **roster = its 101 drivers.**
- **Reconciles exactly:** 101 stored = 101 shown. The coordinator's "matches no single day" was pre-cron-landing; it now matches idx 0 precisely.

### Blocked = **32**, from the same single fresh day + the block log
- `liveBlockedSet()` → `latestStateBearingEntry()` (`index.html:5153`) = latest day with `source cron/api` **or** any driver carrying a `boltState`. That is idx 0 (the cron day).
- Live SQL over idx 0's 101 drivers: **32 carry a non-active state → 31 `suspended` + 1 `deactivated`.** (Active drivers omit the field under the c1 codec, so `have_boltstate_field = 32 = the blocked set`.)
- Block **log** (`khair_block_log`, separate key): 84 rows → **57 open / 27 closed**, open across **28 unique drivers**. `reconcileBlockLog()` (R1, `index.html:5189`) opens/closes rows against the live set on every data arrival.
- **Reconciles the ~28–32 the dashboard shows:** live-blocked set = **32**, open-log unique drivers = **28** — the displayed number sits in that band, sourced from ONE fresh full-state cron day, **not stitched across partial days.**

---

## Q3 — Fragmentation verdict: did F1 stop partial uploads eroding full days?

### ✅ YES — clobber is structurally impossible on the browser path. Code-verified:
`saveToHistory` (`:4686`) → `mergeDayEntries` (`:4672`) → `mergeDriverEntry` (`:4651`), and cloud `mergeHistories` (`:6044`):
- **Per-driver UNION** keyed by `driverKey(name) || driverId`. Drivers present in the older entry but **absent from a newer partial upload are RETAINED** — a partial CSV can only *add/update* drivers, never *remove* roster members from a day that already holds them.
- **Per-field state retention (R2):** an activity-only CSV (no `boltState` on any row) does **not** blank the cron's live states/categories/rating — those are kept from the state-bearing side.
- **Roster-source preservation:** the merged day keeps `source='cron'|'api'` if *either* side had it (`rosterSrc`, `:4678`), so a merged day still reads as roster-bearing.
- **Guards against a partial "today" hijack:** `getRosterEntry` (F2) and `latestStateBearingEntry` (R2) skip pure-activity CSVs — a partial upload for today can neither become "the roster" nor drive the block set.

**Proof in the data:** if the cron had ever written 01–05 Jul, the union would have kept those days at ~101/`cron`. They are 67–98/`csv` → **no cron entry ever existed for them** (the cron wasn't wired yet), i.e. the small counts are *original*, not eroded remnants.

### Is the day the block fix relies on recent + complete? ✅ Yes.
`latestStateBearingEntry` resolves to idx 0 = **today-minus-one, cron, 101 drivers, 32 live states** — fresh and complete, not stale.

---

## Q4 — Cross-check vs live prod: does the cron's full roster reach & survive?

✅ **YES.** `GET /api/bolt/health` (live):
```
lastCron: { ok:true, ts:"2026-07-06T21:03:07.824Z", period:"06 Jul 2026", drivers:101, orders:382 }
backups:  { count:17, latest:"2026-07-06" }
```
- The scheduled 21:03 UTC cron ran, pulled the **full 101-driver roster**, and stored it — and it is intact in `khair_history` idx 0 (re-confirmed by a second cron write at 09:25 UTC 07 Jul; both 101 drivers).
- 17 daily pre-overwrite backups exist (`fleet_data_backup`, `writeBackup` at `cron-sync.js:135`) — a real safety net.

---

## Secondary findings (all LOW — none is fragmentation)

### A. Historical backfill gap *(informational)*
Only 06 Jul carries a full cron roster because the enabling fixes are **recent**: cron→`khair_history` (Build-110, `b71cc41`, 25 Jun), full-roster seed (Build-109, `d29684b`, 25 Jun), and `source` tagging (later). Days before that were manual partial uploads and **won't backfill** — the cron only ever syncs *yesterday*. Effect: per-day "fleet size" for historical days is understated (they show who uploaded, not the ~101 roster). **Self-heals forward** one full day per night. Not erosion; nothing to fix unless you want to backfill history manually.

### B. Cron write is wholesale replace, not union — the one real hardening opportunity
`cron-sync.js:138` does `if (idx>=0) history[idx] = entry` — a **wholesale replace-by-period**, unlike the browser's defensive union-merge. Normally safe (cron writes fresh-yesterday and full → an upgrade over any partial CSV). **Edge risk:** a *partially-failed* cron — one company's `getDrivers` throws and is caught non-fatally (`lib.js:120`) — would pull a smaller roster and **replace a previously-complete day** for that period. Mitigated by per-day backup + fresh-yesterday timing, so severity is LOW. **Hardening:** have the cron reuse the union-merge (or refuse to write a materially smaller roster than the existing entry for that period).

### C. Block-log duplicate open rows *(adjacent subsystem, not storage)*
57 open rows across only 28 unique drivers, and `open_auto=0` despite 32 live-blocked — duplicate/orphaned open rows in `khair_block_log`. This belongs to the just-shipped BLOCKS subsystem (`3c60d3a`) and already has a UI cleanup (`countBlockLogOpenDupes()` / "Clean N duplicate rows"). Noted for completeness; out of scope for storage fragmentation.

### D. Dead `h` / `fmt` top-level keys *(cleanup)*
`h` (6 ISO-date-keyed entries, frozen 20–25 Jun at the Build-110 switch) and `fmt` are **never read** by the dashboard — but they actively **mislead audits** (they cost the coordinator real queries). Trivially prunable.

---

## Recommendation

- **No emergency.** The storage core is healthy; roster + blocked derive from a fresh, complete, protected cron day.
- If you want a fix, the **only substantive one is Finding B** (make the cron write defensive like the browser). It touches the live cron path → **needs your explicit deploy-OK first**, and I'd keep it to a minimal guard, not a redesign.
- Findings A/C/D are optional cleanups.
- **No storage-model redesign is warranted** — so no Fable escalation needed.

*Prepared read-only. No code changed. Worktree: `bolt-storage-health` off `origin/main@3c60d3a`.*
