# CALL LIST — make "Pending On" auto-follow the onboarding status (one clean rewire)

**Goal (what the user actually wants):** one status column in the CALL LIST that **self-updates from the driver's onboarding stage**, so a driver who's really on **Transfer Hold** / **Blocked** never sits in the calling pipeline as a stale "Transfer Requested." Sales sets "transfer / iqama received" → it routes to Bolt CS → if there's a debt it comes back **Transfer Hold** → the CALL LIST reflects it **by itself**, matching the DRIVERS tab.

**Do this as ONE careful pass, read-only-first, and DO NOT apply piecemeal** — "Pending On" (col H) feeds two other systems, so all three change together or the funnel breaks. If the sheet is rendering slowly, wait for it to be responsive; a half-applied rewire is worse than today. The operational safety net is already live (Live Status + red row + Amount Due), so there's no rush to fumble it.

> **⚠️ UPDATE (2026-07-07) — this MUST be a script, not a formula.** The user confirmed **sales manually type into "Pending On"** ("iqama received transfer", "iqama received block check", "refused", etc.) — those route the lead into the driver tab's **Block Check / Transfer Request** stages. So a plain formula in H would **erase what sales type.** Use the **"Script option"** at the bottom: an Apps Script (hourly + onEdit, joining the existing `bolt_ops_master.gs` automation — it lives only in the sheet's Apps Script editor, not this repo) that, for rows where the matched driver already has an onboarding stage, writes that stage into H, while leaving sales' pre-handoff values ("To Call", "refused") untouched. The funnel re-point (Step 3) + colour cleanup (Step 4) still apply. A script coexists with the existing triggers — no need to pause them.

## Why it's entangled (the thing that makes it "hard")
Column **H "Pending On"** is the data source for:
1. **The CALL FUNNEL box** — every stage count is `=COUNTIF($H$2:$H,"<label>")` (verified: `Not called`=`COUNTIF(H,"To Call")`, `Transfer requested`=`COUNTIF(H,"Transfer Requested")`).
2. **The row-colour rules** — conditional formats keyed on `$H2="Active - Done"`, `$H2="On Fleet"`, `$H2="Awaiting…"`, etc.

Change H's values without updating (1) and (2) and the funnel scrambles + colours break.

## The two phases (context — they are NOT the same thing)
- **"Pending On" (CALL LIST) = the SALES calling funnel**: `To Call → Reached → Considering → Agreed → Iqama received → Transfer requested → …`
- **"Driver Stage" (DRIVERS) = the ONBOARDING pipeline** that only begins after agreement. Canonical order (from `index.html` `PIPELINE_STAGES`, mirrors `Ops Automation/bolt_ops_master.gs` `STAGE_LIST`):
  `Fleet Check → Fleet Check - Verify → Block Check → Transfer Request → Transfer Hold → Docs Collection → Istimara Authorization → Submitted to Bolt → Notify Driver → Active | Blocked - Cannot Unblock | Closed - Blocked | Already exists in other fleet | Rejected`
  **Terminal** (`PIPELINE_TERMINAL`): `Active`, `Blocked - Cannot Unblock`, `Closed - Blocked`, `Already exists in other fleet`, `Rejected`.

A lead is "Agreed / Transfer-Requested" by **sales**, then progresses (or dies) in **onboarding**. The unified status = sales stages until the lead enters onboarding, then it follows the onboarding stage.

## STEP 0 — confirm before touching anything (read-only)
Read the funnel formulas `S2:S17` (or wherever the funnel lives now — it shifted to R:S) and note, for each label, which column it counts. Specifically: **do `Reached` / `Considering` / `Agreed` count from `H` (Pending On) or from `F` (Call Status) / `G` (Interest)?**
- If they count from **F/G** → H only holds outcome stages → overwriting H is clean.
- If they count from **H** → those sales judgments live in H and a plain formula would erase them → either preserve them (see "Script option") or get the user's OK to drop them.

Also note: column H has a **dropdown (data validation)** — it must be removed from H before a formula goes in, or every auto value shows an "invalid" warning.

## STEP 1 — the mapping (CONFIRM/tweak with the user)
Onboarding Driver Stage → what "Pending On" shows (and its funnel bucket). Proposed default:

| Driver Stage (onboarding) | "Pending On" shows | In the funnel |
|---|---|---|
| *(none yet — lead still being called)* | keep the sales stage (`To Call`, etc.) | unchanged |
| Fleet Check / Fleet Check - Verify / Block Check | `In onboarding` | new bucket **or** fold into `Iqama received` |
| Transfer Request | `Transfer requested` | existing |
| **Transfer Hold** | **`Transfer Hold`** | **new funnel row** (so held-for-debt is visible + counted) |
| Docs Collection / Istimara Authorization | `Docs / Istimara` | new bucket **or** `Iqama received` |
| Submitted to Bolt / Notify Driver | `Almost active` | new bucket **or** `On fleet` |
| **Active** | **`Converted`** | existing |
| **Blocked - Cannot Unblock / Closed - Blocked / Already exists / Rejected** | **`Dropped`** | existing |

Net effect the user cares about: **Aldawsari → `Dropped`** (out of the calling pipeline), **Osama → `Transfer Hold`** (visible + Amount Due 149). No more stale "Transfer Requested."

## STEP 2 — overwrite "Pending On" (col H)
1. Remove the data-validation dropdown from `H2:H` (Data ▸ Data validation ▸ remove).
2. Clear `H2:H` (leave header `H1`).
3. In **H2**, one ARRAYFORMULA. The live onboarding stage per row is already in the **hidden Driver-Stage engine column** (currently **Q** — `=ARRAYFORMULA(IF($I$2:$I="","",IFERROR(VLOOKUP($I$2:$I,DRIVERS!$C:$H,6,0),"")))`). Map it:
   ```
   =ARRAYFORMULA(IF(C2:C="","",
     IF(Q2:Q="","To Call",
     IFS(
       REGEXMATCH(Q2:Q,"Active"),"Converted",
       REGEXMATCH(Q2:Q,"Blocked|Rejected|Closed|Already exists"),"Dropped",
       REGEXMATCH(Q2:Q,"Transfer Hold"),"Transfer Hold",
       REGEXMATCH(Q2:Q,"Transfer Request"),"Transfer requested",
       REGEXMATCH(Q2:Q,"Docs|Istimara"),"Docs / Istimara",
       REGEXMATCH(Q2:Q,"Submitted|Notify"),"Almost active",
       REGEXMATCH(Q2:Q,"Fleet Check|Block Check"),"In onboarding",
       TRUE,Q2:Q))))
   ```
   ⚠️ `Active` is matched FIRST because "Blocked" etc. must not swallow it; order matters. Confirm the exact stage spellings against the sheet.
   ⚠️ This makes H auto for every row with an onboarding stage and `To Call` for the rest — it **replaces** any manual sales stages in H. Only do this if STEP 0 showed those live in F/G (or the user accepts losing them).

## STEP 3 — re-point the funnel
For every CALL-FUNNEL count cell, change the `COUNTIF($H$2:$H,"…")` text to the new value from the mapping (e.g. `Transfer requested` still works; add a **`Transfer Hold`** row; point `Converted`/`Dropped` at the new outputs; add `In onboarding` / `Docs / Istimara` / `Almost active` rows or fold them per the user's choice). Verify `Total contacts ≈ sum of stages` afterward.

## STEP 4 — fix the colour rules
The conditional-format rules keyed on `$H2="Active - Done"` / `"On Fleet"` / `"Awaiting…"` now reference values H no longer produces. Update each to the new vocabulary (or delete the dead ones). Keep the top rule `=REGEXMATCH($L2,"Cannot Unblock|Hold")` → red.

## STEP 5 — verify (paste real evidence)
- Aldawsari (phone `966570017259`) → Pending On now `Dropped`, row red.
- Osama (`966506645435`) → Pending On `Transfer Hold`, Amount Due `149`.
- A fresh un-onboarded lead → Pending On `To Call`.
- Funnel totals reconcile; no `#REF!`/`#N/A`; no array-spill blocker (check the whole column height).

## Script option (only if STEP 0 shows sales manage H by hand)
If Reached/Considering/Agreed genuinely live in H and must be preserved, DON'T overwrite H with a formula. Instead add an `onEdit`/hourly Apps Script that writes ONLY the terminal/hold outcomes into H (Active→Converted, Blocked→Dropped, Transfer Hold→Transfer Hold), leaving sales' manual stages untouched. Costs: one more moving part to hand off — weigh against the formula approach.

---
**Context for whoever runs this:** the operational problem (team chasing dead leads) is ALREADY solved by the live **Live Status** (col L), **What to do** (M), **Amount Due** (N), and the red row-highlight. This spec is about making the *pipeline column itself* self-consistent so there's a single status that always matches DRIVERS. Related: `BOLT_SHEET_QA_AUDIT_PROMPT.md`, and the memory note `bolt-calllist-status-sync`.
