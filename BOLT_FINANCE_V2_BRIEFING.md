# Bolt Finance v2 — Build Briefing

**Status:** Design LOCKED, file analyzed, ready to build.
**Date:** 2026-05-20
**Owner:** Muhammad El-Hofy
**Target file:** `C:\Users\m7ofy\OneDrive\Documents\Claude\Projects\Bolt\index.html.html`

---

## How to use this brief

Open a fresh Cowork chat. Paste this prompt:

> Read `BOLT_FINANCE_V2_BRIEFING.md` in my workspace folder, then read `index.html.html`, then build Bolt Finance v2 exactly as specified. Deliver the complete updated file — no patches, no diffs. Verify with sample-data walkthrough before declaring done.

That's it. Everything below is reference for the build.

---

## 1. What this build replaces

The current `index.html.html` Finance tab is **non-functional**:
- HTML/CSS for Finance tab exists (lines 322–608)
- But the JS functions it calls (`renderFinanceTab`, `openCarRentalModal`, `saveCarRental`, `openSalaryModal`, `saveSalary`, `exportFinanceCSV`, `exportFinanceReport`) **do not exist** anywhere in the file
- Additionally: **file is structurally broken** — ends abruptly at line 2321 mid-function, no closing `</script></body></html>`

The build replaces all of that with a working Finance v2 system.

---

## 2. Locked Design

### 2.1 The 5 Models (dropdown + Custom option)
- **A** — Foreigner rents everything (account + car from fleet)
- **B** — Foreigner brings own car (rents account from fleet)
- **C** — Salaried (fleet operates everything)
- **D** — Saudi drives himself (own account, own car)
- **E** — Foreigner with own Saudi account (near-D, different bonus structure)
- **Custom…** — escape hatch (user types model name)

### 2.2 Courier Profile (per driver, edit-once, monthly override)

Stored in `localStorage` under `khair_courier_profiles` keyed by driver name (lowercased, trimmed).

```js
{
  "ahmed mohammed": {
    model: "A",
    modelCustom: null,             // only if model === "Custom"
    accountRent: { dir: "IN" | "OUT" | "NONE", amount: 500 },
    carRent:     { dir: "IN" | "OUT" | "NONE", amount: 2000 },
    salary:      0,                // OUT only, 0 = none
    fleetCut:    { type: "NONE" | "FLAT" | "PCT", value: 0 },
    other:       { label: "", dir: "IN" | "OUT" | "NONE", amount: 0 },
    notes:       ""
  }
}
```

### 2.3 Monthly Override

Stored under `khair_courier_overrides` keyed by `${driverNameKey}::${YYYY-MM}`.

Same shape as profile. Blank fields = fall back to profile defaults.

```js
{
  "ahmed mohammed::2026-05": {
    carRent: { dir: "IN", amount: 1500 }   // override only this field this month
  }
}
```

### 2.4 Cycle Reconciliation

Bolt pays twice weekly:
- **Sunday transfer** → covers Wed + Thu + Fri + Sat earnings
- **Wednesday transfer** → covers Sun + Mon + Tue earnings

Stored under `khair_cycle_receipts` keyed by cycle ID (`YYYY-MM-DD` of transfer day).

```js
{
  "2026-05-20": {                    // Wed transfer
    transferDate: "2026-05-20",
    cycleStart: "2026-05-17",        // Sun
    cycleEnd:   "2026-05-19",        // Tue
    totalReceived: 1450.50,          // lump-sum from bank
    perDriverActual: {               // optional manual split if user knows
      "ahmed mohammed": 600,
      "khaled saleh": 850.50
    },
    confirmed: true,                 // user confirmed the transfer
    confirmedAt: "2026-05-20T14:30:00Z",
    notes: ""
  }
}
```

### 2.5 Per-Driver Status Flags (computed, not stored)

For a given cycle window, compare expected (sum of CSV "Net earnings" for driver across cycle days) vs actual (perDriverActual if provided, else 0 / unknown):

- 🟢 **FULL** — actual ≥ expected (full payment)
- 🟡 **PARTIAL** — 0 < actual < expected
- 🟡 **PENDING** — actual = 0 AND expected > 0 AND cycle not yet confirmed
- 🔴 **REVERSED** — actual < 0
- 🔴 **NOT_PAID** — cycle confirmed, expected > 0, actual = 0 (likely IBAN error)
- ➖ **NONE** — expected = 0 (driver didn't earn this cycle)

### 2.6 P&L Formula (per courier, per period)

```
Net P&L (courier, period) =
    + Bolt net earnings (from CSV, summed across period)
    + Account rent IN (effective amount × months in period)
    − Account rent OUT (effective amount × months in period)
    + Car rent IN
    − Car rent OUT
    − Salary OUT
    − Fleet cut       // if type=FLAT: value; if type=PCT: value% × net earnings
    ± Other           // sign depends on dir
```

**Effective amount** = override if exists for that month, else profile.

### 2.7 Model P&L Roll-up

Group all couriers by `profile.model` (or modelCustom). For each model:
- Driver count
- Total Bolt net earnings (income)
- Total cost (sum of all OUT items + fleet cut)
- Total inflow (sum of all IN items)
- Total Net P&L
- Avg Net P&L per driver per month

---

## 3. UI Layout

The Finance tab is reorganized into **5 sections**, in this order:

### Section 1 — Period Selector (top, sticky)
- Month picker (defaults to current month)
- Cycle picker (defaults to most recent confirmed cycle, or empty)
- View toggle: `By Courier` | `By Model` | `Cycle Reconciliation`

### Section 2 — Per-Courier P&L Table (default view)
Columns:
| Driver | Model | Net Earnings | Acct Rent | Car Rent | Salary | Fleet Cut | Other | Net P&L | Actions |
- Sortable by any column (default: Net P&L desc)
- Totals row at the bottom
- "Edit Profile" + "Set Override" buttons in Actions
- Color: Net P&L red if negative, green if positive

### Section 3 — Model P&L Roll-up
Columns:
| Model | # Drivers | Total Income | Total Costs | Total Net P&L | Avg/Driver/Month |
- One row per model present in profiles
- "Custom" models grouped by their custom label

### Section 4 — Cycle Reconciliation
For the selected cycle:
- Header: Transfer date, cycle window, lump-sum amount, confirmed status
- Per-driver breakdown table: Driver | Expected | Actual | Variance | Status Flag
- "Enter Cycle Receipt" button → opens cycle entry modal
- "Confirm Cycle" toggle → marks confirmed, triggers status flag computation

### Section 5 — Bolt Bonuses
**Keep as currently designed.** Display campaign earnings from CSV, our share = ÷ 2 (per existing logic).

---

## 4. Modals to Build

### 4.1 Courier Profile Modal
Fields: Driver (read-only, from selected row), Model (dropdown), Account Rent (direction + amount), Car Rent (direction + amount), Salary, Fleet Cut (type + value), Other (label + direction + amount), Notes.

### 4.2 Monthly Override Modal
Same fields as Profile but each row has a "Use profile default" checkbox. Only checked overrides save.

### 4.3 Cycle Receipt Modal
Fields: Transfer date (date picker, defaults to today), Total received (number), optional per-driver split table (auto-populated with cycle drivers, user fills in actuals if known).

**Remove** the current Car Rental modal and Salary modal — they're replaced by the Courier Profile modal.

---

## 5. JS Architecture

### 5.1 New state vars (add near top of `<script>`)
```js
const COURIER_PROFILES_KEY = 'khair_courier_profiles';
const COURIER_OVERRIDES_KEY = 'khair_courier_overrides';
const CYCLE_RECEIPTS_KEY    = 'khair_cycle_receipts';

let financeViewMode = 'courier';   // 'courier' | 'model' | 'cycle'
let financeMonth    = '';          // 'YYYY-MM'
let financeCycle    = '';          // 'YYYY-MM-DD' (transfer date)
```

### 5.2 New functions
```
loadCourierProfiles() / saveCourierProfiles(obj)
getCourierProfile(driverName)
upsertCourierProfile(driverName, profile)

loadOverrides() / saveOverrides(obj)
getOverride(driverName, monthKey)
upsertOverride(driverName, monthKey, overrideFields)
getEffectiveProfile(driverName, monthKey)    // profile + override merged

loadCycleReceipts() / saveCycleReceipts(obj)
getCycleReceipt(transferDate)
upsertCycleReceipt(receipt)
deriveCycleWindow(transferDate)              // returns {start, end} for Sun/Wed

computeDriverNetForPeriod(driverName, monthKey)
computeDriverPnL(driverName, monthKey)        // returns {income, costs, breakdown, netPnL}
computeModelRollup(monthKey)                  // returns {modelName: {count, totals...}}
computeCycleReconciliation(transferDate)      // returns per-driver status

renderFinanceTab()                            // top-level orchestrator
renderFinanceCourierView()
renderFinanceModelView()
renderFinanceCycleView()

openCourierProfileModal(driverName)
saveCourierProfileFromModal()
openOverrideModal(driverName, monthKey)
saveOverrideFromModal()
openCycleReceiptModal(transferDate)
saveCycleReceiptFromModal()

exportFinanceCSV()                            // courier P&L + model rollup + cycle history
exportFinanceReport()                         // printable HTML report → window.print()
```

---

## 6. CSS — what's already there

Lines 322–380 of the current file have most of what we need:
- `.finance-section`, `.finance-table`, `.finance-kpi-row`, `.status-badge`
- Modal styles: `.fin-modal-overlay`, `.fin-modal`, `.fin-form-row`
- Direction toggle: `.fin-direction-btn` (with `active-pay` / `active-receive` variants)
- P&L table styles: `.pl-table`

**Add only what's missing:**
- View mode toggle buttons (3-way segmented control)
- Status flag colors for NOT_PAID and REVERSED rows
- Period selector layout

---

## 7. Critical fixes

1. **Add closing tags** at end of file: `}` (close any open function), then `</script></body></html>`
2. **Wire `renderFinanceTab()` into `showTab()`** — already called at line 765, just needs the function to exist
3. **Don't break** existing tabs (Fleet, Summary, Daily, History, Settings) — only modify Finance HTML panel (lines 481–608) and add new JS

---

## 8. Verification (Task #9 — before declaring done)

Before saying it's shipped, walk through with sample data:

1. Create 3 test couriers in profiles:
   - **Ali** (Model A) — Account rent IN 500, Car rent IN 2000, no salary, no fleet cut
   - **Khaled** (Model C) — Account rent OUT 1000, Car rent NONE, Salary OUT 3000, no fleet cut
   - **Saleh** (Model D) — Account rent NONE, Car rent NONE, Fleet cut FLAT 500
2. Each has Bolt net earnings of 4000 for the month
3. Expected per-courier P&L:
   - Ali: 4000 + 500 + 2000 = **+6500** profit
   - Khaled: 4000 − 1000 − 3000 = **0** breakeven
   - Saleh: 4000 − 500 = **+3500** profit
4. Expected model rollup totals match driver sums
5. Cycle reconciliation: enter cycle receipt of 11500 total → driver split → all FULL
6. Test reversal: set Khaled actual = −500 → flag REVERSED
7. Test IBAN error: set Saleh actual = 0, confirm cycle → flag NOT_PAID

---

## 9. Tier Logic — DEFERRED (open in a separate chat)

Old memory claims:
- Tier 1: net 4k → fleet takes 1k (25%)
- Tier 2: net 5k → fleet takes 1.5k (30%)
- Tier 3: net 6k → fleet takes 2k (33%)

**Muhammad does not trust this logic.** It might be outdated or wrong. To revisit:
- Is this per-week, per-month, or per-trip-count?
- Does it apply to all models or only Model D?
- Is the cut amount fixed at threshold, or a % that scales?

**For this build:** the "Fleet cut" field on the Courier Profile handles tier-style cuts generically (none / flat / %). When the real rule is clarified, it can be encoded into the field's calculation. No code change needed beyond that.

---

## 10. Delivery Rules

- **Single full file** delivered to `C:\Users\m7ofy\OneDrive\Documents\Claude\Projects\Bolt\index.html.html` — no patches, no partial diffs (Muhammad is non-engineer)
- **Provide computer:// link** so Muhammad can open it directly
- **Don't break existing tabs** — only touch Finance section + add new JS at end + fix closing tags
- **Test in head:** before delivering, mentally walk through opening the file → clicking Finance tab → seeing P&L → adding a courier profile → entering a cycle receipt → verifying status flags

---

## 11. Project context (memory references)

- `project_bolt_fleet.md` — full Bolt fleet operational context (tiers, vehicles, blocks, payment cycles, nationality rules)
- `project_bolt_finance_v2.md` — this design in memory form

Saudi delivery fleet context: foreigner drivers operate under Saudi-held Bolt accounts (nationality requirement). Payment reversals are a known operational pain point. Reconciliation is the core problem this build solves.
