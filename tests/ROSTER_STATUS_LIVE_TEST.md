# Live test — Roster/Status ingest (Drivers Performance export)

**What changed:** the dashboard now ingests the Bolt **"Drivers Performance"** export (the one with a
`Status` column) as an authoritative **fleet roster + live status** snapshot — separate from earnings.
Uploading it fixes the "213 vs 205" mismatch: drivers who left are flagged **Left Fleet**, suspended
drivers are marked **suspended**, and no earnings/net number is touched.

## Files
- `index.html` — `mapDriver` reads `Status`→`boltState`; new roster-snapshot store
  (`getRosterSnapshot`/`setRosterSnapshot`/`rosterSnapshotEntry`); `getRosterEntry` +
  `latestStateBearingEntry` prefer a fresh snapshot; `handleFile` routes a status file to
  `importRosterSnapshot`; `isRosterStatusFile` classifier.

## Automated proof (node harness, real July files — 13/13 pass)
`scratchpad/roster_fix_test.js` run against the two real 1–21 Jul exports:
- Earnings file classified NOT-roster; Performance file classified roster ✅
- Performance parses **205** drivers → **137 active + 68 suspended** ✅
- Earnings rows carry **no** boltState (no regression to money data) ✅
- Reconciliation: total 205, **portal 205** (matches Bolt), active 137, suspended 68 ✅
- The **4 earners who left** are flagged departed by the *real* identity resolver; a still-active
  earner is NOT ✅

## Live proof (real page, clean sandbox)
- Page boots with **zero console errors**; all 9 new functions defined.
- Synthetic 5-driver snapshot (3 active + 2 suspended): `getFleetRoster()`=5,
  reconciliation `{total:5, active:3, suspended:2, portal:5}`, state-bearing source=`performance`;
  clears cleanly back to baseline.

## How to use it (manual, in-chat)
1. In Bolt Fleet portal → export **Drivers Performance** for the current range.
2. On the dashboard click **↑ Upload** and pick that file (same button as earnings).
3. Toast confirms: `Fleet roster updated → 205 drivers · 137 active · 68 suspended · N left-fleet flagged`.
4. Captains tab → **Left Fleet** filter shows who departed; **Current** excludes them from your call list.

## Known limitation (follow-up)
The roster snapshot is stored **locally** (localStorage `boltFleetRosterSnapshot`); it does not yet
sync to cloud, so a manager viewing the cloud copy still sees the old roster until this is wired into
`syncToCloud`. Fine for the single-operator call-list use case.
