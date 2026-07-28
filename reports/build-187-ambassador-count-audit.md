# Build-187 — Ambassador filter count fix + identity/attribution audit

**Model/Effort:** Opus 5 · high
**Date:** 2026-07-28
**Trigger:** "Khaled Met3eb" showed **8** in the ambassador filter but the table listed **10**.
**Files touched:** `index.html` (`captainsAmbOptions`)
**State:** fixed + reproduced + verified locally. **NOT committed, NOT deployed.**

---

## 1. The reported bug — FIXED

### Root cause

The count next to an ambassador and the list it filters were built from **two different
populations**:

| | Dropdown count (`captainsAmbOptions`) | Table list (`buildCourierSummaryTable`) |
|---|---|---|
| Keyed by | `courierIdentityKey(d)` (phone/uuid, union-find) | **raw `d.name` string** |
| Population | only captains with rows in the selected days | those rows **plus** every captain who has a courier profile but no rows in those days |

So a captain of that ambassador who simply did not work in the selected period — or whose
identity got unioned with another captain's — was **listed but never counted**.

### Reproduced exactly

Built a synthetic fleet matching the real shape (8 phone-keyed captains with rows this month,
2 name-keyed profiles with none):

```
tableRowsListed: 10 · countBeforeFix: 8 · countAfterFix: 10
```

That is your 8-vs-10, reproduced and then closed.

### The fix

`captainsAmbOptions` now counts over the **table's own population** — same raw-name keying,
same profile-only inclusion — so the two agree by construction rather than by two definitions
being kept in sync by hand.

### Verified

Three ambassadors, mixed worked/idle captains, untagged captains, and a captain with no profile:

| Ambassador | Menu says | Table lists | Agrees |
|---|---|---|---|
| Khaled Met3eb | 5 | 5 | ✅ |
| Sara Amb | 3 | 3 | ✅ |
| Third Amb | 1 | 1 | ✅ |
| **Multi-select (Met3eb + Sara)** | 8 | 8 | ✅ |

Untagged captains accounted for separately; unfiltered table unchanged; no console errors.

---

## 2. Audit findings on the REAL data

Read-only SQL against the live Bolt Supabase (`fleet_data`, 80 days, 17 May → 27 Jul 2026).

### 🔴 F1 — A recycled phone merges three captains into one identity

Phone `543775055` appears in history under **three different names**:

| Name | First seen | Last seen | Day rows | Net | Trips |
|---|---|---|---|---|---|
| Saed Fares | 2026-05-17 | 2026-06-01 | 9 | 0 | **0** |
| ABDULRAHMAN ALSHAHRANI | 2026-07-01 | 2026-07-21 | 18 | 500 | **0** |
| Nawaf AlBahwan | 2026-07-27 | 2026-07-27 | 1 | 0 | **0** |

Zero trips under all three — it behaves like a placeholder/recycled number, not a working
captain. But it is also the identity key of a **real courier profile**
(`ph:543775055` → "ABDULRAHMAN ALSHAHRANI", ambassador **Khaled Met3eb**).

Because the identity resolver unions any rows sharing a phone, those three captains collapse
into **one identity**. That is what dragged Met3eb's old count down to 8, and it means
ambassador attribution, cost profile and block state can be read against the wrong captain.

**Fix is in the source data, not the code:** correct or clear that phone for the affected
captains in Bolt / the onboarding sheet. All three currently show 0 trips against it, so
nothing real is lost.

### 🔴 F2 — Phone coverage is DEGRADING, and identity depends on phone

Rows with no phone at all, by month: **May 0% → Jun 9.7% → Jul 27.4%**.

By ingest source:

| Source | Days | Driver rows | No phone | % |
|---|---|---|---|---|
| **cron** | 20 | 3,703 | 1,079 | **29.1%** |
| api | 2 | 315 | 77 | 24.4% |
| csv | 5 | 389 | 52 | 13.4% |
| (legacy) | 53 | 1,529 | 118 | 7.7% |

The Bolt API paths drop phone for ~a quarter to a third of rows, and the nightly cron is now
the dominant source. Since ambassador attribution, block matching and profile lookup are all
phone-keyed, **identity coverage gets worse every night the cron runs**. This is the one to
watch: it silently widens over time rather than failing loudly.

### 🟠 F3 — The Captains table merges by raw name; everything else keys by identity

26 exact name spellings carry 2–3 different phones, and the table sums them into **one row**:

| Name | Phones | Net summed into one row |
|---|---|---|
| Saed Fares | 3 | 15,751 |
| Abdulaziz Alhumaymidi | 2 | 14,702 |
| ABDULRAHMAN ALSHAHRANI | 3 | 8,759 |
| Ibrahim Alshilash | 2 | 5,065 |

**Checked before concluding:** for 25 of the 26 the phones are *sequential*, not overlapping —
consistent with a phone change or a car handed over, where merging is arguably right. Only
**ABDULLAH ALOTAIBI** has two phones active on the *same day* (2 days, 194 SAR) — a genuine
same-name collision being merged into one row.

So this is mostly benign today, but it is the same split-brain that produced the count bug:
one layer thinks in names, the other in identities.

### 🟢 F4 — Only one phone is shared across names

Across all 242 phones in history, exactly one (`543775055`, F1) is used by more than one name.
The identity layer is otherwise clean on that axis.

---

## 3. Honest scope of this audit

**Covered:** the identity/attribution layer (names ↔ phones ↔ profiles ↔ ambassadors), the
count-vs-list class of bug, and ingest phone coverage — all against real production data.

**NOT covered yet** — say the word and I'll take these next:

1. Tier-bonus maths end to end (`bonusFor` / `splitAfterOpCost` / op-cost schedule) vs Bolt's actual invoices
2. Company P&L (rent, salary, fleet cut, auto-salary) — the Finance tab's money
3. The referral-incentive calc (Egypt EGP vs Saudi SAR, overrides)
4. Roster/headcount reconciliation (the 213-vs-205 class)
5. The Barbary two-way sync
6. Whether any OTHER count/badge in the UI is computed off a different population than the list it labels — F1's pattern suggests checking them all
