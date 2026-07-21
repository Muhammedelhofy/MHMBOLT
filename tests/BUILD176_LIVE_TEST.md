# Build-176 — Live test (S2 driver-identity refactor)

**What changed:** every place that used to key a driver by their **name** now keys by
**identity** (Bolt `driver_uuid` → 9-digit phone → name only when the name is unambiguous).
This finishes the "Mohammed Alsubaie" collision fix S1 started — extending it from block
badges to **earnings merges, the month roster, the Fleet aggregate, LEFT-FLEET detection,
the Blocks worklist, and the transfer/deductions ledger**.

**The one driver pair to watch** (the real incident):
- **Our driver** — "Mohammed Alsubaie", **active**, his own phone + uuid.
- **The other one** — "MOHAMMED ALSUBAIE" (Bolt sent it uppercase), a **different** person,
  **suspended**, different phone + uuid.

Before S2 these two blurred into one row on several tabs. After S2 they are always **two
separate people** everywhere.

---

## Do this (≈10 minutes)

### 0. Load the dashboard
1. Open the dashboard, let the cloud sync finish (History tab lists the days).
2. Hard-refresh once (Ctrl+F5) so the new `index.html` is the one running.

### 1. Captains tab — the two Alsubaies are two rows
1. Search **alsubaie**.
2. **Expect:** two separate captain rows. The suspended one shows the **BLOCKED** badge;
   our active one shows **no** block badge. Their **net earnings are different numbers**
   (they are not sharing a total).
3. Click each row → the driver panel shows that driver's **own** phone and **own** state.

### 2. Today tab — blocked count + no cross-contamination
1. Look at the "blocked now" number and the blocked list.
2. **Expect:** the suspended Alsubaie appears in the blocked list; our active Alsubaie does
   **not**. The blocked count matches the Blocks tab's "Blocked now".

### 3. History tab — upload a same-day CSV over a cron day (the core fix)
This is the merge that used to destroy data.
1. Pick a day that already synced from the nightly cron (it has both Alsubaies).
2. Upload **that same day's** activity CSV (the normal daily export) for that date.
3. Open that day (View) and search **alsubaie**.
4. **Expect:**
   - **Both** Alsubaies still present — the CSV upload did **not** drop one of them.
   - Our active driver's **orders/net updated** to the CSV numbers.
   - The suspended driver still shows **suspended** and his **own** (unchanged) numbers —
     his state did not jump onto the active driver's row, and his earnings didn't move.
5. Re-check Captains/Today — still two clean rows.

### 4. Blocks tab — worklist + unblock is per-person
1. Go to Blocks. Find the suspended Alsubaie in the unblock worklist.
2. **Expect:** he is his **own** row (not fused with the active Alsubaie). "history (N)"
   counts **his** events only.
3. Click **Copy unblock msg** → the "blocked since / reason" in the copied text is **his**.
4. (Optional, only if he is genuinely reinstated in Bolt) **Mark unblocked** on him →
   **only his** open block closes; the active Alsubaie is never touched. (If Bolt still has
   him suspended, the block correctly re-appears on the next sync — that's intended.)

### 5. Finance → 💸 Transfer Log — reversal lands on the right driver
1. Open the Transfer Log for a cycle that has an Alsubaie transfer.
2. **Expect:** a reversal for one Alsubaie shows **REVERSED** only against **that** driver's
   transfer, never flips the other same-named driver's transfer.

### 6. Run the one-time history audit (read-only)
1. F12 → Console → run: `copy(auditHistoryCollisionsMarkdown())`
2. Paste the result into `reports/build-176-history-audit.md` under "Live run output".
3. This lists past days (if any) where the OLD merge already blended/dropped the pair.
   It **changes nothing** — it just tells us which days to consider re-pulling.

---

## Expected behaviour per tab (summary)

| Tab | Before S2 (bug) | After S2 (correct) |
|---|---|---|
| **Captains** | one row, blended net, block badge ambiguous | two rows, each own net, badge only on the suspended one |
| **Today** | blocked flag could paint the wrong Alsubaie | suspended one blocked, active one clear; count matches Blocks |
| **History** (re-upload day) | second same-named row overwrote the first → one lost | both survive; activity updates, state retained per person |
| **Fleet — All Days** | pair aggregated into one row | two rows, earnings summed per identity, LEFT flag per identity |
| **Blocks** | worklist could merge the two by name | grouped by identity; unblock/copy scoped to one uuid |
| **Finance — Transfers** | reversal matched by name (wrong driver) | reversal matched by uuid/phone, name only as last resort |

## Symptom → root-cause failure table

| Symptom you see | Likely root cause | Where to look |
|---|---|---|
| Two Alsubaies still show as **one** row / shared net | resolver treated them as one — phones missing on their rows so the collision wasn't detected | `identSigsOf` needs a 9-digit phone or uuid on each row; check the sync actually carries `phone`/`driverId` |
| Re-uploading a day **loses** one Alsubaie | `mergeDayEntries` still collapsing by name | it must call `buildIdentityResolver` and key by `canonOf` (S2) |
| A **single real driver** wrongly split into two half-rows | their uuid drifted across report types **and** no shared phone tied the rows | expected only when phones are absent; confirm the roster pull includes phone. See resolver note in `index.html` |
| Block badge on the **wrong** Alsubaie | `liveBlockedIndex` / `isLiveBlocked` bypassed | S1 helpers; confirm the state-bearing day has both drivers with correct `boltState` |
| Marking one Alsubaie unblocked **clears both** | `markDriverUnblocked` called without the uuid | the Blocks worklist button must pass the identity (`escId`) |
| Transfer **REVERSED** on the wrong driver | old entries lack `driverId`/`phone` → name fallback | only affects transfers recorded **before** this build; new ones carry identity |
| "blocked now" count ≠ Blocks tab | reading the block LOG instead of live state | both read `liveBlockedIndex().entries.length` (R1) — should already match |

## Automated proof (already run this build)

`node` in-engine suite against the real `index.html` inline script: **37/37 assertions
passed** + 4 render paths smoke-clean. Covers: resolver split/merge/ambiguity;
`mergeDayEntries` (two rows survive, no earnings/state blend); `computeRosterForMonth` split
+ per-identity blocked; `getDepartedKeys`/`buildAggregatedDrivers` LEFT + no blend; transfer
reversal attribution; `markDriverUnblocked` identity scoping; and the history audit BLEND/DROP
detectors.
