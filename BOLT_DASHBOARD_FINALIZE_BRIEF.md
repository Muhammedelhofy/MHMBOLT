# Bolt Dashboard + Google Sheet — FINALIZE BRIEF
**Date:** 2026-07-06 · **Purpose:** close out the Bolt fleet dashboard + the Google-Sheet automation
so Muhammad never has to return to them before leaving the job (~Jul 2026). One coherent redesign +
data-integrity pass, not a pile of separate tweaks.

**Read alongside:** `BOLT_ARCHITECTURE_REVIEW_2026-07-04.md` (structure map + ranked backlog C1-C8, the
3 crons, the Supabase schema, the SPEC 1/2/3) and `BOLT_FINANCE_V2_BRIEFING.md`.

---

## ★ BUSINESS MODEL — the lens for EVERYTHING
The operation is a **funnel to get drivers across the Bolt bonus tiers (4k / 5k / 6k SAR net)** — the
**bonus is the company's money; the driver's net is the DRIVER's money** (Muhammad doesn't take it).
- **Saudi drivers:** onboard → push to the net threshold → company takes the bonus.
- **Foreigners:** must be **UNBLOCKED first** (they drive on a Saudi's account), then pushed to threshold → bonus.
- The **Google Sheet automation** exists to make this funnel easier for the team (Omar qualifies leads,
  Khaled unblocks/transfers → active).
- **So every view is a BONUS-TIER + FUNNEL lens** — tier attainment, pipeline health, unblock queue,
  ambassador performance — NOT raw driver earnings.

## ★ THE DASHBOARD MUST BE A TRUE MIRROR OF BOLT — with better views on top
Known gap: dashboard shows **87 drivers, Bolt's portal shows 97.** Accuracy is the foundation; a pretty
redesign on untrustworthy data is worthless. **Backbone before beauty.**

---

## CROSS-CUTTING THREADS (apply to ALL tabs)
- **A · Mirror accuracy** — reconcile the 87-vs-97 fleet count; account for every excluded row; the whole
  dashboard reconciles with Bolt.
- **B · Filters / sort / dates** — ONE shared, consistent filter+sort component across all tabs; proper
  dropdowns; select one OR many months/days; ★ **year-proof** (the hardcoded month chips break at 2027);
  filters must propagate into detail panels.
- **C · Driver detail panel** — build ONE reusable "click a driver anywhere → detail panel" (phone, block
  status, stage, tier progress, chase action). Reuse across STAR MAP / Onboarding / Analytics / Blocks /
  Ambassadors / Captains / Data-Health.
- **D · Data-integrity / QA verify pass** — prove, don't assume: fleet count, "orders" are really trips +
  counts align with Bolt, every filter yields correct numbers, Incentives ↔ Finance P&L agree, Blocks
  synced, sheet→dashboard flow works.
- **E · STRUCTURE + DATA-PIPELINE INTEGRITY (his #1 concern)** — verify the sheet→dashboard flow end to
  end (a sheet edit reaches the dashboard); **Bolt API check** (oidc.bolt.eu token + node.bolt.eu gateway
  pull correctly + completely — the 87-vs-97 likely lives here); **structure stability** (arch-review C1
  `fleet_data` dual-writer concurrency + the 15,376-line monolith). Make the backbone trustworthy for handoff.

## ★ DESIGN LANGUAGE (the unifying redesign)
Current look = "generic AI dashboard, no creativity, no soul." Every tab forever-scrolls, shows vanity
metrics, and nothing is clickable. Target: a **crafted, characterful, sci-fi-with-taste** design language
that is **simple, not cluttered** — applied consistently to every tab. Organize with headers/sections/tags
(top-level first, drill on click), kill vanity metrics, make everything actionable.
- **Remove** the embedded M8 orb + holo/radar/warp/cortex/biometric FX (arch-review C6) — it's redundant
  with the separate M8 product AND it's the exact AI-cliché to kill.
- **Arabic toggle** (new) — EN/AR switch; high handoff value (Arabic-speaking team).
- **Light theme** is bad ("feels so white," bad font/colours) — fix properly or drop (dark primary).
- **Alerts** — consistent placement (the Today/command deck + inline per tab).

---

## PER-TAB ISSUES

### #1 · STAR MAP → a real command bridge (NOTE: Today already ≈ this — consolidate, don't rebuild)
Remove GALAXY + SOLAR sub-tabs (useless). The COMMAND view is currently a re-skinned Captains list that
scrolls forever — replace with a high-level, sci-fi STATISTICS deck framed on **bonus-tier attainment**
(how many drivers at/near 6k/5k/4k, who's in each), **top ambassadors/sales**, an **onboarding/pending
brief**, and an **ALERTS layer** ("what needs my attention now" — stuck onboarding, about to hit/miss a
tier, new blocks, idle drivers, ambassadors slipping). Click a panel → drill in. Compact, no forever-scroll.
★ **Overlaps TODAY heavily** (#11) — consolidate or clearly differentiate (Today = daily CSV snapshot,
STAR MAP = live command); don't keep two competing command views.

### #3 · ONBOARDING → organize + clickable + verify the sheet link
Content OK; presentation fails. Add headers/tags/sections (click → see just that). ★ Make it CLICKABLE:
click a stage → who's stuck WHERE → push the team (Khaled / Bolt-CS queues). The "Weekly Flow" chart is
unreadable — make it legible or rethink (leads-in → activated over time). ★ Verify + strengthen the
Google-Sheet link so onboarding statuses are trustworthy + clickable through to the real drivers.

### #4 · ANALYTICS → richer analysis + real driver click-through
Better than onboarding (some cards clickable) but same look. Make it the RICH performance/analysis tab —
deep insight, no noise. ★ Click a driver → the shared detail panel (phone, block, stage) so idle/slow
drivers are actually chase-able, not just names. Push analysis further: tier movement, who's pushable,
ambassador performance, cohort ramp, idle recovery.

### #5 · BLOCKS → an unblock WORKLIST (funnel-critical)
Foreigners must be unblocked to earn → bonus, so this is a worklist, not a stats page. Match/beat Bolt's
own suspensions panel (per-driver: current/past, category, the SPECIFIC reason, dates). Kill the vanity
metric ("516 days suspended"). Surface the REAL reason (not truncated/generic). Confirm it's synced with
Bolt. Add a **push-to-team** action so "25 blocked" becomes a workable unblock queue.

### #6 · INCENTIVES → cards + filters + totals + ★ EXCEPTIONS
Break the one big block into **clickable cards per ambassador/sales** (drill into who brought whom). Add
filters + sort + **calculation totals**. ★ **Confirm alignment with Finance P&L** (incentive owed here =
what P&L subtracts). ★ **NEW: exceptions/overrides** — adjust a specific ambassador/sales (extra bonus,
custom amount, waive/change the rule), recorded + auditable, on top of the auto formula.

### #7 · AMBASSADORS → organize + per-ambassador actionable drill-down
It's one block — organize + fix the look. Click an ambassador → their drivers + info so an ambassador can
check/act on their OWN drivers (per-ambassador roll-up, reuse the detail panel; possibly a scoped view an
ambassador self-manages).

### #8 · FINANCE → clarify purpose, bonus-PROJECTION focus, readability (money = doctrine-sensitive)
Muhammad is "completely lost" — Executive tab may DUPLICATE others. Clarify each sub-view's purpose; cut/
merge redundancy. ★ Center finance on the **bonus PROJECTION** driven by driver net performance (how much
COMPANY bonus we're on course to earn). Make the Bolt-bonus-sheet upload flow obvious (closed months →
Bolt's real invoice — the finance-v2 work). Fix the contradictory tier labels ("No drivers hit a tier"
while listing "6,000 tier"): make tier status unambiguous (achieved vs target vs projected).
- **#8b · Dead business model:** rent/salary/fleet-cut are GONE (drivers use own cars now; only "own car"
  model remains). Prune the dead columns (By Captain's ACCT RENT / CAR RENT / SALARY / FLEET CUT are empty),
  remove/merge the trivial By Model tab, question Cycle Reconciliation, KEEP Transfer Log. ★ **CONSOLIDATE
  the finance sub-tabs** to current reality (own-car model + bonus tiers + editable split %). ⚠️ DECISION:
  is rent/salary gone for good (delete) or dormant (hide but keep)? — Muhammad confirms.

### #9 · CAPTAINS (his favorite — polish, don't rebuild)
★ Retag to CURRENT reality: kill the legacy letters (MODEL `S/F/R`, REF `N/M/Y/H`) → **ambassador-name
tags** (meaningful, not noise). "Orders done" is MISLABELED — those are TRIPS; fix the label + verify the
count aligns with Bolt (Build-128 renamed Trips→Orders dashboard-wide — revisit). Filter must reach the
detail panel (pick a month → the driver window shows THAT period). Verify all filter views match.
- **#9c · Remove the RADAR sub-view** (useless). Re-justify BY DAY / COMPARE DAYS, keep only if earned.

### #10 · Remove the embedded M8 orb + FX (see Design Language). Recommend REMOVE.

### #11 · TODAY (strongest tab) → make it the daily ACTION cockpit
Best-designed tab (alerts, 5 domain cards each OPEN→, tier moves, "easy tier wins worth +7,875"). ★ It's
already the command view done right → resolves #1 (consolidate STAR MAP into this or differentiate). Turn
it into a prioritized daily ACTION cockpit ("do these 3 today" ranked by SAR: push these to a tier,
unblock these foreigners, chase these idle earners). Add daily follow-ups: onboarding stuck-past-SLA +
foreigners-awaiting-unblock; performance pace-collapse/acceptance-drop + new-idle-today + one-push-from-a-
tier; ambassador attention; money momentum vs last month. ★ Fix data freshness (shows 2-day-old CSV).

### #12 · SETTINGS → prune unused + make Data Health INTERACTIVE
Audit for unused options (op-cost dated-change, bonus upload, referrer config, EGP→SAR rate, perf flags,
diagnostics) — prune. ★ Data Health lists issues (duplicate phones, tagged-not-on-Bolt, missing
nationality, no-ambassador, missing-team, fleet-check-verify) but they're NOT clickable — make each issue
CLICKABLE → the affected drivers → act/fix (feeds the detail panel + ambassador worklists).

---

## WORKSTREAM SPLIT
1. **DASHBOARD finalize** — Fable does the design language + the structure/data-integrity architecture
   (the hard judgment); Opus executes tab-by-tab against Fable's spec. Covers #1-#12 + A-E + Arabic +
   light-theme + remove RADAR/M8-orb.
2. **GOOGLE SHEET finalize** — Opus·high, SEPARATE session, coordinated via the shared data contract
   (sheet columns the dashboard reads). Audit the Apps Script; map + smooth the Form → CALL LIST →
   DRIVERS → sync funnel; clean the stale sheet refs; handoff-proof it. Nationality auto-sync already shipped.
   - ✅ **Live master sheet = `17-GCTaqEiCvCrcCrDvBm9DcCtljPcAJ3RpJTBkAJs0s`** (Bolt_Activation_Master —
     matches sync-sheet.js + Form MASTER_ID).
   - ⚠️ **CORRECTION (2026-07-06, verified against live Drive by the sheet-finalize session): DO NOT
     REPOINT/clean `1leCVYn…` or `1toHLYi…`.** They are NOT stale copies — they are **live, separate Bolt-
     owned exchange sheets**: `1toHLYi…` = "Bolt support VIP" (Bolt BLOCK team; `syncBlockSheet`, 10-min),
     `1leCVYn…` = "شيت الاستعلام" (Bolt CS team; `syncCSSheet`, 10-min). The automation reads/writes them to
     run the block + transfer funnel. Repointing them to the master would DESTROY the Block/CS funnel. My
     earlier "stale → clean" note was WRONG. See `BOLT_SHEET_FINALIZE_REPORT.md` + the ⚠ DO-NOT-REPOINT
     banner now in the code. The sheet finalize is DONE (comments/docs only, zero column/function changes).

**Sequence:** Fable dashboard-design ∥ Opus sheet-finalize (parallel now — use the Fable window); then
Opus dashboard-execution on a verified-clean sheet.

## GUARDRAILS (both workstreams)
Read-only audit before changes; the live core (nightly crons + Bolt sync) is HANDS-OFF — map, never break.
Own worktree off origin/main; git add own files. STOP before merge — Muhammad's explicit deploy-OK (main
auto-deploys prod). Verify-before-claiming: prove every fix with real output; never claim done pre-verify.
Do NOT touch the nested M8 repo. Preview-first for risky infra changes.
