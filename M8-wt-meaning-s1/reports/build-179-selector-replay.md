# B-179 Probe C — selector replay on REAL prod recall data (C2 drop list)

**Date:** 2026-07-03 · **Executor:** Opus · **Source:** BOLT `m8_conversations` (read-only via MCP) — the exact Tier-1 (15 profile + newest-18 operational) + a recent Tier-2 sample that recall assembles. Content shown as 48-char previews (privacy); sizes are the **real rendered chars** (provenance-tag + label + content + newline).

> **This is the C2 checkpoint artifact.** It shows exactly which memory rows B-179 drops on your live data before anything ships. Nothing was deployed to produce it.

## Honesty caveats (read first)
1. **No live embedding offline** → Tier-2 rows carry the 0.35 neutral-sim prior. Live, semantic recall would *promote* query-relevant rows, so real turns drop **fewer** good rows than shown here (conservative view).
2. **The sample over-includes Tier-2.** Today, recall injects **all** Tier-1 (15 profile + 18 operational) every turn, plus only **~6 query-matched** Tier-2 rows. My sample stuffs in 12 assorted Tier-2/untyped rows that would not all co-occur in one real turn — so the headline "50% smaller" is inflated. The **honest** per-turn win is: identity pinned, the honest rendered budget (fixes the 5,155-vs-4,500 lie), stale operational logs shed beyond budget, and Tier-2 capped+deduped.

## What's actually in your memory every turn
- **profile ×15** (pinned, never dropped): "Muhammad's wife is Sara" (×2), "office in Riyadh", "Khaled Otaibi warehouse manager", "operations manager at Bolt", "aims to build his own business", + a few knowledge facts (Turing, Terras, cosmology).
- **operational ×18** — **all 18 are near-identical Collatz / conjecture research-run logs** (seed-11 & seed-7 runs, GATE v2 verdicts, "120 candidates mined…"), every one importance-5, one timestamp cluster ~2 days old. On a **fleet or wallet** turn these are pure drift surface — the FLEET/WALLET packet is ground truth and the system rule already says *memory always loses to the data block*.

## Per-lane selection (rendered chars, ranked, profile pinned)

| lane | budget | rows kept | rendered chars (was 6,789 in-sample) | profile pinned | "Sara is your wife" |
|---|---|---|---|---|---|
| fleet | 1,800 | 27/45 | 3,386 | 15/15 | ✅ both rows |
| finance | 1,800 | 27/45 | 3,386 | 15/15 | ✅ both rows |
| web | 3,000 | 29/45 | 3,590 | 15/15 | ✅ both rows |
| general | 3,000 | 29/45 | 3,590 | 15/15 | ✅ both rows |
| knowledge | 2,400 | 29/45 | 3,590 | 15/15 | ✅ both rows |

**Every profile row survives on every lane, including both "Muhammad's wife is Sara" rows** — the Build-140 pin holds under ranking. No contradiction-flagged rows exist today, so that pin is a no-op now (but stays as a correctness invariant).

## The fleet/finance drop list (18 rows, lowest-score first)
All are either low-value session chatter or research-run operational logs — none is fleet/finance signal:
- `travel to Alexandria…`, `whats my high priorities…`, `Your very high priorities…` (untyped chatter, score ~2.04)
- `M4 PROOF SCAFFOLD…`, `scaffold this proof…`, `that conjecture is not proven…`, `capital of Japan is Tokyo`, `Hi Boss, today is a good day` (session, ~2.66–2.70)
- 6 of the Collatz operational logs beyond the 1,800 budget (`Terras…`, `top-ranked conjecture…`, `seed 11 completed`, `M3-lite generated…`) (~3.06–3.19)

## The one real tuning fork for you (C2 decision)
Ranking is **structural only** (no content keyword-lanes — your absolute rule). So the selector can't say "Collatz is irrelevant to a fleet question"; it can only shrink by budget. Result: a fleet turn still keeps **~12** of the 18 Collatz operational logs (they outrank chit-chat by importance + freshness). Three ways to go:

1. **Accept it (my lean).** MEM is already smaller and identity-pinned; the FLEET packet dominates and the system rule discounts memory on fleet turns anyway. Ship as-is.
2. **Tighter money-lane budget** — set `M8_RECALL_BUDGET_FLEET=1000` (+ finance) in Vercel, **no deploy**, if you want fleet/wallet turns leaner. Reversible any time.
3. **Shorter operational half-life** — would make old research-logs decay faster, but it's a code change (not env) and also ages your real business-state operational rows, so I'd not do it now.

**Recommendation: ship with defaults (option 1), keep option 2 in your pocket for the 7-day soak.** No weight change needed — the pins and budgets behave exactly as intended on your real data.
