# Bolt dashboard — IDENTITY UNIFICATION (next session kickoff)

**Model / Effort:** **Opus · max effort.** Fable is not available. Give it a full session with
nothing else queued — this is a drift fix on money-critical code with many call sites, not a
patch. Do NOT attempt it at the end of a long session.

**Repo:** `MHMBOLT` — `C:\Users\m7ofy\dev\Claude\Projects\Bolt`, single file `index.html`
**Branch off `origin/main`** into a worktree (`Bolt-wt-identity`). `main` is at Build-194.
**Prod:** https://mhmbolt.vercel.app (push to main auto-deploys — needs his explicit OK).

---

## 1. The problem, in one sentence

**The dashboard identifies captains three different ways, and two of them are wrong.**

| Layer | Keys on | Result with two captains sharing a name |
|---|---|---|
| Captains tab | **raw `d.name` string** (case-sensitive) | 2 rows if the spelling differs, **1 merged row if identical** |
| Finance / P&L | **`driverKey(name)`** (normalised) | **always 1 row — both people merged** |
| Profiles / blocks / ambassador | **identity** (`ph:<9>` / `id:<uuid>`) | correctly separate |

Bolt already gives us the right answer: every captain carries a stable `driver_uuid` that never
changes. **His instruction (2026-07-29): the Bolt main dashboard is the final reference for
driver identity.** The fix is to make the whole app key on that.

## 2. Proof it is real — measured on live July 2026 data

Four same-name pairs, each two DISTINCT Bolt uuids. Finance collapses each pair into one row
AND de-dupes by day, so money is **dropped**, not just merged:

| Name | Finance shows | Actual (per uuid) | Missing |
|---|---|---|---|
| Turki Aldawsari | 1,573 | 1,901 + 181 = **2,082** | **−509** |
| Meshari Alanazi | 2,519 | 2,304 + 425 = **2,729** | **−210** |
| Mohammed Alsubaie | 4,927 | 5,163 | −236 |
| Khalid Asiri | 158 | 171 | −13 |

Understated driver net feeds the tier band, the Bolt bonus and the P&L — so this is a money bug,
not a display bug. The Captains tab is currently CORRECT (each row carries its own uuid + phone).

The four pairs, for use as fixtures:

| Name | Person A (uuid / phone) | Person B (uuid / phone) |
|---|---|---|
| Meshari Alanazi | `c3e33201…` / 539708036 (Menna) | `b0f1545a…` / 501538495 (Engy) |
| Turki Aldawsari | `d0bae47e…` / 557299821 | `a07cd173…` / 581788152 |
| Khalid Asiri | `0a47be95…` / 546583867 | `90181c43…` / 559660777 |
| Mohammed Alsubaie | `33e2387b…` / 542720081 | `a90589ca…` / 508846337 |

## 3. What must change

**Goal: one identity space, anchored on `driver_uuid`, used by every layer.**

1. **`getDriversInMonth(monthKey)`** — return **identities**, not names. Today it does
   `map.set(driverKey(d.name), d.name)`, which is the collapse.
2. **`computeDriverPnL(name, monthKey)`** — take an identity (or `{name, driverId, phone}`),
   not a bare name. Thread through `computeModelRollup`, `computeExecMonth`, the Finance
   courier table, exports and the EOM report.
3. **`sumDriverNetForMonth` / `computeDriverNetForPeriod`** — match on identity. The current
   name-match plus per-period de-dupe is what silently drops a day when both worked it.
4. **Captains table** — key `map` by identity instead of raw `d.name`, so an identical spelling
   no longer merges two people (it only escapes today because the casing differs).
5. **Overrides** (`khair_courier_overrides`) are keyed `driverKey(name)+'::'+monthKey` — same
   collapse. Re-key to identity.
6. **Labelling** — prefer `id:<uuid>` over `ph:<9>` as the canonical profile key. Phones change
   routinely in this fleet (his words), and Build-191 already excludes any phone seen on 2+
   uuids, so a captain's key can drift when old rows age out of the 80-day cloud window.
   **This is the piece with a clock on it.**

## 4. Migration — the hard part, do not skip

All 352 stored profiles are `ph:`/`nm:` keyed. Re-keying to `id:` orphans every one of them
unless migrated. Requirements:

- One-time, **idempotent**, reversible; snapshot to `fleet_data_backup` before writing.
- Map each existing `ph:<9>` / `nm:<name>` profile to the uuid that carried it, using history.
- **Never guess.** Where a name maps to 2+ uuids (the four pairs above), do NOT auto-assign —
  surface them for him to resolve. He has already answered Meshari: 539708036 = Menna Mahmoud.
- `mergeStampedByKey` is newest-wins per key, so a migrated cloud copy needs a `_t` strictly
  greater than the local one or the old local record wins the next pull.

## 5. Known traps (all cost time today — do not rediscover)

- **`mergeStampedByKey(cloud, local)` uses `lt >= ct ? local : cloud`** — local wins ties.
- **34 profiles carry `_t` timestamps in the FUTURE** (up to 2038-07-09), written by a device
  with a wrong clock. Those records can never be beaten by a present-day edit, so **edits to
  those captains silently revert on the next pull.** Clamp them as part of this work
  (🔴 flagged to him 2026-07-29, not yet authorised).
- **Cloud holds ~80 days; a browser holds up to 400.** Any identity that depends on an old row
  breaks on a cloud-only browser sooner than on his.
- **The Settings panel is DETACHED from the DOM while the company-data lock is engaged**
  (Build-186). Anything rendering into it must null-guard — an unguarded write threw inside
  `fetchFromCloud` and killed the boot chain (fixed in Build-193). Re-check this for any new
  Settings UI.
- `computeRosterForMonth` has a **current-tick cache** (Build-190). It cannot go stale across
  renders, but don't add a longer-lived cache without a dependency story.
- **`api/` is at exactly 12 files = the Vercel Hobby cap.** A 13th silently fails the deploy.
- **A direct write to `fleet_data` in Supabase does NOT survive.** `syncToCloud` pushes the
  WHOLE local `khair_courier_profiles` blob, so the next push from his browser replaces
  anything written server-side (this happened 2026-07-29: two restored tags were wiped by his
  next Pull/push cycle). **The browser is the source of truth in practice** — repairs must run
  IN the dashboard (a migration button) or be made by hand in the UI, never by SQL.
- **`dkDataConflicts()` (Build-194) already detects twins / unreadable / frozen profiles** and
  feeds the Today + Captains alert rails. Reuse it as the migration's "needs a human" list
  rather than writing a second detector; retire the twin check only once Finance is identity-keyed.

## 6. Acceptance criteria

1. Each of the four pairs shows as **two separate rows in Finance**, with the per-uuid net
   above (Turki 1,901 / 181, Meshari 2,304 / 425, etc.) — and the **sum matches the Captains tab**.
2. Editing one twin's profile never changes the other's — assert on all four pairs.
3. No profile is orphaned by the migration: every profile with a real setting resolves to a
   live captain, or is explicitly listed for him to resolve.
4. A captain who **changes phone** is still ONE person (regression guard for Build-191).
5. Full regression of Builds 186-193 still passes — the lock, the ambassador count == rows,
   the tier ladder pinned to Bolt's floors, the closed-month split honouring a per-driver %,
   mobile search, and the render timings (Captains ~219ms, Today ~51ms).
6. Verified on **prod against real data**, not only locally. Today's lesson: a fix passed every
   local test and still failed on prod because localhost had seeded history the real browser
   lacked.

## 7. Open questions for him

1. For **Turki Aldawsari, Khalid Asiri, Mohammed Alsubaie** — which twin owns the existing
   ambassador tag? (Meshari already answered: 539708036 = Menna.)
2. Authorise clamping the **34 future timestamps**?
3. Should a same-name pair be visually flagged in the UI (e.g. a phone suffix beside the name)
   so the team can tell them apart at a glance?
