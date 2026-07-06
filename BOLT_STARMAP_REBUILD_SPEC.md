# Bolt Dashboard — STAR MAP REBUILD SPEC (D-3)
**Date:** 2026-07-06 · **Author:** Fable 5 · high · **Status:** SPEC ONLY — no code in this session.
**For:** the Opus build session (a later S-ladder rung — it edits `index.html`, which running sessions own).
**Read WITH:** `BOLT_DASHBOARD_FINALIZE_BRIEF.md` (D-3 REVISED, lines 140-148 + business model §"BUSINESS MODEL") ·
`BOLT_DESIGN_SYSTEM.md` (DECK language) · `BOLT_FINALIZE_TAB_SPECS.md` (A1/A2/A3 contracts) ·
`BOLT_S2_REMAINDER_REPORT.md` (the component APIs as actually shipped).

> ⚠️ **DECISION PROVENANCE:** `BOLT_FINALIZE_TAB_SPECS.md` #1 says "REMOVE the Star Map tab." That was
> Fable's original recommendation and **Muhammad overrode it (D-3, 2026-07-06): KEEP BOTH.** This spec
> supersedes tab-spec #1 entirely. Star Map is rebuilt as the strategic command centre; Today stays the
> daily cockpit. Build THIS, not the "remove."

> ⚠️ **CODE-STATE CORRECTION (verified at main `85d3d9e`):** the GALAXY/SOLAR sub-views, the COMMAND
> bridge, and the Cerebro lock are **still in the code** — S0 deliberately deferred gutting them to this
> rebuild rung (`BOLT_S0_DECLICHE_REPORT.md` §Deferred: "gutting them now would be throwaway work on a tab
> that gets replaced wholesale"). **Step 0 of this build = the deletion inventory in §6.** Do not assume
> S0 cleaned this tab; it didn't (only the shared FX/M8/RADAR kills touched it indirectly).

---

## 1 · THE BOUNDARY — Today vs Star Map (zero overlap, by rule)

Brief D-3: *"The two serve DIFFERENT jobs; the old STAR MAP just failed at its job (it was a re-skinned
driver list)."* The boundary is enforced by rules, not vibes:

| | **TODAY** — daily tactical cockpit | **STAR MAP** — strategic command centre |
|---|---|---|
| Question | "What do I do NOW?" | "How is the whole operation doing?" |
| Time frame | current month, anchored on today | selectable: any month / all-time (§3) |
| Unit on screen | individual drivers (queue, slips, movers) | **aggregates only — NO driver list** (D-3) |
| Actions | call/WhatsApp/chase — real buttons | none; click an instrument → drill |
| Alerts | ALL operational alerts (A3 aggregate) | **data-trust alerts only** (§5) |

**Hard rules for the build (each is a QA check):**
1. **No driver name renders on the Star Map surface.** Names appear only after a drill click, in an
   overlay (scoped list → A1 panel) or on the destination tab. (D-3: "NO driver list — pure instruments.")
2. **No action buttons** (call/WhatsApp/chase). Acting is Today's and the worklist tabs' job.
3. **No operational alert rail** (blocked/slipping/stuck live on Today via `dkAlertRegistry`). Star Map
   shows only alerts that undermine trust in its own instruments — see §5.
4. Every number that also exists elsewhere **must be the same number** (same engine call, never a
   reimplementation) — §4's "Source" column is a contract, and §8's acceptance checks assert equality.

## 2 · LAYOUT — one DECK deck, ≤ 1.5 viewports (design system §3)

```
┌ DECK HEADER   STAR MAP · "the whole operation" line    status readout · EN|ع ┐
├ TRUST RAIL    (data stale / cron failed / reconcile due — usually absent)    ┤
├ TIMEFRAME     month chips (derived, year-proof) · ALL-TIME                   ┤
├ STAT STRIP    ROSTER · ACTIVE (period) · IN PIPELINE · BLOCKED · AMBASSADORS ┤
├ ROW 1         I4 BONUS PROJECTION (hero, ⅓)  │  I1 TIER LADDER (⅔)          ┤
├ ROW 2         I2 OPERATION FUNNEL (full width, short)                        ┤
├ ROW 3         I3 AMBASSADOR LEADERBOARD (½)  │  I5 GROWTH (½)               ┤
└ drill overlays open OVER the deck (never stack below)                        ┘
```

- Stat strip sources: `getFleetRoster().length` with the reconciliation sub-line as its title/tooltip
  (`getRosterReconciliation()` — "98 = 97 portal + 1 deact.", the S1 truth, exactly as Captains does it);
  active-in-period from `computeRosterForMonth`; pipeline count from the S3 snapshot; blocked from
  `R.blockedCount`; ambassadors from the S3 roster roll-up.
- The **one** corner-tick accent (design system §4, "exactly one element per page") belongs to the I4 hero.
- Charts are inline SVG in `dir=ltr` islands (design system §7) — no chart library enters the codebase;
  the Today money-card sparkline (grep `Money-card footer: 14-day sparkline`) is the precedent.
- Arabic: all new strings go into the `DK_T` dictionary with `ar` values at build time, but the ع toggle
  ships for this tab only behind the S7 quality gate (brief: "fully clean RTL or not at all").

## 3 · TIMEFRAME MODEL — month | all-time

The engine takes ONE month or `'all'` (`computeRosterForMonth(monthSel)`), so the selector is
**single-select month + ALL-TIME** — reusing A2's month *derivation* (`computeRosterForMonth().months` —
the year-proof rule, never hardcoded chips) and A2's chip styling, but not the multi-select behaviour.
Precedent: Captains "propagates via its own richer period chrome through the same path" (S2 report).

| Instrument | MONTH mode (default = latest month) | ALL-TIME mode |
|---|---|---|
| I1 Tier ladder | full (achieved + on-pace split) | hidden — a monthly concept; replaced by the lifetime strip |
| I2 Funnel | shown (it is a NOW instrument — label it `PIPELINE — LIVE`) | same (unchanged) |
| I3 Leaderboard | month-scoped roll-up | all-time roll-up |
| I4 Bonus projection | full (hero) | replaced by lifetime strip |
| I5 Growth | last-12-months window, ½ width | full width, all months — the hero of this mode |
| Lifetime strip (all-time only) | — | fleet net all-time · company bonus across closed months · drivers ever seen · current roster |

Projection is only honest inside a month (`projectable === false` for `'all'` — the engine already says
so); ALL-TIME never fakes one.

## 4 · THE INSTRUMENTS (D-3's five) — source · visual · drill

**Reuse doctrine:** every "Source" below is an existing engine or a helper another rung ships.
The build session recomputes NOTHING. (Engine field reference — `computeRosterForMonth` returns
`{months, monthSel, periodLabel, projectable, TIERS, bandOf, drivers, current, blockedCount, …}` with
per-driver `{net, proj, band, blocked, idle, left, companyBonus, nextFloor, gapToTier, pushExtra,
unlocks, pushFeasible}` — verified at `85d3d9e`, index.html ~12011.)

### I1 · TIER LADDER — fleet-wide distribution ("where does the whole fleet sit on the 4k/5k/6k ladder?")
- **Source:** `R = computeRosterForMonth(sel)` → `R.current`; achieved band = `R.bandOf(d.net)`,
  projected band = `d.band`. Once S4 ships `tierStatusFor(month)` (the single tier-status source that
  kills the "No drivers hit a tier" contradiction), **switch to it** — build order decides which lands
  first; the spec's requirement is one shared source with Finance, not two.
- **Visual:** full-width horizontal segmented bar — `6K / 5K / 4K / <4K` in the tier tokens
  (`--tier-6/5/4/0`), plus `IDLE` (dim) and `BLOCKED` (danger tint) segments so **every current driver is
  accounted for** (Σ segments = `R.current.length`, printed as a mono footer — the mirror-accuracy
  doctrine). Under the bar, one count chip per band using the S4 copy pattern: `6,000 — 2 achieved · 3 on
  pace` (achieved filled / projected hollow, the established tier-pill convention).
- **Drill:** click a segment → overlay scoped list (name · tier pill · proj · gap-to-floor), rows →
  `dkOpenDriver(name, R.monthSel)` (the A1 contract: the panel opens scoped to the deck's month).
- **Edge:** past months show achieved only (proj == net by engine design); `<4K` segment renders in
  `--tier-0` dim, never red (design system: "below ≠ bad, it's the pipeline").

### I2 · OPERATION FUNNEL — end-to-end pipeline health ("is the machine feeding the ladder?")
- **Source:** pipeline stages = **S3's macro-stage collapse** of `fetchStageSnapshot()`
  (`sheet_stage_snapshot`) + S3's stuck>`PIPELINE_STUCK_DAYS` math — reuse S3's helper, don't re-map the
  16 stages. Active/earning/tiered counts from `R.current`; blocked leak = `R.blockedCount`; unblock
  money at stake = Σ `blockAtStake` (Blocks #5 already computes it, S2 report).
- **Visual:** one horizontal flow bar, five segments with mono counts —
  `PIPELINE n → ACTIVATED n → EARNING n → TIERED n` with two leak chips hanging off it:
  `⚠ STUCK >SLA n` (warn) and `⛔ BLOCKED n · x SAR at stake` (danger). This is the business model
  (brief §"BUSINESS MODEL": onboard → unblock → threshold → company bonus) drawn as one line.
- **Drill:** pipeline/stuck → the Onboarding tab (`showTab('pipeline')` equivalent — reuse, don't
  duplicate its stuck list) · blocked → the Blocks worklist · tiered → I1's scoped overlay.
- **Edge:** if the sheet snapshot is unreachable, the pipeline segment degrades to `PIPELINE —` with a
  muted "sheet mirror unavailable" note; the roster-side segments still render (never a blank instrument).

### I3 · AMBASSADOR LEADERBOARD — ("who is feeding the funnel?")
- **Source:** **S3 #7's per-ambassador roll-up** (drivers brought · active % · fleet-net contribution ·
  incentive owed via the shared `incentiveTotalsFor(month)` · slipping count). Interface requirement on
  S3 (small): expose the roll-up as a callable helper + an `openAmbassador(name)` entry point so Star Map
  can deep-link. If Star Map builds before S3 lands, this instrument ships as a placeholder card — do NOT
  hand-roll a second attribution aggregation from `loadCourierProfiles()`.
- **Visual:** ranked compact table, **top 5 + "show all"** expander (no forever-scroll): rank chip (mono
  `#1`), ambassador name, drivers (n), fleet-net contribution (mono SAR), incentive owed (mono, currency
  by team). Default sort: fleet-net contribution desc (money first). Ambassador names are not driver
  names — they may render on the surface.
- **Drill:** row → Ambassadors tab scoped to that ambassador (their drivers → A1 there).

### I4 · BONUS PROJECTION + TREND — the hero ("how much company money is this month on course to earn?")
- **Source:** projected = Σ `d.companyBonus` over `R.current` non-idle — **identical to Today's
  `projBonus`** (renderToday ~13118) and, once S4 lands, to the Finance Executive header; the acceptance
  check asserts all three are equal. Banked = the achieved-tier slice (from `bandOf(d.net)` /
  `tierStatusFor`). Last month = `computeRosterForMonth(prevKey)` Σ `companyBonus` — for past months the
  engine returns proj == net, so this is last month's REAL bonus, no special-casing.
- **Trend honesty:** the comparison is *this month's projection vs last month's final* — labelled exactly
  that (`ON COURSE 12,400 · JUN FINAL 9,800 · ▲ 27%`). Do NOT build a "same days elapsed" bonus cut:
  bonus is threshold-based, not additive per day, so a mid-month bonus cut would lie. (Today's
  same-days-elapsed compare is for fleet NET, where it's honest — different metric, different rule.)
- **Visual:** `data-xl` hero numeral (the page's 1-2 hero numerals live here) + three sub-stats
  (banked · last month final · Δ chip in brand/danger) + the corner-tick accent. Company money only —
  the driver's net is the driver's money (income doctrine); the split % detail stays on Finance.
- **Drill:** → Finance (Executive / Bolt Bonus).

### I5 · GROWTH — over time ("is the operation growing, and moving UP the ladder?")
- **Source:** for each `m` in `R.months` (chronological): `computeRosterForMonth(m)` → per-month
  {fleet net Σ, non-idle driver count, company bonus Σ, band counts}. Memoize in a `_smMonthCache`
  invalidated on data refresh — months are few (currently ~6), this is cheap; do not write a parallel
  aggregation over raw history.
- **Visual (fork — recommendation first, see §9):** **(a) Recommended:** per-month stacked bars of
  driver counts by tier band (tier colours — the ladder mix IS the growth story) with the company-bonus
  series overlaid as a brand-coloured line, inline SVG, `dir=ltr` island, last 12 months window.
  (b) Fallback if (a) is visually noisy on real data (builder's eyes-on call): plain monthly fleet-net
  bars + bonus line, tier mix left to I1.
- **Drill:** click a month column → sets the §3 timeframe selector to that month (the whole deck
  re-scopes) — the chart doubles as time navigation.

## 5 · TRUST RAIL — the one alert exception

Issue #1 asked for an "ALERTS layer"; tab-spec #1 folded that into Today's A3 rail, and D-3 REVISED's
instrument list drops it. Resolution that keeps zero overlap: Star Map's rail shows **only the alerts
that make its own instruments untrustworthy** — `data stale ≥2d` (warn) · `cron failed last night`
(danger) · `reconcile due` (warn) — via `dkAlertRail(dkAlertRegistry(only))` with exactly that subset.
Blocked/slipping/stuck alerts stay Today-only (they demand action, and acting is Today's job). The rail
is absent when calm, per the component contract.

## 6 · STEP 0 — DELETION INVENTORY (what this rung removes before building)

The rebuild replaces the tab's internals wholesale. Grep anchors (line refs @ `85d3d9e` drift as S3+
merge — trust the anchors):

| Layer | Kill (anchors) |
|---|---|
| HTML | everything inside `<div id="starmap" class="panel">` (~1480-1553): `#smNavBar` + COMMAND/GALAXY/SOLAR buttons, `#smHomeView/#smGalaxyView/#smOpsView/#smCanvasWrap`, `#starMapCanvas`/`#smOpsCanvas`, `#smDriverPopup`, `.sm-bottom-legend` · the Cerebro overlay markup (`#cerebroOverlay` + `#cbr*` ids) pending the §9 call |
| JS | `renderStarMap` + galaxy arms/zoom/time-lapse/`smDrawHome*` (~3534-4300) · SOLAR system (~4307-4560) · `smSwitchView`/home-chooser canvas · `renderCommandBridge` + captain briefing + `smSelectCaptain`/`smSelectedCaptain` (~13543-13760) · Cerebro (`openCerebroLock`/`closeCerebroLock`/`_cbr*`/`_cerebroSubmit`, ~13768-13840) + the `_starmapUnlocked` gate in `showTab` (2152-2159) pending §9 · `_doShowTab`'s `smSwitchView('home')` hook → becomes `renderStarMapDeck()` |
| CSS | all `.sm-*` blocks (~662-760: nav bar, view toggle, planet pulse, controls, popup circle) · `.cmd-*` bridge styles · `.cbr-*` (pending §9) |

Keep: the tab button (`data-tab="starmap"`, label **Star Map** — D-3 keeps his name) and the panel div
id. This completes the design-system §8 kill list's last open line ("Star Map GALAXY/SOLAR — per tab
spec #1") under the D-3 interpretation: the sub-views die, the tab lives. Expected net: roughly
−1,500-2,000 lines out, ~+400 in. **After each deletion block: reload + zero console errors** (the S0 rule).

## 7 · REUSE CONTRACT — S1/S2 components this build consumes (never reinvents)

| Component (as shipped) | Use here |
|---|---|
| `dkDeckHeader` / `.dk-head` + `dkFreshness()` status readout | §2 header |
| `dkAlertRail(…)` + `dkAlertRegistry(only)` | §5 trust rail (subset only) |
| A2 month derivation (`computeRosterForMonth().months`) + chip styling | §3 selector (single-select variant) |
| `dkOpenDriver(name, monthKey)` → `openModal(id, null, {monthFilter})` (A1) | every driver drill, scoped to the deck's timeframe |
| `dkTierPill` (filled=achieved / hollow=projected) · tier tokens `--tier-*` | I1, drill overlays |
| `dkBulk` bulkhead labels · deck cards · stat strip pattern | §2 skeleton |
| `getFleetRoster()` / `getRosterReconciliation()` (S1) | stat strip roster truth |
| `computeRosterForMonth` / `bonusFor` / `computeTrailingWindows` | all instrument math |
| S3 helpers (macro-stage funnel, ambassador roll-up, `incentiveTotalsFor`) · S4 `tierStatusFor` | I2, I3, I1/I4 shared sources |
| `DK_T` + `t()` + `dir=ltr` chart-island convention | strings + charts |

## 8 · SEQUENCING + ACCEPTANCE

**Rung: S-SM, after S4, before S6** (S6 stays last — touches-live). Rationale: I2/I3 consume S3's
helpers, I1/I4 consume S4's `tierStatusFor`; building earlier means placeholder instruments or duplicate
math (the exact disease this finalize cures). S5 is disjoint and can run in parallel as before.
**Model: Opus · med-high** (frontend-only; one big delete + one new render path). **Risk: LOW** —
no cron/sync/storage writes; the deleted code is unreachable from other tabs (COMMAND/GALAXY/SOLAR are
Star-Map-internal; verify with a caller grep before excision, the S0 method). Own worktree off
origin/main · `index.html` only + report · STOP before merge — Muhammad's deploy-OK (D-5).

**Acceptance checks (paste real output in the session report):**
1. Zero console errors after load + cycling all tabs; Star Map opens directly (per the §9 lock call).
2. **No driver name on the surface** — DOM scan of the rendered deck against the roster name list.
3. Equality asserts, same month: I1 band counts == Today's ladder counts (workers) + idle/blocked
   reconcile to `current.length` · I4 projected == Today's `projBonus` (and Finance Executive once S4 is
   in) · I3 incentive owed == Incentives tab totals · stat-strip roster == Captains' 98 w/ reconciliation.
4. Timeframe: month → all-time flips the §3 matrix correctly; a past month shows achieved-only I1 and
   real-final I4; I5 month-click re-scopes the deck.
5. Drills: tier segment → scoped overlay → A1 opens month-scoped; funnel segments land on
   Onboarding/Blocks; leaderboard row lands on the ambassador's card.
6. Trust rail: shows the stale/cron/reconcile subset only, absent when calm.
7. Light theme toggles clean (D-2 — token-only, no `!important` regressions); charts render LTR under ع
   (RTL ships only behind the S7 gate).

## 9 · SPEC DECIDES / YOUR CALL

**Spec decides (no action needed · 🟢):** the Today/Star-Map boundary rules (§1) · the five instruments +
layout (§2/§4) · single-month+all-time timeframe model (§3) · trust-rail-only alerts (§5) · the deletion
inventory (§6) · the reuse contract (§7) · rung position after S4 (§8) · the tab keeps the name Star Map.

**🔴 Muhammad's calls (each with my pick first):**
| # | Call | Recommendation |
|---|---|---|
| SM-1 | **Cerebro lock** ("7ofy" neural-scan gate, re-locks on every tab switch) | **Delete (Recommended).** It's the exact theatre the DECK kills, it gates nothing Finance/Today don't already show, and the re-lock makes the command centre the hardest tab to glance at. Fallback if you want a gate for over-the-shoulder moments: a plain DECK-styled PIN overlay, session-sticky (unlocks once per load), no theatre. |
| SM-2 | **Growth chart form** (I5) | **(a) stacked tier-band bars + bonus line (Recommended)** — growth and ladder-mix in one picture; builder may fall back to (b) plain net bars + bonus line eyes-on if (a) is noisy with real data. Say now if you want (b) outright. |
| SM-3 | **Build timing** | **After S4 (Recommended).** If you want it sooner, it can follow S3 with I1/I4 reading the engine directly and a TODO to re-point at `tierStatusFor` — works, but creates the two-sources window this finalize exists to close. |

### ✅ MUHAMMAD'S DECISIONS — LOCKED (2026-07-06) — BUILD TO THESE, not the recommendations above
- **SM-1 = KEEP the "7ofy" Cerebro lock.** Muhammad OVERRODE the "delete" recommendation — the lock STAYS. (Restyle it to fit DECK if it's easy, but do NOT remove the passcode gate. Keep the `_starmapUnlocked` gate behavior.)
- **SM-2 = (a) stacked tier-band bars + bonus line** (as recommended; builder's eyes-on fallback to (b) allowed only if (a) is genuinely noisy on real data).
- **SM-3 = build AFTER S4** (as recommended — reads `tierStatusFor`, no two-sources window).
