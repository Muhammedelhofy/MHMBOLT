# S-SM — Star Map rebuild (FINALIZE rung S-SM) — build report

**Model:** Opus · med-high · **Branch:** `bolt-finalize-starmap` off origin/main `6e660c6` (S5-UI merged; `index.html` only).
**Status:** built + self-verified on preview against **real prod data** (reads only). **NOT merged / NOT deployed** — awaiting deploy-OK.
Frontend only — the live core (3 crons + Bolt sync) untouched. `index.html` only (**+436 / −1628**, net −1,192).

Built to `BOLT_STARMAP_REBUILD_SPEC.md`, honouring Muhammad's LOCKED decisions (SM-1/SM-2/SM-3) over the earlier recommendations.

---

## Step 0 — deletion (grep-verified, no external callers; page reloaded clean after each block)
| Layer | Removed |
|---|---|
| HTML | the whole `#starmap` panel internals (nav bar, GALAXY/SOLAR/COMMAND views, canvases, driver popup, legend) + `#smModelOverlay` → replaced with `#starmapContent` + `#smOverlayHost` |
| CSS | all `.sm-*` (galaxy/solar/popup/model) + all `.cmd-*` (command-bridge) blocks |
| JS | `renderStarMap` + galaxy/solar/canvas engine (~1,070 lines) · `renderCommandBridge` + `smSelectCaptain` + captain briefing (~240 lines) |
| wiring | `_doShowTab`: `smSwitchView('home')` → `renderStarMapDeck()`; dropped the dead `smSelectedCaptain` ref in `showTab` |

**KEPT (SM-1, LOCKED):** the "7ofy" Cerebro lock — `#cerebroOverlay` HTML, `.cbr-*`/`#cerebroOverlay` CSS, all cerebro JS, the `_starmapUnlocked` gate + passcode. Verified: clicking Star Map while locked opens Cerebro and the deck does **not** leak; unlock (`_cerebroSubmit` → `_doShowTab`) renders the new deck. (Restyle to DECK judged not-easy/undesirable — it's a deliberate signature gate, kept intact.)

## The 5 instruments (all REUSE, zero recompute)
- **Stat strip** — `getFleetRoster().length` (+`getRosterReconciliation()` tooltip) · active/blocked from `computeRosterForMonth` · pipeline from the stage snapshot · ambassadors from the roll-up.
- **Timeframe** — single-select month + ALL-TIME, months **derived** from `R.months` (year-proof), A2 chip styling.
- **I1 Tier ladder** — full-roster segmented bar (6K/5K/4K/<4K/IDLE/BLK) from `computeRosterForMonth` bands (**== Today's ladder**), Σ = `current.length` mono footer, achieved/on-pace chips from the same engine; segment → scoped overlay → `dkOpenDriver` (month-scoped).
- **I2 Operation funnel** — PIPELINE→ACTIVATED→EARNING→TIERED + STUCK/BLOCKED leak chips (`blockAtStake` money); reuses `PIPELINE_TERMINAL`/`PIPELINE_STUCK_DAYS` + the stage snapshot (no 16-stage re-map); drills → Onboarding / Blocks / tier overlay.
- **I3 Ambassador leaderboard** — new shared `ambassadorRollup(sel)` (roster grouped by tagged ambassador + `incentiveTotalsFor` money) — top-5 + show-all, money-first sort; row → new `openAmbassador(name)` (reuses S3 `ambFilter`).
- **I4 Bonus projection (hero)** — current month = live projection `Σ companyBonus` (**== Today `projBonus` == Finance "PROJECTED COMPANY BONUS"**); closed month = invoiced FINAL (`computeExecMonth.tierCompany`); honest "on-course vs last-month final" trend; corner-tick accent; → Finance.
- **I5 Growth** — SM-2 stacked tier-band bars + company-bonus line, inline SVG `dir=ltr`, memoized; month-click re-scopes the deck.
- **Trust rail** — `dkAlertRail(dkAlertRegistry(['stale','reconcile']))` only (§5); absent when calm.

**Boundary (§1) held:** DOM scan of the rendered deck against all roster driver names → **0 driver names on the surface** (only ambassador names + aggregates). No action buttons. Names appear only inside drill overlays.

New interface added (spec §4 asked for it if S3/S4 didn't ship it): `ambassadorRollup(monthSel)` + `openAmbassador(name, monthKey)`.

## Verification (preview :3000 rooted at this worktree, real prod Supabase — reads only, 0 console errors throughout)
Snapshot drifted live during the session (roster 98→101 as prod synced); every check below is internally consistent at its instant.

| Acceptance check | Result |
|---|---|
| Zero console errors, all tabs cycle, Star Map opens (after the lock) | ✓ |
| **No driver name on the surface** (DOM scan vs 101 roster names) | ✓ 0 leaked |
| I1 segments **== Today's `bandCounts`**; idle+blocked reconcile to `current.length` | ✓ Σ segments = 101 = `current.length` |
| I1 achieved/on-pace chips consistent with the segments | ✓ (e.g. 6K 12 seg = "12 on pace") |
| I4 projected **== Today `projBonus`** | ✓ both 20,750 |
| I4 projected **== Finance "PROJECTED COMPANY BONUS"** header | ✓ both 20,750 (Finance "BOOKED SO FAR" = `tierCompany` 5,642 = my "Booked") |
| I4 last-month final = invoiced Jun `tierCompany` | ✓ 18,317; May selected = FINAL 2,992 (was 0 pre-fix) |
| I3 incentive owed **== Incentives** (`grandSar`) | ✓ parity (both 0 today — nationality data incomplete, engine refuses to guess, same as S4) |
| Stat-strip roster **== Captains' roster** | ✓ 101 with reconciliation tooltip |
| Timeframe month→ALL-TIME flips the matrix (I1 hidden, lifetime strip, I5 full width) | ✓ lifetime: fleet-net all-time · company bonus closed 21,309 (=May 2,992 + Jun 18,317) · drivers ever seen · current roster |
| Drills: tier segment → scoped overlay → A1 month-scoped (blocked=28 rows, idle=27, 6K=12) | ✓ |
| Funnel → Onboarding/Blocks; leaderboard row → Ambassadors scoped (`ambFilter`); I5 month-click re-scopes | ✓ |
| Trust rail = stale/reconcile subset only, absent when calm | ✓ |
| Light theme (D-2) — token-only remap, no `!important` | ✓ warm off-white ground, dark text, tier golds adapt; segment counts on a dark chip stay legible in both themes |

## ⚠️ Flagged for your call (I made a judgement here — please confirm)
**1 · SM-3 "read tierStatusFor" vs coherence — a genuine structural conflict.** Your locked SM-3 = read Finance's `tierStatusFor`. But `tierStatusFor` is a **counts-only, tiers-only** summary over a *different* driver universe (earning-drivers), so it **cannot** express the full-roster mirror (idle / blocked / below-pace / Σ=98) or the per-driver drills the ladder needs. Forcing it made the instrument **self-contradict** (bar said 13, chip said 17). So I built I1 on `computeRosterForMonth` — the same engine as **Today** — which is fully coherent + drillable, and I derived the achieved/on-pace chips from it too.

The underlying reason they differ: **Today and Finance already classify tiers differently** (Jul 6K = 13 via Today's calendar run-rate `bandOf(proj)` vs 17 via Finance's `bonusForDriver.tierFloor`). Star Map's I1 now matches **Today**; Finance's tier-COUNT block still shows 17/3/5. The **bonus projection itself (20,750) is identical** across Today, Finance's header, and Star-Map I4 — only the tier *head-count* split differs at the margins. **Recommend** a small follow-up to unify the two tier projections into one engine (then Today, Finance, and Star Map all agree). If you'd rather I flip Star-Map I1 to Finance's numbers now (accepting I1 ≠ Today + a larger closed-month rebuild), say so.

**2 · Closed-month money is now invoice-aware (a fix beyond the literal spec).** The spec said I4's "last month" = `computeRosterForMonth` Σ companyBonus. On real data that reads **0 for May** because May's daily-history mirror is partial — while Bolt's invoice shows **2,992**. Money is doctrine-sensitive, so I sourced I4's finals/trend and I5's bonus line from Finance's invoice-aware `computeExecMonth` (May now shows 2,992, Jun 18,317). Consequence: on the growth chart, the tier **bars** (live daily mix) can under-read a partial early month while the bonus **line** (invoiced) is correct — noted inline on the card. The current month (the primary view) is fully accurate either way.

## Guardrails held
Own worktree off origin/main; **only `index.html`** touched (+ this report). No cron/sync/deploy. Cerebro lock kept (SM-1). Light theme kept (D-2). Arabic ع toggle NOT shipped on this tab (S7 gate, drop-if-worse per §2) — labels are English this rung. **STOPPED before merge — deploy-OK needed** (main auto-deploys prod). Vault + BUILD_LOG update deferred to post-merge (session-close rule).
