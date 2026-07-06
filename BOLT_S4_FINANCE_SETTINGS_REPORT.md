# S4 — Finance + Settings (FINALIZE rung S4) — build report

**Model:** Opus · med-high · **Branch:** `bolt-finalize-s4` off origin/main `b20de78` (S5 already merged; disjoint — index.html only).
**Status:** built + self-verified on preview (`:3019`, real prod Supabase data). **NOT merged / NOT deployed** — awaiting money-check OK.

## ★ MONEY GUARDRAIL — before == after (verified live)
| Figure | Before | After | ✓ |
|---|---|---|---|
| May company profit | 2,992 | **2,992** | ✓ |
| June company profit | 18,317 | **18,317** | ✓ |
| June Bolt invoice gross | 36,633 | **36,633** | ✓ |
| July company profit (est) | 5,017 | **5,017** | ✓ |
| By-Captain June totals | 146,891 | **146,891** | ✓ |
| Roster (F2) | 98 = 97 + 1 | **98 = 97 + 1** | ✓ |
| Console errors | 0 | **0** | ✓ |

## ★ P&L PARITY (required wire) — no number moved
Executive "Money out" incentive line now reads the shared `incentiveTotalsFor(month).totals.grandSar`
(the exact SAR the Incentives tab shows). Verified **P&L line == Incentives total** for every month
(both = 0 today — nationality data incomplete, engine refuses to guess). `computeExecMonth` now
subtracts `incentivesOwed` instead of the per-driver `bonusPaid`; both are 0, so `companyNet` is byte-identical.

## ⚠️ ONE displayed number CHANGED — pre-existing bug, aligned TOWARD the protected value
The **Bolt Bonus → Fleet Bolt Tier Bonus** table showed **17,067 / 20 captains**; the Bolt invoice +
the Executive P&L show **18,317 / 21**. Root cause: one 6k driver (**Saed Fares**, net 7,289) was
dropped by a phone-match failure (his invoice row has a blank name). The table now renders **from the
invoice directly** (the same source `computeExecMonth` uses) → **18,316.66 / 21**, matching Exec + invoice
+ the shared tier strip. This moves the table TOWARD the protected 18,317 (fixes an under-count); the
protected Executive figure itself is unchanged. **Flagged for explicit sign-off.**

## What shipped (index.html only)
1. **Sub-tabs 5 → 4:** Executive · 🎯 Bolt Bonus · By Captain · 💸 Transfer Log. Removed **By Model** +
   **Cycle Reconciliation** (their render fns remain defined but unreachable — dead, harmless).
2. **`tierStatusFor(month)`** — ONE shared source, per tier `{achieved, projected}`, one copy pattern
   ("6,000 — 8 achieved" / "6,000 — 0 achieved · 17 on pace"). Read by Executive, Bolt Bonus + Fleet
   table. Totals match `computeExecMonth.tierCounts` exactly for all 3 months. Kills the
   "No drivers hit a tier / 6,000 tier" contradiction.
3. **Executive:** projection header (**PROJECTED COMPANY BONUS / BANKED / SPLIT %**), tier-status block,
   **month reconciliation checklist** (Cycle-Recon collapse), parity line. Company money first; driver
   net labelled as the driver's.
4. **Bolt Bonus sub-tab:** folds the two former always-on sections; loud closed-month **missing-invoice
   alert** (A3) on Finance + inline upload affordance (calm now — May+June uploaded).
5. **By Captain — D-1:** deleted Model + Acct Rent + Car Rent + Salary + Fleet Cut + Other columns
   (all own-car now). Kept Driver · Ambassador(+ambModel) · Bolt Net · Bonuses · Net P&L · Actions.
   `computeDriverPnL` untouched.
6. **Settings prune:** Perf-Flags + Diagnostics + legacy Fleet-Cut folded into one **Advanced** `<details>`
   (inputs stay in DOM → settings still save). Referrer card labelled "sheet = source of truth (Build-173)".
7. **Data Health → interactive:** every issue row expands to the affected drivers → click drills to the
   **A1 panel** (`dataHealthOpenDriver`; not-on-Bolt drivers get a sheet-row hint). F2 roster line kept.
   **F8 backups** line reads `/api/bolt/health` `{count,latest}` (renders "16 ✓" on prod, "—" defensively
   on local). F5 "Refresh mirror" stays a disabled placeholder (S5 owns the endpoint).

## Decisions honored
D-1 delete dead finance UI (Model incl., per your call) · D-2 light theme untouched · D-3 Star Map untouched ·
own worktree off origin/main · index.html only · STOP before merge for the money check.
