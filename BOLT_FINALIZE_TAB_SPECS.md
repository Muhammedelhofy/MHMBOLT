# Bolt Dashboard FINALIZE — Component + Tab Specs + Execution Sequence
**Date:** 2026-07-06 · **Author:** Fable 5 · high · **For:** the Opus execution sessions.
**Read WITH:** `BOLT_DESIGN_SYSTEM.md` (visual language — the TODAY tab in branch `claude/finalize-design` is the live exemplar; copy its patterns) and `BOLT_DATA_INTEGRITY_FINDINGS.md` (backbone fixes F1–F8 — F1/F2/F3 land BEFORE any counting surface is restyled).

**Non-negotiables for every session:** own worktree off origin/main · git add own files only · live core (3 crons + Bolt sync) hands-off · STOP before merge, Muhammad gives the explicit deploy-OK (main auto-deploys prod) · verify-before-claiming: each session ends with the page loaded, zero console errors, and its acceptance checks pasted into the report.

---

## PART A · REUSABLE COMPONENTS (build once, in the FIRST session that needs them)

### A1 · Driver detail panel — `openDriverPanel(name, ctx)`
**The** shared "click a driver anywhere" surface. Evolves the existing `openModal(name, periodFilter)` (index.html:3182) into a DECK slide-over (inline-end, 420px, overlay shadow allowed). Everything the funnel needs on one card:

| Section | Content | Source |
|---|---|---|
| Identity | name (+Arabic alias via `lookupForeignName`), phone as `tel:` + `wa.me/966…` links, ambassador, nationality, vehicle plate | profiles, sheet mirror |
| Status | Bolt state chip (`active/suspended/deactivated`), block category + FULL reason (expandable, never truncated), since-date, vehicle-level block if present | latest roster day (`bs/bsr/bsc/bss/vs/vsr`), block-log |
| Tier (the lens) | banked net (month), projected net, tier pill (achieved filled / projected hollow), gap to next floor, `+X SAR/work-day` push cost, company bonus it unlocks | `computeRosterForMonth` fields — do NOT recompute |
| Activity | 14-day net sparkline (LTR island), days worked, last active day | history |
| Pipeline | current stage + days-in-stage (only if the driver is in the snapshot) | `sheet_stage_snapshot` |
| Actions | Add to chase list · copy phone · WhatsApp · edit profile (existing editor) | existing fns |

**Contract:** `ctx = { periodFilter }` — the panel ALWAYS respects the calling tab's selected month/days (the existing `periodFilter` param is wired but several callers don't pass it — fix every call site; this closes the #9 complaint "pick a month → the driver window shows THAT period"). Callers: Today queue/slip rows, Captains rows, Analytics drills, Blocks worklist, Ambassadors driver lists, Onboarding stuck list, Data-Health issue rows.

### A2 · Filter / sort / date system — `dkFilter(host, config, state, onChange)`
One component, config-driven, per-tab state (in-memory):
- **Months:** derived from history periods exactly like `computeRosterForMonth().months` — **never a hardcoded chip row** (this is the year-proof rule; grep out any literal `2026` chip builders). Multi-select + `All`.
- **Days:** when a single month is selected, optional day multi-select (Captains compare flows).
- **Chips:** status (Current/Left/Blocked/Idle), tier band (6k/5k/4k/<4k — tier pills as filters), nationality, ambassador (from `ambassadors` table).
- **Sort:** column-header driven in tables (▲▼ on active column only); a sort dropdown in card lists.
- **Propagation law:** whatever the filter says, the drill lists AND the driver panel (`ctx.periodFilter`) receive it. A filter that doesn't reach the detail view is a bug.

### A3 · Alerts pattern — `dkAlertRail(alerts)`
Exactly the exemplar's rail: `{cls: danger|warn|info, n, txt, go}`, under the deck header, absent when calm. **Source registry** (each tab contributes; Today aggregates all): blocked-on-Bolt (danger) · data stale ≥2d (warn) · reconcile due (warn) · slipping drivers (warn) · onboarding stuck>SLA (warn) · ambassadors slipping (warn, when #7 lands) · cron failed last night (danger, from `last_cron.ok=false`). One implementation, zero bespoke alert boxes anywhere else.

---

## PART B · TAB-BY-TAB SPECS

### #1 · STAR MAP → **REMOVE the tab; Today IS the command deck** 🔴 D-3
GALAXY + SOLAR = decoration (kill). COMMAND = a re-skinned captains list (redundant). Today (exemplar) already does the command job with real actions. **Delete the starmap tab, panel, all `sm*`/galaxy/solar/constellation code + canvases.** Unique-ish widgets fold in: top-ambassadors → #7's roster cards; its alert wall → A3 rail on Today. If Muhammad ever wants a wall-screen view, it's a fullscreen variant of Today, not a second command surface.

### #3 · ONBOARDING (pipeline)
DECK skeleton. Stat strip: `IN PIPELINE / STUCK > SLA / ACTIVATED 7D / LOST 7D` (same math as Today's card). Work grid:
1. **Funnel bar** — one horizontal segmented bar, stage → count (16-stage collapsed to the ~8 macro stages for legibility; config map). Click a segment → the stuck-list for THAT stage, each row: driver, days-in-stage (mono), owner hint (Khaled/Bolt-CS from stage), click → A1 panel.
2. **Flow, 8 weeks** — replace the unreadable "Weekly Flow" chart with two simple series (leads-in vs activated per week, bars + line, LTR island). If it can't be made legible in one chart, show two mini bars.
3. **Sheet-link trust strip** — `MIRROR 22:10 ✓ · STAGES 21:51 ✓` from the tables' max synced_at + the F5 "Refresh mirror now" button when it ships.
SLA stays `PIPELINE_STUCK_DAYS`; per-stage SLA only if trivial (config object), not a feature.

### #4 · ANALYTICS
Keep it the deep-analysis tab, DECK skeleton, four sections (bulkhead-labelled), everything drills to A1:
1. **Tier movement** — matrix/chips: band now (projected) vs last month per driver; ▲/▼ lists.
2. **Pushable** — `pushFeasible` drivers sorted by `unlocks` desc with push-cost; this is the money list.
3. **Cohort ramp** — the Build-152 new-driver ramp, restyled only.
4. **Idle & recovery** — idle-with-recent-earnings (recoverable SAR), acceptance-drop list.
Fleet-wide vanity averages (avg utilization etc.) move into a collapsed "fleet stats" drawer or die. KPI cards must be claims a manager acts on.

### #5 · BLOCKS → an unblock WORKLIST (funnel-critical: foreigners must be unblocked to earn)
Stat strip: `BLOCKED NOW / VEHICLE-BLOCKED / UNBLOCKED THIS WEEK / BONUS AT STAKE (SAR)` — that last one = sum of blocked drivers' projected company bonus (from their pre-block pace): the number that makes the queue urgent. Kill the "516 days suspended" lifetime total.
**Worklist rows** (sorted by bonus-at-stake desc): driver · tier pill (pre-block pace) · category chip (`bsc` or keyword-class fallback) · **full reason** (`bsr` — expandable row, never truncated) · since (`bss` else block-log date) · days blocked · actions: **Add to unblock chase** (chase-list entry with unblock template text) · mark unblocked (existing block-log close). Click row → A1 panel (status section leads).
History sub-list per driver = block-log entries (current/past like Bolt's own suspensions panel). Trust strip: `SYNCED NIGHTLY · LAST 00:52 ✓` — the roster day carries the states; that IS the Bolt sync confirmation.

### #6 · INCENTIVES
Break the monolith into **per-referrer cards**: name · team chip (EGP/SAR) · qualified drivers count · amount owed (mono, currency by team) · click → their drivers (who qualified, month, amounts) → A1. Filters via A2 (month, team, qualified-only). **Totals row** always visible: total owed per currency.
★ **Exceptions/overrides (NEW):** `khair_incentive_overrides` in the blob: `{ 'YYYY-MM|referrerName': { mode:'delta'|'replace'|'waive', amount, note, by, ts } }`. UI: an ⚙ on each card → set override + REQUIRED note; card shows `auto 1,200 → paid 1,500 (note)`; an audit list at the bottom of the tab renders every override for the month. **P&L parity:** Finance reads ONE shared `incentiveTotalsFor(month)` that applies overrides — assert Incentives total == P&L line in the QA pass.
(Data gate unchanged: needs Nationality — 68/153 at investigation time; the tab already refuses to guess.)

### #7 · AMBASSADORS
Three bulkhead sections: **Worklists** (attribution gaps — keep, restyle) · **Roster** — per-ambassador cards: drivers brought, active %, fleet-net contribution MTD, incentive MTD (from #6's shared fn), slipping count; click → scoped drill (their drivers, A1 on click) · **Log** (recent attributions). The "ambassador self-manage" idea = future, out of finalize scope (note only).

### #8 · FINANCE (money = doctrine-sensitive; every change verified against the recent finance-v2 work)
**Sub-tab consolidation:** keep **Executive** (P&L — recently rebuilt, restyle only) · keep **Bolt Bonus** (tier bonus + closed-month invoice upload — make the upload affordance loud: an alert-rail entry on Finance when a closed month lacks Bolt's invoice) · keep **By Captain** minus dead columns (🔴 D-1) · **remove By Model** (trivial slice, its one insight — net by model — becomes a single stat on Executive if anyone asks) · **Cycle Reconciliation → a month checklist card** on Executive (it exists to feed `reconDue`; it doesn't need a whole sub-tab) · keep **Transfer Log**.
**Tier-status single source:** one `tierStatusFor(month)` → per tier `{achieved: n, projected: n, none}` with one copy pattern: `6,000 — 2 achieved · 3 on pace` — used by Executive, Bolt Bonus, Fleet cards. This kills the "No drivers hit a tier / 6,000 tier" contradiction class.
**Frame:** the Executive header = the bonus PROJECTION story: `PROJECTED COMPANY BONUS (month) / BANKED (invoice or achieved) / SPLIT %` — company money first, driver money clearly labelled as the driver's.

### #9 · CAPTAINS (his favourite — polish, don't rebuild)
- **Retag:** MODEL `S/F/R` letters + REF `N/M/Y/H` → **ambassador-name tags** from profiles (dim `—` when unset). Legacy letters die everywhere (legend, filters, radar refs).
- **Trips label:** Build-128 renamed Trips→Orders dashboard-wide; the API field is finished ORDERS (rides). Rename the column **Trips** and add the QA step: one known day's count checked against the portal.
- **Filter → panel:** every `openModal` call from Captains passes the current period selection (A1 contract).
- **RADAR sub-view: delete** (canvas + `captainView==='radar'` branch). **BY DAY: keep** (real daily digest use). **COMPARE DAYS: keep as-is** (works, zero cost); revisit only if it blocks something.
- Then DECK restyle: stat strip = fleet count (F2's roster truth + "with activity in ⟨period⟩" label), tier pills column in the table.

### #10 · M8 orb + FX → REMOVE. Kill list = `BOLT_DESIGN_SYSTEM.md` §8. First execution session, before any restyle.

### #11 · TODAY — ✅ built (this branch). v2 backlog (cheap, after other tabs land): add onboarding-stuck + ambassador-attention as priced queue candidates; swap freshness inference for the F1 `src` tag; localized month label in the "days left" context line.

### #12 · SETTINGS
- **Prune:** keep op-cost dated-change, bonus upload pointer, EGP→SAR rate (drives #6), sync/backup cards. Collapse perf flags + diagnostics into one "Advanced" details block. Referrer config: the sheet is the source of truth (Build-173) — the local list stays only as offline fallback, labelled so.
- **Data Health → interactive:** every issue line (duplicate phones, tagged-not-on-Bolt, missing nationality, no-ambassador, missing-team, fleet-check) becomes clickable → the affected-driver list → A1 panel with the fix affordance (edit profile / open sheet row hint). Add the F2 reconciliation line (`Roster 98 = portal 97 + deactivated 1`) and the F8 backups count.
- **Sync card:** last cron ✓/✗ + backups `16/16` + "Refresh sheet mirror" (F5).

---

## PART C · EXECUTION SEQUENCE (each row = one session, own worktree, STOP before merge)

| # | Session | Contents | Model · Effort | Risk |
|---|---|---|---|---|
| S0 | **De-cliché sweep + global chrome** | Kill list §8 (M8 orb/voice/FX/particles/EKG/ingestion), RADAR + GALAXY/SOLAR deletion, STAR MAP removal (D-3), light-theme per D-2, font swap to Plex, tab-strip + header in DECK (emoji out of tab labels), body/global tokens re-based to `--dk-*` | Sonnet · med | LOW (frontend deletes; page must load clean after EVERY block) |
| S1 | **Mirror-accuracy backbone** | F1 per-driver day merge + `s` source tag (codec both copies + parity test) · F2 `getFleetRoster()` + count relabels · F3 departed hardening · acceptance checks §6 of findings | Opus · med-high | MED (touches cron packEntry additively) |
| S2 | **Core components + heavy tabs** | A1 driver panel · A2 filter system · A3 rail registry · Captains #9 · Blocks #5 · Analytics #4 | Opus · high | LOW-MED |
| S3 | **Funnel tabs** | Onboarding #3 · Ambassadors #7 · Incentives #6 incl. overrides + shared `incentiveTotalsFor` | Opus · med-high | LOW |
| S4 | **Finance + Settings** | #8 consolidation (needs D-1) · tierStatusFor · #12 interactive Data Health | Opus · med-high | MED (money views — verify against finance-v2 numbers) |
| S5 | **Ops endpoints + docs** | F5 sheet-refresh endpoint + buttons · F7 lib hardenings · F8 backup visibility · README/RUNBOOK refresh | Sonnet · med | LOW |
| S6 | **C1 concurrency guard** 🔴 | F4 (conditional writes, single cron write, history-dirty flag, throwaway-row two-writer test) — ship alone, on a night Muhammad watches the midnight run | Opus · high | HIGH — the one touches-live session |
| S7 | **Arabic completion + cleanup** | Extend `DK_T` across converted tabs, lift lang/dir to `<html>`, drop Inter/Share Tech Mono + dead legacy CSS, `slimForCloud`/JSONBin quarantine check (C5) | Sonnet · med | LOW |

Parallel-safe: S5 can run beside S2-S4 (disjoint files). S6 last always. After each merge: Muhammad's deploy-OK → verify on prod → update vault + BUILD_LOG (session-close rule).

## PART D · 🔴 DECISIONS FOR MUHAMMAD (blocking the marked sessions)

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| **D-1** | Finance dead model (rent/salary/fleet-cut columns, By Model tab): **delete** or hide? | **Delete the UI** (columns, By Model tab, related export fields). Profile data fields stay in storage untouched — if the rental model ever returns it's a UI re-add, not a data recovery. A finalize should shrink surface. | S4 |
| **D-2** | Light theme: drop or rebuild? | **Drop** (design doc §6). | S0 |
| **D-3** | STAR MAP: remove (consolidated into Today) or keep-differentiated? | **Remove.** Two command decks = neither trusted. | S0 |
| **D-4** | F6 ID-first driver identity (fixes the ~2 phantom name-split identities): schedule or document-and-skip for handoff? | **Document-and-skip** unless a real mis-merge shows up — blast radius doesn't fit a finalize. | (none — backlog) |
| **D-5** | Deploy cadence: OK per session (S0…S7 each) as usual? | Per-session OK, S6 on a watched night. | all |
