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
- **I1 Tier ladder** — tier segments (6K/5K/4K/<4K) + achieved/on-pace chips from **Finance** (`smTierDetail`, which replicates `tierStatusFor` exactly → invoice for closed months, pace projection for the open one), with a **roster reconciliation footer** (active · idle · blocked · total) so every current driver is still accounted for; every segment → scoped overlay → `dkOpenDriver` (month-scoped). *(Switched from the roster engine to Finance per Muhammad's call — see below.)*
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
| I1 tier counts **== Finance** (`tierStatusFor`); roster reconciled on the footer | ✓ 6K 20 · 5K 4 · 4K 4 == Finance; footer 101 = 46 active + 27 idle + 28 blocked |
| I1 achieved/on-pace chips consistent with the segments; funnel TIERED == I1 tiers | ✓ chips 20/4/4; TIERED 28 = 20+4+4; May (closed) shows its **9** invoiced 4K drivers (was 0) |
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

## Decisions (both confirmed by Muhammad 2026-07-06)
**1 · SM-3 — I1 reads Finance (`tierStatusFor`). RESOLVED — you chose "switch to Finance", implemented + verified.** `tierStatusFor` is a counts-only / tiers-only summary over the *earning-driver* universe, so it can't itself carry the roster mirror or per-driver drills. Implementation: a co-located `smTierDetail(month)` replicates `tierStatusFor`'s classification **exactly** (invoice for closed months, pace projection for the open one) **and** collects the per-driver names, so the segments + chips read the Finance numbers (verified `match: true`, e.g. 6K 20 / 5K 4 / 4K 4) and every segment still drills to real drivers. The full roster stays reconciled on the footer (`101 = 46 active + 27 idle + 28 blocked`). I5's growth bars + the funnel's TIERED now use the same source, so all of Star Map agrees with Finance; a closed month reflects its invoice (May shows its 9 tiered drivers, not 0).
- ⚠️ **Consequence to note:** Star-Map I1 now differs from the **Today** tab's tier ladder (Today still classifies via `computeRosterForMonth.bandOf(proj)` — e.g. 6K 13 vs 20). The bonus *projection* (20,750) matches everywhere; only Today's tier *head-count* now disagrees with Finance + Star Map. **Recommend** a small follow-up to migrate Today's ladder onto `tierStatusFor` too, so all three tabs agree.

**2 · Closed-month money is invoice-aware (a fix beyond the literal spec).** The spec said I4's "last month" = `computeRosterForMonth` Σ companyBonus. On real data that reads **0 for May** because May's daily-history mirror is partial — while Bolt's invoice shows **2,992**. Money is doctrine-sensitive, so I sourced I4's finals/trend and I5's bonus line from Finance's invoice-aware `computeExecMonth` (May now shows 2,992, Jun 18,317). The current month (the primary view) uses the live projection (== Today == Finance's "PROJECTED COMPANY BONUS").

## Guardrails held
Own worktree off origin/main; **only `index.html`** touched (+ this report). No cron/sync/deploy. Cerebro lock kept (SM-1). Light theme kept (D-2). Arabic ع toggle NOT shipped on this tab (S7 gate, drop-if-worse per §2) — labels are English this rung. **STOPPED before merge — deploy-OK needed** (main auto-deploys prod). Vault + BUILD_LOG update deferred to post-merge (session-close rule).
