# Build-176 — Stored-history collision audit (READ-ONLY)

**Status:** tool shipped + verified · **no data was rewritten** · a live run against the
real `khair_history` must be done on a device where the dashboard has the full history
loaded (see "How to run it live" below).

## What this audit answers

S1/S2 fixed identity going *forward*. This audit looks *backward*: before Build-176,
`mergeDayEntries` keyed a day's merge by **lowercase name**, so on any day where the two
"Mohammed Alsubaie" drivers (different `driver_uuid` + different phone; one active, one
suspended) both appeared, the second row **silently overwrote** the first. That could:

- **DROP** one of the pair from that day (its orders/net vanished from the day total), and/or
- **BLEND** identity fields — the suspended driver's `boltState` / phone landing on the
  active driver's earnings row.

The stored history only keeps the **post-merge** result, so we cannot recover the original
pre-merge rows from it. What the audit *can* do is flag exactly which days look damaged, so
they can be re-pulled from Bolt or re-uploaded if needed — a **separate, explicitly-approved**
step (this build does not rewrite anything).

## How it works

`auditHistoryCollisions()` (in `index.html`, S2 block):

1. Builds global maps over every history row: `uuid → phones`, `phone → uuids`,
   `name → uuids`, `name → phones`.
2. **Collision names** = a display name carried by **≥2 distinct `driver_uuid`s AND ≥2
   distinct phones** (positive proof of two real humans, not just a uuid that drifted across
   report types — a phone is one person).
3. For each collision name, flags days:
   - **BLEND** — a single row whose `driver_uuid` is A but whose phone is *normally* uuid B's
     (dominant-owner test: a phone belongs to whichever uuid carries it on the most rows).
     Two identities fused onto one row.
   - **DROP** — an identity present on a day **before and after** is missing from an
     in-between day that still carries the shared name → one of the pair was collapsed away
     on merge.

It is **pure/read-only** — it never calls `saveHistory`/`saveBlockLog`.

## How to run it live (produces the real findings)

On the machine where his dashboard is open with the full cloud history loaded:

1. Open the dashboard, wait for the cloud sync to finish (History tab shows the days).
2. Open the browser console (F12 → Console).
3. Run:
   ```js
   copy(auditHistoryCollisionsMarkdown())   // Markdown → clipboard
   // or, to just eyeball it:
   console.table(auditHistoryCollisions().findings)
   ```
4. Paste the Markdown under "Live run output" here and commit (findings only — no PII beyond
   driver display names, which already appear throughout the app).

`auditHistoryCollisions()` returns `{ collisionNames, findings, days, generatedAt }`;
`auditHistoryCollisionsMarkdown()` formats it as the table below.

## Verified detector output (synthetic fixture)

Run against a 3-day fixture where **02 Jul** was blended (a row tagged uuid `7f3a1c02…` but
carrying the *other* driver's phone `500000002`, and the suspended uuid `9b2e4d81…` dropped
from that day). The real function produced:

```
- History days scanned: 3
- Collision names (same name, ≥2 uuids, ≥2 phones): 1
- Findings (blended/dropped days): 2

### Collision names
| name key          | # uuids | # phones |
|-------------------|---------|----------|
| mohammed alsubaie | 2       | 2        |

### Suspect days
| type  | period      | source | name              | detail                                                                                                   |
|-------|-------------|--------|-------------------|----------------------------------------------------------------------------------------------------------|
| BLEND | 02 Jul 2026 | cron   | Mohammed Alsubaie | row tagged uuid 7f3a1c02… but its phone 500000002 is normally uuid 9b2e4d81… — identity fields look blended |
| DROP  | 02 Jul 2026 | cron   | Mohammed Alsubaie | uuid 9b2e4d81… present 01 Jul…03 Jul but MISSING on 02 Jul while the shared name is still there            |
```

This confirms both detectors fire correctly on a known-bad day.

## Live run output

_Not yet captured in this session (no live cloud history was loaded here). Paste the output
of `auditHistoryCollisionsMarkdown()` from his live dashboard above this line._

## If damaged days are found

Do **not** auto-rewrite. Options, in order of safety, to be chosen with Muhammad:
1. **Re-pull** the affected day from Bolt (a fresh cron/api pull for that period, then the
   Build-176 identity-keyed merge keeps both drivers separate).
2. **Re-upload** the original CSV for that day (same effect via the fixed merge path).
3. Accept the historical blemish (past totals only; live state is already correct post-S2).
