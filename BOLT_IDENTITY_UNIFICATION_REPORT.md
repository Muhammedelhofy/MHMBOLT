# Build-195 · IDENTITY UNIFICATION — build report

**Spec:** `BOLT_IDENTITY_UNIFICATION_SPEC.md`
**Branch:** `feat/identity-unification` off `origin/main` @ `c6ebfda` (Build-194)
**Model / effort:** Opus · max
**Deployed:** NO. Not pushed, not merged. Prod is still Build-194.
**Live test:** `tests/BUILD195_LIVE_TEST.md`

---

## 1 · What was wrong, and what it cost

The dashboard identified captains three ways. Finance keyed on the **name**, and
`drivers.find(...)` returned the FIRST row whose name matched — so on any day both twins worked,
one captain's earnings were taken and the other's were never counted at all. Measured on the real
cloud data today, before the fix:

| Captain | Finance showed | Actually earned | Lost |
|---|---|---|---|
| Turki Aldawsari | 1,573 | 1,901 + 181 = **2,082** | **−509** |
| Meshari Alanazi | 2,679 | 2,463 + 425 = **2,888** | **−209** |
| Mohammed Alsubaie | 4,927 | **5,350** | **−423** |
| Khalid Asiri | 158 | **178** | **−20** |

Turki's split reproduces the spec's original measurement to the SAR. The other three have moved
since the spec was written (one more day of earnings), which is why they differ from it.

Understated net feeds the tier band, the Bolt bonus and the P&L, so all of that was wrong too.

## 2 · What changed

**One identity space, anchored on `driver_uuid`.**

| # | Change | Where |
|---|---|---|
| 1 | `buildProfileResolver` labels a captain by `id:<uuid>`, not `ph:<9>` | the clock the spec flagged — a phone change can no longer drift a captain's key |
| 2 | An `identityOf()` object `{key,name,driverId,phone}` threaded through every money layer | `key` computed once, so the hot paths stay O(1) |
| 3 | `getDriversInMonth` returns **identities**, not names | this was THE collapse |
| 4 | `rawDailyNetForMonth` sums every distinct ACCOUNT per day, de-duped by account signature | fixes the drop; Model B's two accounts still both count, a duplicated row still counts once |
| 5 | `computeDriverPnL` / `computeDriverNetForPeriod` / `getEffectiveProfile` / `daysWorkedForMonth` / `bonusForDriver` / `firstAchieveMonth` / `ambPayoutFor` / `teamIncentiveFor` / `detectFirstTrip` / `driverFirstSeenMs` take an identity | threaded through Exec P&L, model roll-up, courier table, exports, EOM, incentives, tier drills |
| 6 | Captains table keys its map by identity, not raw `d.name` | it only escaped before because the four pairs' SPELLING differed |
| 7 | `khair_courier_overrides` re-keyed `identityKey::YYYY-MM` | + migration, + legacy read for unambiguous names |
| 8 | Month-end reconcile store keyed by identity | a twin never reads a legacy name-keyed lock, because that lock is the merged pair figure |
| 9 | Cycle reconciliation keyed by identity | was outside the spec's list; same collapse, same fix |
| 10 | `driverRowMatches` refuses to match two different uuids | Bolt has had one phone on three captains; the phone branch would hand one captain's month to another |
| 11 | Twin chip (`·821`) on colliding names only | your call, option 1 |
| 12 | Frozen-record repair behind a button that shows the list first | your call, option 1 |
| 13 | Undecidable same-name settings PARKED and surfaced, never guessed | your call, option 1 |

## 3 · The migration, on your real 352-record store

| | Before | After |
|---|---|---|
| Records | 352 — 188 `ph:` · 95 `nm:` · 69 `id:` | 196 — 190 `id:` · 1 `ph:` · 5 `nm:` |
| Ambassador tags | 184 | 184 · none lost |
| Nationalities | 152 | 152 · none lost |
| Parked for you | — | 5 |
| Field conflicts | — | 1 (reported) |

352 → 196 is **de-duplication**. 156 records were second copies of a captain already present
under another key. Idempotent, reversible (`restoreProfilesPreS3()`), and it snapshots before its
first write.

### 🔴 A real defect this build found, and fixed

The first version of the migration used plain key-level newest-wins, the same rule as
`mergeStampedByKey`. Run against the real store, **it erased 24 live ambassador tags.**

Those 24 captains each had two records: an OLDER `ph:`-keyed one holding the real ambassador, and
a NEWER `nm:`-keyed shadow with `ambassador: null` — written by the very name-keyed-edit bug this
spec describes (the Nawaf AlBahwan case). Newest-wins kept the empty shadow.

The fix is field-level: **a field still at its factory default never overwrites a real value from
another copy of the same captain.** Newest still wins a genuine disagreement, and the dropped
value is logged to the conflicts panel instead of vanishing. Result: 24 → 0 silent losses, 1
genuine disagreement surfaced (`nawaf albahwan`: kept `Khaled Met3eb`, dropped `Boda`).

This is why the acceptance criteria were run against real data and not only fixtures. It passed
every fixture test before this was found.

## 4 · Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Four pairs = two rows each, per-uuid nets, sum matches Captains | ✅ verified on real data |
| 2 | Editing one twin never changes the other | ✅ all four pairs, real data |
| 3 | No profile orphaned; undecidable ones listed for you | ✅ 0 lost, 5 parked and surfaced |
| 4 | A captain who changes phone is still ONE person | ✅ key is the uuid, structurally immune |
| 5 | Builds 186-193 regressions still pass | ⚠️ **partly** — see below |
| 6 | Verified against real data, not only locally | ✅ `tests/identity_live_verify.js`, 32/32 on the live cloud record |

**On #5:** the arithmetic regressions are covered (fleet-wide conservation holds for all three
months; the locked-month gap is fully attributable to Bolt's locks; the tier ladder, split % and
lock paths are exercised). What is **not** confirmed is the **visual/interaction** half — the
lock's hidden tabs, mobile search, and the render timings — because the browser preview pane
wedged partway through this session and did not recover. Those are section 6 of the live-test doc
and need a human pass before this goes to the ops team.

## 5 · Tests

| File | What | Result |
|---|---|---|
| `tests/identity_unification.test.js` | 55 assertions over functions **extracted from index.html** (same technique as `codec_parity.test.js`), so it cannot pass against drifted code | **55/55** |
| `tests/identity_live_verify.js` | the same functions run against the **real Supabase `fleet_data` record** | **32/32** |

No PowerShell mirror. The PS-mirror convention exists to catch drift between two implementations
of one compute path; here there is only one implementation, and the tests execute it directly out
of `index.html`. A hand-written PS copy would BE the second implementation — the exact thing the
meaning-first correction warns against.

## 6 · Findings I did not change

Both are pre-existing, outside this spec, and each would need its own decision:

1. **The LEFT FLEET badge in the Captains table looks dead.** `buildCourierSummaryTable` tests
   `departedKeys.has(driverKey(c.name))`, but `getDepartedKeys()` is keyed by `canonOf` — which
   returns `id:…`/`ph:…`/`nm:…`, never a bare name key. So the badge and the Current/Left status
   filter appear never to match. Fixing it could suddenly badge a large number of captains as
   LEFT, which is not something to slip inside a money build. `index.html` — search
   `hasLeft = departedKeys.has`.
2. **The Saudi→foreigner name map stays name-keyed.** Its only source is an Excel with no phone
   or uuid column, so a colliding name cannot be split without a new column in that upload.
   Already documented in the file.

## 7 · What needs you

| | Item |
|---|---|
| 🔴 | Walk `tests/BUILD195_LIVE_TEST.md` sections 1-4 — especially the visual checks the wedged preview pane could not confirm |
| 🔴 | Resolve the 5 parked ambassadors (you already know Meshari `·036` = Menna Mahmoud) |
| 🔴 | Click the frozen-record repair when you are ready — 34 records |
| 🔴 | Confirm `nawaf albahwan` should be `Khaled Met3eb`, not `Boda` |
| 🔴 | Deploy decision. Nothing is pushed. Push to `main` auto-deploys prod |
