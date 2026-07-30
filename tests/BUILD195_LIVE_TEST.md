# Build-195 · IDENTITY UNIFICATION — live test

**Branch:** `feat/identity-unification` (worktree `Bolt-wt-identity`, off `origin/main` @ Build-194)
**What changed in one line:** the dashboard now identifies every captain by their Bolt
`driver_uuid` everywhere, so two captains who share a name are two people in Finance too.

Run the two automated suites first — they are fast and they cover the arithmetic:

```bash
node tests/identity_unification.test.js
```

```bash
node tests/identity_live_verify.js
```

The second one pulls your REAL cloud data (via the public `/api/bolt/config` endpoint, same as
any browser) and checks the four same-name pairs against it. Both must print `ALL GREEN`.

---

## 1 · The money — the reason this build exists 🔴

Open **Finance → By Captain**, month **July 2026**, and search each name.

| Search for | Before (one row) | After (two rows) | What to check |
|---|---|---|---|
| `Turki Aldawsari` | 1,573 | **1,901** + **181** = 2,082 | two rows, chips `·821` and `·152` |
| `Meshari Alanazi` | 2,679 | **2,463** + **425** = 2,888 | chips `·036` (Menna) and `·495` (Engy) |
| `Mohammed Alsubaie` | 4,927 | **5,350** + 0 | the second account shows 0 for July |
| `Khalid Asiri` | 158 | **178** + 0 | same |

> The "before" numbers are what the live Build-194 prod dashboard shows right now, measured
> today. The "after" numbers were measured against the same cloud data by
> `tests/identity_live_verify.js`. Turki's split matches the spec's original measurement exactly.

**Then cross-check against Captains.** Go to **Captains**, same month, search the same name.
The two rows there should show the same two numbers, and they always did — the Captains tab was
already correct. The point of the build is that Finance now agrees with it.

## 2 · The twin chip 🟢

On a name two captains share you should see a small grey mono chip with the last 3 digits of
that captain's phone: **Turki Aldawsari `·821`**. Check it appears in:

- Captains → By Captain (beside the name)
- Finance → By Captain (beside the name)
- the Finance captain panel header (click the name)
- the driver multi-select dropdown in Finance
- the Ambassadors "Assign" picker

Check it does **NOT** appear on any of the ~200 captains with a unique name. If you see chips
everywhere, something is wrong — say so and stop.

## 3 · Editing one twin must not touch the other 🔴

1. Finance → By Captain → find the two `Turki Aldawsari` rows.
2. On the **first** row, click **Profile**, set Ambassador to something recognisable, Save.
3. Look at the **second** row: its ambassador cell must still be empty.
4. Click **Change ▸** on the first row, set a Salary override for July, Save.
5. The second row's Change button must still read `Change ▸`, not `✓ Changed`.
6. Repeat for one more pair (Meshari is a good one — you already know 536 = Menna).

## 4 · The data-conflicts panel 🔴

**Today** tab → the alert rail → click the **data conflicts** row. You should now see:

- **⚠️ Needs your decision** — 5 captains whose ONE saved ambassador could belong to either
  twin. The migration refused to guess. These are: Khalid Asiri, MESHARI ALANAZI,
  Turki Aldawsari, ABDULLAH ALOTAIBI, Mohammed Alsubaie.
  **This is the list you asked for.** To resolve one: Ambassadors tab → the Assign picker now
  lists each twin separately with its phone chip → pick the right one → set the ambassador.
- **👥 Same name, different captains** — informational now, not a money warning.
- **🔀 Two records disagreed** — 1 entry: `nawaf albahwan`, ambassador kept `Khaled Met3eb`,
  dropped `Boda`. Confirm `Khaled Met3eb` is the right one.
- **🕒 Edits will not stick** — 34 records, with a **Repair** button.

## 5 · The frozen-record repair (your call, one click) 🔴

Still in that panel, click **🕒 Repair 34 frozen records**. It shows you the list first and
asks. Nothing happens unless you confirm.

- After it runs: edit one of those captains' profiles, then hit **Pull** from cloud. The edit
  must still be there. Before this fix it silently reverted.
- Undo, if it ever looks wrong: open the browser console and run `restoreProfilesPreS3()`.

## 6 · Regression sweep — Builds 186-193 must still hold 🟢

| Check | Where | Expect |
|---|---|---|
| Company-data lock | reload with the lock engaged | the 6 locked tabs stay hidden, no console error |
| Ambassador count == rows | Captains → ambassador filter | the number beside each name equals the rows it shows |
| Tier ladder | Captains deck | still pinned to Bolt's 4k/5k/6k floors |
| Closed-month split | Finance → Executive, June | per-driver `bonusSplitPct` still honoured |
| Mobile search | Captains, narrow window | search + filters still work |
| Render timing | console | Captains ~219ms, Today ~51ms (see below) |
| Cloud round-trip | Pull, then Push | profile count stays 196, no key explosion |

Render timing, pasted into the console:

```javascript
console.time('captains'); renderCaptains(); console.timeEnd('captains'); console.time('today'); renderToday(); console.timeEnd('today');
```

## 7 · What the migration does to your stored data

Run once, automatically, after the cloud merge. Idempotent — a second run is a no-op.

| | Before | After |
|---|---|---|
| Profile records | 352 (188 `ph:` · 95 `nm:` · 69 `id:`) | 196 (190 `id:` · 1 `ph:` · 5 `nm:` parked) |
| Ambassador tags | 184 | 184 — none lost |
| Nationalities | 152 | 152 — none lost |

The drop from 352 to 196 is **de-duplication, not loss**: 156 of those records were second
copies of a captain already in the store under a different key (the `nm:` shadow records the
name-keyed-edit bug created). Every setting on the losing copy is carried onto the winner unless
the two genuinely disagree, in which case the newest wins and the dropped value is listed in the
conflicts panel.

Backups, both written before the first change:
`khair_courier_profiles_backup_preS3`, `khair_courier_overrides_backup_preS7`.
Restore with `restoreProfilesPreS3()` / `restoreOverridesPreS7()` in the console.

## 8 · Verified on prod after deploy

Both builds are LIVE: `fb4dd98` (Build-195) and `2a1696e` (Build-196).

- **Twin chip: confirmed rendering on prod.** Exactly **10 chips across 227 Captains rows** — the
  5 pairs × 2, and nothing else. Observed: `Turki Aldawsari ·821` / `TURKI ALDAWSARI ·152`,
  `Meshari Alanazi ·036` / `MESHARI ALANAZI ·495`, `Khalid Asiri ·867`,
  `Mohammed Alsubaie ·081`, `ABDULLAH ALOTAIBI ·526`.
  ⚠️ Cosmetic wrinkle: a twin with **no phone in the data** falls back to a uuid stub, so a pair
  can read `·867` / `#9018` instead of two phone suffixes. Readable and still unambiguous, but
  inconsistent within the pair — say the word if you want that fallback changed.
- **Deployed script parses**; `api/` is still exactly **12** functions (the Hobby cap — a 13th
  silently fails the whole deploy); health OK: Bolt connected, Supabase connected, last cron
  720 orders / 209 drivers.
- **Migration on prod:** 197 records — 191 `id:` · 1 `ph:` · 5 parked; both schema markers at
  `s7-uuid-identity`.

### 🔴 Render performance: broken by this work, then fixed over Builds 196-199

You saw this yourself as "page is taking too much to load" with the header stuck on **No data**.
It was real. Measured on prod, on your data:

| | Captains | Today |
|---|---|---|
| Spec baseline (Build-194) | ~219ms | ~51ms |
| Build-195 (first deploy) | **3240ms** | **3087ms** |
| Build-196 | 537ms | 5562ms |
| Build-198 | 2246ms | 987ms |
| **Build-199 (now)** | **341ms** | **37ms** |

Today is now **faster than the documented baseline**. Captains is ~1.5x baseline, which is the
genuine cost of resolving an identity per row plus the twin chip.

Three separate causes, all mine, none of which any unit test could see:

1. `driverFirstSeenMs` — made identity-correct by swapping a cheap name compare for
   `driverRowMatches` **inside a full-history scan**, called once per rendered row.
2. `rawDailyNetForMonth` / `daysWorkedForMonth` — same shape; Today asks for every roster row's
   previous month several times per render.
3. The memo checks on the new indexes — and on the pre-existing `getProfileResolver` — compared
   the **content** of `khair_perf_history`. That string is 2.2MB on your device, so each check
   was a 2.2MB read plus a full compare. Identity-keying made `getProfileResolver` run ~18,000
   times per Captains render: ~3s of pure localStorage reads.

All three now use one-pass indexes memoised on the history cache array **by reference**.
`tests/identity_perf_verify.js` asserts each index returns exactly what the scan it replaced
returned, over your real data — money identical to the halala for all 221 captains.

## 9 · Still not verified

- **The visual/interaction half of section 6** — the company-data lock actually hiding its 6 tabs,
  mobile search, and the tier ladder / ambassador counts on screen. Their behaviour is covered at
  the function level; how they LOOK with this code running is not. This is the last open item.
- **`no money deal is lost` passed vacuously** on your data: not one of the 352 profiles carries
  a salary, rent or fleet-cut value, so there was nothing for that check to protect. It starts
  protecting something the first time a deal is entered.

## 10 · Where perf still isn't ideal (not a regression — pre-existing, now visible)

`loadCourierProfiles()` JSON-parses the whole profile store on every call, and a Captains render
calls it several times per row (~0.3ms each, roughly 160ms of the 341ms). A parse cache would fix
it, but callers MUTATE the profile object they get back before saving, so caching introduces an
aliasing hazard in money code. Flagged rather than done — it needs its own think.
