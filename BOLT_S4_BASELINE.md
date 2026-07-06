# S4 Finance — BEFORE numbers (money guardrail)

Captured live from prod Supabase data (`ltqpoupferwituusxwal`, 59 history days, May+June invoices imported, 64 profiles) on 2026-07-06, branch `bolt-finalize-s4` off origin/main `b20de78`.

## Executive P&L — company profit (MUST NOT MOVE)
| Month | Company profit | Tier gross (invoice) | Tier company (=50%) | Source | Reconciled |
|---|---|---|---|---|---|
| 2026-05 | **2,992** | 5,984 | 2,992 | actual (Bolt invoice) | ✓ |
| 2026-06 | **18,317** | **36,633** | 18,317 | actual (Bolt invoice) | ✓ |
| 2026-07 | 5,017 (est) | 10,033 | 5,017 | estimate (pace) | in progress |

Split 50/50 all months. dealIn=dealOut=0 (rental model dead → all deal fields 0 across roster).

## Tier counts [4k, 5k, 6k]
- May: [9, 0, 0]  ·  June: [11, 2, 8]  ·  July: [5, 3, 17]

## ★ P&L PARITY finding (the key one)
For **every** month: current Exec "Referrals + Saudi bonuses" P&L line (`S.bonusPaid`) = **0**, AND `incentiveTotalsFor(month).totals.grandSar` = **0**. They already agree (0 == 0) — incentives are 0 today because nationality data is incomplete, so the engine refuses to guess.
→ Wiring the Exec incentive line to read `incentiveTotalsFor(sel).totals.grandSar` (as required) moves **no number**; it just makes parity structural for when nationality fills in.

## By Captain — June totals (protect)
- rows 100 · income 146,891 · netPnL 146,891 (equal: deal fields + bonusCost all 0) · bonusCost 0

## Roster (F2)
- total **98 = 97 portal + 1 deactivated** · 68 active · 29 blocked (source csv, 05 Jul 2026). Already rendered in Data Health recLine.

## F8 backups (S5 health.js, LIVE on prod)
- `health.backups = { count: 16, latest: "2026-07-05" }` · lastCron.ok = true

## Console: zero errors on baseline load.
