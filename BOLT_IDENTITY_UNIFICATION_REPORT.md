# Build-195 · IDENTITY UNIFICATION — build report

**Spec:** `BOLT_IDENTITY_UNIFICATION_SPEC.md`
**Branch:** `feat/identity-unification` off `origin/main` @ `c6ebfda` (Build-194)
**Model / effort:** Opus · max
**Deployed:** ✅ LIVE on prod through `a4c413e` (Build-199), on his explicit OK. Builds 195→199:
the identity fix, then three rounds of fixing render performance that the identity fix broke.
Verified against the deployed bytes, not the local file.
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
lock paths are exercised), and the **render timings caught a real regression I had introduced**
(see §4b). What is still **not** confirmed is the **visual/interaction** half — the lock's hidden
tabs, mobile search, the on-screen tier ladder — because the browser pane wedged and did not
recover. Section 6 of the live-test doc, needs a human pass before the ops team leans on it.

## 4b · 🔴 Render performance: I broke it, then fixed it over Builds 196-199

He reported it before I had finished checking: "page is taking too much to load", with the header
stuck on **No data**. It was real, and it was mine.

| | Captains | Today |
|---|---|---|
| Spec baseline (Build-194) | ~219ms | ~51ms |
| Build-195 (first deploy) | **3240ms** | **3087ms** |
| Build-196 | 537ms | 5562ms |
| Build-198 | 2246ms | 987ms |
| **Build-199 (now)** | **341ms** | **37ms** |

Three causes, none of which any unit test could see:

1. **`driverFirstSeenMs`** — identity-correctness swapped a cheap name compare for
   `driverRowMatches` **inside a full-history scan**, called once per rendered row (6.44ms × 227).
2. **`rawDailyNetForMonth` / `daysWorkedForMonth`** — same shape; Today asks for every roster
   row's previous month several times per render (~420ms warm / ~870ms cold, several times over).
3. **The memo checks themselves** — the new indexes, and the pre-existing `getProfileResolver`,
   validated their cache by comparing the **content** of `khair_perf_history`. That is 2.2MB on his
   device. Identity-keying made `getProfileResolver` run ~18,000 times per Captains render, so the
   staleness check alone cost ~3s. This is the subtle one: my *fix* for (1) and (2) carried the
   same flaw, which is why Build-198 fixed Today but pushed Captains back up to 2.2s.

All three are now one-pass indexes memoised on the history cache array **by reference**, with the
resolver object folded into the token (a resolver rebuild can relabel a captain `ph:` → `id:`, so
an index built against the old resolver would read 0 for them).

`tests/identity_perf_verify.js` asserts each index returns exactly what the scan it replaced
returned, on the real cloud history: **identical for all 221 captains, money to the halala**,
10-289x faster.

Two lessons I would keep:
- A correctness fix that swaps a cheap predicate for an expensive one inside a per-item loop is a
  performance change, and needs measuring on real data volumes.
- **A cache whose staleness check is O(size of the data) is not a cache.** Memoising on content is
  fine at ten call sites and catastrophic at eighteen thousand.

Neither would have been caught without measuring the actual page. Every unit test was green
through all of it.

## 5 · Tests

| File | What | Result |
|---|---|---|
| `tests/identity_unification.test.js` | 55 assertions over functions **extracted from index.html** (same technique as `codec_parity.test.js`), so it cannot pass against drifted code | **55/55** |
| `tests/identity_live_verify.js` | the same functions run against the **real Supabase `fleet_data` record** | **32/32** |
| `tests/identity_perf_verify.js` | old vs new `driverFirstSeenMs` over the real history — agreement + speed | **4/4** |

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
3. **`loadCourierProfiles()` re-parses the whole profile store on every call** (~0.31ms), and the
   Captains render calls it several times per row — roughly 250-280ms of a render. Pre-existing.
   A parse cache would fix it, but the returned profile objects are MUTATED by callers before
   `upsertCourierProfile`, so caching introduces an aliasing hazard in money code. Not worth it
   without its own think; flagged rather than done.
4. **The twin chip falls back to a uuid stub when a captain has no phone** in the data, so a pair
   can read `·867` / `#9018` instead of two phone suffixes. Cosmetic, still unambiguous.

## 7 · What needs you

| | Item |
|---|---|
| 🔴 | Paste the render-timing snippet on prod (live-test §8) — it is the one number I owe you |
| 🔴 | Walk `tests/BUILD195_LIVE_TEST.md` §6 — the visual half the wedged pane could not confirm |
| 🔴 | Resolve the 5 parked ambassadors (you already know Meshari `·036` = Menna Mahmoud) |
| 🔴 | Click the frozen-record repair when you are ready — 34 records |
| 🔴 | Confirm `nawaf albahwan` should be `Khaled Met3eb`, not `Boda` |
| 🟢 | Deploy is DONE — `fb4dd98` + `2a1696e` live and verified against the deployed bytes |

## 8 · Rollback, if it is ever needed

```bash
git -C "C:/Users/m7ofy/dev/Claude/Projects/Bolt" revert --no-edit 2a1696e fb4dd98 && git -C "C:/Users/m7ofy/dev/Claude/Projects/Bolt" push origin main
```

That returns prod to Build-194. The stored profiles are re-keyed independently of the code, so
also restore them from the browser console on any device that has migrated:

```javascript
restoreProfilesPreS3(); restoreOverridesPreS7(); location.reload();
```
