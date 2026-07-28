# Build-188 — Full dashboard correctness audit

**Model/Effort:** Opus 5 · high
**Date:** 2026-07-28
**Method:** code review + read-only SQL against the live Bolt Supabase (`ltqpoupferwituusxwal`),
80 days of real history (17 May → 27 Jul 2026), 193 courier profiles, 17 ambassadors.
**Nothing was written to production data.**

---

## Findings, ranked

### 🔴 A1 — EGP→SAR rate is INVERTED. Live. Overstates incentive cost ~169×.

Settings holds `egpToSar: 13`. The field means **EGP → SAR**, and the code default is `0.077`
(1 SAR ≈ 13 EGP, so 1 EGP ≈ 0.077 SAR). **13 is the rate the other way round.**

```js
function incToSar(amount, currency) {
  return currency === 'EGP' ? Math.round(amount * egpToSarRate()) : amount;
}
```

Egypt-team referral = **500 EGP** per qualifying driver:

| | Per qualifying driver |
|---|---|
| Correct (0.077) | **39 SAR** |
| Current (13) | **6,500 SAR** |
| Over-stated by | **6,461 SAR each** |

**This is not theoretical.** 6 Egypt-team ambassadors are active, with **118 tagged drivers, 116
of whom have nationality set** — the gate that lets the incentive qualify.

Blast radius (it is a *company profit* line, not just a display):

```
egpToSar 13 → incToSar() → refs[].paidSar → totals.grandSar
            → S.incentivesOwed → S.dealNet = dealIn + dealOut − incentivesOwed
            → S.companyNet
```

So every qualifying Egypt referral subtracts **6,500 SAR** from stated company profit instead
of **39 SAR**. It also drives the Incentives tab's "Total owed", the Egypt SAR-equivalent stat,
and the Command Center ambassador rows.

The native EGP amount actually paid is unaffected — only every SAR-denominated view is wrong.

> ⚠️ The code comment at `computeExecMonth` still says this line is "0 until nationality data
> fills in". That is now **stale** — nationality is 116/118 for the Egypt team.

**Fix: change EGP → SAR rate in Settings from `13` to `0.077`.** One field. I did not change it
myself — it is your data and your call. See "Recommended code guard" below.

---

### 🟠 A2 — Per-driver bonus-split override is ignored on closed months. Latent.

In `computeExecMonth`, when a real Bolt invoice has been imported for a closed month:

```js
Object.values(imported).forEach(d => {
  const s = splitAfterOpCost(gross, monthKey, d.name);   // ← d.name is undefined
```

`khair_bolt_bonus` is shaped `{ month: { phone: { net, gross } } }` — the values carry **no
`name`**. So `d.name` is `undefined`, `companySplitPct` skips its per-driver branch, and the
month falls back to the global 50%.

Meanwhile the *in-progress* month path (`bonusForDriver(p.name, …)`) **does** pass the name.
So a driver with a custom split would be computed one way while the month is open and a
different way once the invoice lands — company profit would silently change at month close.

**Currently harmless: 0 of 193 profiles have `bonusSplitPct` set.** It bites the first time you
set one. Fix = resolve the driver from the phone key before splitting.

---

### 🟠 A3 — Changing "Monthly Target" silently desyncs the tier ladder from the money. Latent.

Two tier tables exist:

| | Source | Drives |
|---|---|---|
| `bonusTiers()` | `[monthlyTarget−2000, −1000, monthlyTarget]` | tier bands, colours, ladder, `bandOf`, `paceTier`, `computeRosterForMonth.TIERS` |
| `BOLT_BONUS_TIERS` | **hardcoded** 4000 / 5000 / 6000 | all real money — `bonusFor`, `boltTier`, `netTierBand` |

`monthlyTarget` is 6000 today, so they agree and everything is correct. Set it to 7000 and the
ladder shifts to 5k/6k/7k while payouts stay on 4k/5k/6k — and because the Today "tier slip"
warning compares `netTierBand` (money floors) against `d.band` (display floors), it would fire
spuriously for the whole fleet.

**Treat "Monthly Target" as a display-only aspiration; do not use it to model a tier change.**

---

### 🟡 A4 — Two ambassador names don't match the roster, so they split off as phantoms

| Ambassador string in data | In `ambassadors` table? | Drivers |
|---|---|---|
| `khaled met3b` | ❌ **typo of "Khaled Met3eb"** | 1 (sheet) |
| `lamiaa` | ❌ not present at all | 1 (sheet) |

Attribution keys on the lowercased ambassador string, so `khaled met3b` is a *separate*
ambassador from `khaled met3eb` — one of Met3eb's captains is filed under the misspelling.
This is a second, independent contributor to his numbers looking off.

`teamForReferrer` also returns `''` for both, so their team/currency is unresolved.

**Fix in the source sheet:** correct `khaled met3b` → `Khaled Met3eb`; decide what `lamiaa` is
and either add her to the AMBASSADORS tab (with a team) or correct the row.

---

### 🟡 A5 — The `aliases` column is written but never read

`sync-sheet.js` writes `aliases` into the `ambassadors` table ("omar el lord, omar ellord, عمر"
for Omar; "محمد الحفني" for Mohammad Hefny; …), but **nothing in the dashboard ever reads it**.
`teamForReferrer` matches on `name` only.

So any captain filed under an alias — including the Arabic spellings — becomes a phantom
ambassador with no team and its own filter row, exactly like A4. No live case detected today,
but the aliases exist precisely because people *do* write those variants.

---

### 🟡 A6 — A recycled phone merges three captains into one identity *(carried from Build-187)*

Phone `543775055` appears under **Saed Fares**, **ABDULRAHMAN ALSHAHRANI** and **Nawaf
AlBahwan** — **zero trips under all three** — yet it is the identity key of a real profile
tagged to Khaled Met3eb. The identity resolver unions anything sharing a phone, so those three
collapse into one identity for profile, ambassador and block lookups.

**Fix in source data:** clear/correct that phone. Nothing real is lost — 0 trips on it.

---

### 🟡 A7 — Phone coverage is degrading, and identity depends on phone *(carried from Build-187)*

Rows with no phone: **May 0% → Jun 9.7% → Jul 27.4%**. By source: cron **29.1%**, api 24.4%,
csv 13.4%, legacy 7.7%. The nightly cron is now the dominant ingest, so identity coverage gets
slightly worse every night. Nothing fails loudly — attribution just quietly degrades.

---

### 🟢 A8 — Vercel is at exactly the Hobby function cap

`api/` holds **12 `.js` files**; Hobby allows **12**. The 13th causes a *silent failed deploy*
(the repo already documents this in `sync-mhm-to-barbary.js`, which is a thin wrapper
specifically to avoid a 13th file). Not a bug — a tripwire to remember before adding any endpoint.

### 🟢 A9 — Dead op-cost code

`opCostForMonth()` and `loadOpCostSchedule()` still exist and `settings.opCost` is still stored
(850), but **nothing calls them** — the flat op-cost model was dropped on 2026-07-05 in favour
of a plain split %. No UI exposes them either, so no one can be misled. `splitAfterOpCost` is
now a misnomer and two comments describing "gross − op cost" are stale. Housekeeping only.

---

## What I verified as CORRECT

| Area | Verdict |
|---|---|
| Bolt invoice pagination (the exact-1000 truncation bug) | ✅ properly guarded — own pagination, stops on short page *and* reported total, `rosterComplete` flag |
| `boltTier` prorated invoice maths | ✅ `MAX(tierGross(net), tierGross(perDay×30) × min(days,30)/30)` — matches the documented June 2026 reconciliation |
| Company P&L formula | ✅ `income + acctRent + carRent + salary + fleetCut + other + bonusCost`; rent IN/OUT signs correct; `computeExecMonth` correctly **excludes** driver net from company revenue |
| Finance tab dropdowns | ✅ show no counts, so no count-vs-list mismatch (the Build-187 class) |
| Identity collisions | ✅ only 1 phone shared across names (A6); only 1 genuine same-day same-name collision fleet-wide (ABDULLAH ALOTAIBI, 194 SAR) |
| Bonus-split schedule / overrides | ✅ empty; global 50% resolves as intended |

---

## Recommended code guard (not yet applied — your call)

A1 was a single mistyped field that silently moved company profit. Worth making impossible:

```js
function egpToSarRate() {
  const r = loadSettings().egpToSar;
  // EGP is worth FAR less than SAR, so a rate ≥ 1 means someone typed SAR→EGP (e.g. 13).
  // Refuse it rather than silently inflating every Egypt incentive ~169×.
  if (typeof r === 'number' && r > 0 && r < 1) return r;
  return 0.077;
}
```
…plus a visible warning on the Settings row and the Incentives tab when the stored value is ≥ 1.

---

## Honest scope

**Audited against real data:** tier-bonus maths, company P&L formula, referral incentives,
identity/attribution, ambassador roster integrity, ingest quality, Barbary sync pagination,
the Vercel function cap, and a sweep of UI counts for the Build-187 mismatch class.

**Could NOT verify from here:** the roster/headcount snapshot (`boltFleetRosterSnapshot`) lives
in **browser localStorage only** and is never synced to the cloud, so the 213-vs-205 headcount
reconciliation cannot be checked without your browser. From history alone: 205 distinct names on
27 Jul, 216 across all history, 70 carrying a non-active Bolt state on the latest day.

**Not exercised:** auto-salary (0 of 193 profiles use it) and per-driver split overrides (0 of
193) — both code paths are unexercised, so A2 is latent rather than proven-wrong.
