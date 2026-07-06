# Bolt Dashboard FINALIZE — S2 REMAINDER (core components + heavy tabs)

**Date:** 2026-07-06 · **Session:** Opus · high · **Branch:** `bolt-finalize-s2` (off `main` @ da195ec — S0 + S1 + S2-part-1 live)
**Status:** ✅ built + verified on the :3017 preview against **real prod data** (reads-only). **NOT merged — awaiting deploy-OK.**
Frontend only — the live core (3 crons + Bolt sync) was **not touched**. `index.html` only (+594/−196).

Builds on S2-part-1 (the A1 driver panel DECK header + WhatsApp/Call/Copy row). Implements Part A (A1/A2/A3)
+ the three heavy tabs (#9 Captains, #5 Blocks, #4 Analytics) from `BOLT_FINALIZE_TAB_SPECS.md`, honouring the
brief's DECISION OVERRIDES (kept light theme + Star Map untouched; Arabic quality-gated → S7).

---

## What shipped

### A2 · `dkFilter(host, config)` — one config-driven filter/sort/date system
- Per-tab in-memory state (`dkFilterState`), months **DERIVED** from `computeRosterForMonth().months` (year-proof —
  no hardcoded `2026` chips), multi-select, status/tier/nationality/ambassador chips, `<details>` multi-select
  dropdowns, and column-sort (`dkFilterSort` / `dkSortArrow` / `dkApplySort`).
- **A1 propagation:** `dkOpenDriver(name, monthKey)` → `openModal(id, null, { monthFilter })` (new 3rd arg,
  backward-compatible) so a tab's selected month reaches the driver panel — the #9 "pick a month → the driver
  window shows THAT period" fix. Consumed by Analytics (month chips) + Blocks; Captains propagates via its own
  richer period chrome through the same `sumMonthFilter` path.

### A3 · `dkAlertRail(alerts)` + `dkAlertRegistry(only)` — one rail, one source registry
- `dkAlertRail` is now the **single** rail renderer — **Today's inline rail was refactored to call it** (one
  implementation, no bespoke alert boxes). Registry sources: blocked-on-Bolt (danger), data-stale (warn),
  reconcile-due (warn), slipping (warn). Each tab shows a subset via `only`.

### A1 · driver panel body → DECK bulkheads + the tier lens (no math rewritten)
- **Tier-lens pill** in the header, read from `computeRosterForMonth` (the SAME engine as every tab) so the
  panel's tier **matches Captains/Analytics/Blocks exactly** — filled if banked, hollow if projected, absent for
  blocked/idle. (Verified: Fahad proj 12,081 → **6K**; a below-4k earner → **<4K**.)
- Section dividers restyled to DECK bulkheads (scoped CSS: the simple labels get the `LABEL ──────` hairline
  rule; Day-by-Day / Block-History keep their inline right-side controls untouched). **Zero computed values changed.**
- Shared helpers added: `dkDeckHeader`, `dkStatusChip`, `dkBulk`, `dkTierPill`, `dkAmbTag`.

### #9 · Captains (polish, not rebuild)
- **Retag:** MODEL `S/F/R` + REF `N/M/Y/H` letters → **ambassador-name tags** (`dkAmbTag`, dim `—` when unset).
  Legacy model/ref filter chips + sort options removed.
- **Orders → Trips** (column, sort label, Compare-KPI option, and the shared A1 panel).
- **Tier-pill column** added (banked filled / projected hollow).
- **DECK deck** prepended: header + shared rail + stat strip that reads **`getFleetRoster()` (98 — the S1 roster
  truth)** with a reconciliation sub-line (`= 97 portal + 1 deact.`) and a "with activity in ⟨period⟩" count.
- Period → panel propagation **verified**: month=June → the panel opens scoped to **Jun 2026**.
- `By Captain` / `By Day` / `Compare Days` all kept; RADAR was already gone (S0).

### #5 · Blocks → an unblock WORKLIST
- **Stat strip:** `BLOCKED NOW (25) · VEHICLE-BLOCKED · UNBLOCKED 7D · BONUS AT STAKE (4,000 SAR)`. The vanity
  "516 days suspended" total is **gone**.
- **Worklist** sorted by **bonus-at-stake desc** (`blockAtStake` = larger of projected-if-active company bonus
  and last-month's actual). Each row: driver → A1 panel · tier pill (pre-block pace) · category chip · vehicle
  chip · **full reason, never truncated** · since/days · expandable per-driver history (with the category re-tag).
- **Actions:** Open panel · **Copy unblock msg** (WhatsApp-ready template) · **Mark unblocked**
  (`markDriverUnblocked` — mirrors the existing block-form write path: `saveBlockLog` → `syncToCloud`).
- Category / reason / month / search filters kept.

### #4 · Analytics → four bulkhead sections, every card drills to A1
- **DECK deck** + clickable stat strip (In-view / Active / Idle / Slow / New / Left / Blocked).
- Four bulkheads: **Tier movement** (distribution funnel + ▲/▼ vs last month) · **Pushable** (the money list,
  sorted by company bonus unlocked) · **Cohort ramp** (Build-152, DECK-skinned, rows now clickable) · **Idle &
  recovery** (idle-with-recent-earnings recoverable SAR + acceptance-drop list). Every driver row → A1, scoped to
  the selected analytics month. Month chips reuse the A2 filter-bar styling.

---

## Verification (:3017, real prod data — reads only, zero console errors throughout)
- **Components live:** all 11 A2/A3 helpers defined; `dkAlertRegistry` returns real alerts (25 blocked, 4 slipping).
- **Today** still renders its rail via the shared `dkAlertRail` (2 alerts) — the refactor held.
- **Captains:** headers `CAPTAIN · DAYS · NET SAR · TIER · EARN/HR · HOURS · ACCEPT · UTIL · TRIPS · DISTANCE ·
  MONTHLY TARGET`; ambassador tag "Abo Yakoub" replacing the letters; 100 rows; deck stat = roster **98**;
  month→panel scoping verified (Jun 2026).
- **Blocks:** strip `25 / 0 / 0 / 4,000 SAR`; 25 rows, top = `ALI ALSHAHRANI · BLOCKED · Compliance · 6K ·
  −1,250 SAR`, full 276-char reason; row→panel (status leads) + history-expand + category re-tag all work.
- **Analytics:** four bulkheads present; pushable table 10 rows; pushable + mini rows drill to A1 scoped to Jul 2026.
- **A1 panel:** tier lens engine-consistent; bulkhead hairline rule renders; opens clean from Today/Captains/Blocks/Analytics.
- **Light theme (D-2, kept):** toggles without error; Captains renders in light mode. *(Note: DECK tab CONTENT uses
  the dark DECK palette in both themes — identical to the live Today exemplar; a proper light DECK variant is S7's scope.)*

### Acceptance checks (findings §6 / tab specs)
- ✅ Counting surfaces read `getFleetRoster()` (S1) — Captains header = 98, reconciliation line shown.
- ⚠️ **Orders = Trips portal check (findings §6.5):** the label is renamed and the number is the finished-orders
  field (sum of `d.orders`); **a one-day count against the Bolt portal is a manual QA step for you to confirm.**
- ⏭ Incentives ↔ P&L parity, tier-status single source → **S4**. Concurrency guard → **S6**. Arabic rollout → **S7**.

---

## Guardrails held
- Own worktree (`bolt-finalize-s2`) off `main`; **only `index.html`** touched (+ this report). No cron/sync/deploy.
- The nested M8 repo untouched. `openModal`'s new 3rd arg is additive (old call-sites unchanged).
- **STOPPED before merge — deploy-OK needed** (main auto-deploys prod). Vault + BUILD_LOG update deferred to post-merge (session-close rule).

## Next rungs
**S3** — Onboarding #3 · Ambassadors #7 · Incentives #6 (overrides + shared `incentiveTotalsFor`).
**S4** — Finance #8 (needs D-1) · `tierStatusFor` · interactive Data-Health #12.  ·  **S7** — Arabic across the converted tabs.
