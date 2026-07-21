# S3 — Identity-key the driver profile / panel / ambassador layer (paste-ready kickoff)

Paste everything in the fence into a fresh Claude Code session.

```
Model: Opus - Effort: high
Why this model: multi-site refactor inside one 13k-line file + a stored-data migration,
where a half-fix leaves two same-named drivers still cross-contaminated. Zero-regression bar.

Build: Build-179 — identity-key the courier-profile / driver-panel / ambassador layer.
Target repo: MHMBOLT (main checkout: C:\Users\m7ofy\dev\Claude\Projects\Bolt), file: index.html

THE BUG (confirmed live)
Two REAL same-named drivers exist (e.g. "Mohammed Alsubaie" +966542720081 UUID 33e2387b,
active Yaris, ambassador Omar — vs "MOHAMMED ALSUBAIE" +966508846337, suspended Camry, a
DIFFERENT ambassador). The captain table shows them as two rows only because their name
CASING differs. But every profile-addressed feature collapses them, because courier profiles
are stored keyed by driverKey(name) (lowercased name):
  • Clicking the blocked row opens the ACTIVE earner's panel (openModal/bioScanThenOpen(name)).
  • Both rows show the same ambassador ("Omar") via dkAmbTag → getCourierProfile(name).
  • Same for model/funnel/nationality and any per-driver profile field.
Prior work already fixed identity for BLOCK STATE and MERGES: S1/S2 (Build-175/176) added
identSigsOf / buildIdentityResolver / canonOf / isLiveBlocked (uuid→phone→name-unambiguous).
S2 EXPLICITLY LEFT courier profiles name-keyed and documented this migration as the leftover.
This build is that migration. READ the S1/S2 code first and REUSE buildIdentityResolver/canonOf.

SCOPE
1. Courier-profile store keyed by IDENTITY, not name:
   - loadCourierProfiles/saveCourierProfiles/getCourierProfile/upsertCourierProfile
     (~6752–6795) key by a canonical identity (phone-9 preferred; uuid where available),
     with name only as a last resort for a profile that has no identity at all.
   - A ONE-TIME MIGRATION re-keys existing stored profiles (localStorage COURIER_PROFILES_KEY
     + cloud khair_courier_profiles): match each old name-keyed profile to a phone/uuid using
     history rows + sheet_ambassador_sync (which HAS phone). A name that maps to ≥2 identities
     must SPLIT — attach each profile to the right identity (use the sheet's per-phone ambassador
     to decide); if unresolvable, keep name-keyed and flag it, never guess.
2. Driver panel opens the RIGHT driver:
   - Thread the row's identity (driverId/phone, already on the captain row post-S2) through
     bioScanThenOpen → openModal, and scope openModal's history aggregation to that identity
     when the name is ambiguous (canonOf). ~15 dkOpenDriver call sites pass name today; give
     them an identity where the caller has one (captain rows do), name-only fallback otherwise.
3. Ambassador / model / funnel per identity:
   - dkAmbTag/getModel/getFunnel read the identity-keyed profile. The ambassador SOURCE is
     sheet_ambassador_sync (phone) — attribute by phone (confidence 'high') so each same-named
     driver gets his own ambassador; unmatched → "—", never the other driver's.
4. foreign-name map (nameMapping) — same-name collision is possible; scope to identity if a
   name maps to ≥2 identities, else leave name-keyed (document if deferred).

VERIFY (the S1/S2 pattern — REAL, not self-graded)
- node --check on the extracted inline script.
- Serve the worktree (serve.ps1, own PORT) and run IN-PAGE fixture tests via the browser JS
  tool: two same-named drivers, different phones/uuids, different ambassadors, one blocked.
  Assert: clicking each row opens ITS panel (right phone/plate/earnings); each shows ITS OWN
  ambassador; the blocked one is not shown as the active one; migration re-keys a seeded
  name-keyed profile onto the correct phone and SPLITS a collision name.
- Then load real cloud data and eyeball the Mohammed / Abdullah / Meshari / Turki / Majed
  Alsubaie pairs: each row opens the correct driver with the correct ambassador.

--- SETUP: your own worktree ---
  git fetch origin
  git worktree add -b feat/s3-profile-identity ../Bolt-wt-s3-profile origin/main
Work only in that worktree. Node (if needed): NODE_PATH="C:\Users\m7ofy\dev\Claude\Projects\Bolt\node_modules"
node <script> (node.exe: C:\Users\m7ofy\AppData\Local\Programs\kimi-desktop\resources\resources\runtime\node.exe).

--- BEFORE YOU BUILD ---
git fetch origin && git log --oneline origin/main -15; read reports/*.json + reports/*.md.
Note recent live builds: 175 (S1 block-identity), 176 (S2 merge-identity), 177 (CSV money-
authority), 178 (multi-vehicle active-record). Don't duplicate.

--- YOUR FILES (disjoint; never git add -A) ---
index.html
tests/BUILD179_LIVE_TEST.md
reports/build-179-done.json
git add ONLY those. Confirm git status; if other files are dirty, a parallel session is live.

--- MIGRATION SAFETY ---
The profile re-key touches STORED user data (localStorage + cloud khair_courier_profiles).
Make it idempotent + reversible: write a backup key before re-keying, never drop a profile you
can't confidently re-home (keep it name-keyed + counted), and gate the cloud write. A collision
name that can't be split by phone stays as-is and is reported, not merged.

--- REPORT BACK ---
reports/build-179-done.json:
{ "build":"Build-179","status":"done","committed_sha":"<git rev-parse HEAD>",
  "files_changed":["index.html","tests/BUILD179_LIVE_TEST.md"],
  "test_result":"X/Y passed","migration_needed":false,"migration_file":null,
  "notes":"one line — esp. any collision names that could NOT be split by phone" }
Then: git add that file; git commit -m "report: Build-179 done"; git push origin feat/s3-profile-identity.

DEPLOY IS GATED: never merge/push main yourself — main auto-deploys prod. Muhammad merges.
```
