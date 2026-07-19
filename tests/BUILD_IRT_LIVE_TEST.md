# Build-IRT — Invoice-rate transparency (DISPLAY-ONLY) · live test

**What shipped:** the 4k/5k/6k tier drills now read as English. Every tier-drill row gains a
small secondary line `Nd · rate/d · ≈bonus SAR`, rows whose month-end **landing** can't reach
the pill's floor get a `⚠`, drill headers say **"Paid at Nk rate (Bolt invoice)"**, and the
tier ladders on Command Center + Today show a **dual count** (paid-at-rate vs landing).

**No money math changed.** The bonus number is read from the existing `bonusForDriver().gross`
(never recomputed); the landing is read from `computeRosterForMonth`'s own per-driver `proj`
(the exact number Analytics shows). `boltTier` / `_tierClassify` / `bonusForDriver` /
`computeRosterForMonth` are untouched.

## How to run
1. From the worktree: `$env:PORT=3022; powershell -ExecutionPolicy Bypass -File serve.ps1`
2. Open `http://localhost:3022/`
3. Press **⇩ PULL** to load real cloud data (human step — the page boots empty).
4. Go to the **Command Center** tab (the Star Map deck).

## Test 1 — the confusion case (Abdulrahman, the reason for this build)
Driver **ABDULRAHMAN ALSHAHRANI**: banked 250 SAR, worked exactly **1 day** this month.

- **Command Center → Tier ladder → click the 6K segment** (or the "6K" pill count).
  - Header reads: **`Paid at 6k rate (Bolt invoice) · N · Jul 2026`** (not "6k tier").
  - His row shows the **6K** pill (his invoice RATE — money-truth) with net `250`.
  - Directly under his name: **`1d · 250/d · ≈83 SAR ⚠`**
    - `1d` = worked days (`daysWorkedForMonth`), `250/d` = income ÷ days, `≈83 SAR` = the
      gross Bolt prorates for a 1-day 6k-pace driver (6k tier gross 2,500 ÷ 30 = 83).
  - **Hover the ⚠** → tooltip: **`rate tier only — won't bank 6,000`**
    (his calendar landing ≈ a few hundred SAR — physically can't reach 6,000 this month).
- **Verified by executing the real helper logic** (node harness, real `boltTier`/`bonusForDriver`):
  `{"line":"1d · 250/d · ≈83 SAR ⚠", "warn":true}`, tooltip "won't bank 6,000". ✓

## Test 2 — positive control (Saed must NOT get a ⚠)
Driver **SAED FARES**: banked **5,913** SAR. Bolt pays his full 5k tier (2,000 beats a prorated
6k), so the **invoice engine files him under 5k** — but the calendar engine says he lands ~9,600 (6k).

- **Command Center → click the 5K segment.**
  - He appears in the **5k** drill with a filled **5K** pill (banked 5,913 ≥ 5,000).
  - Secondary line: **`Nd · rate/d · ≈2,000 SAR`** (2,000 = his real 5k-tier gross).
  - **NO ⚠** — he WILL bank past 5,000 (he lands 6k), so the row must be clean.
- **Verified via harness:** `{"line":"20d · 296/d · ≈2,000 SAR","warn":false}`,
  `bonusForDriver(SAED).tierFloor === 5000`. ✓ (He stays in the 5k drill without a warning.)

## Test 3 — dual counts on the tier ladders (current month)
- **Command Center → Tier ladder chips** read: **`12 paid at 6k rate · 9 landing`** per tier
  (numbers illustrative). "paid at rate" = Bolt invoice engine (== the bar); "landing" = the
  calendar engine (Analytics) count that actually lands in that band this month.
- **Today tab → under the 6K/5K/4K pills**, a light line: **`paid at rate above · landing: 6K 9 · 5K 7 · 4K 5`**.
- When the two numbers disagree, that's the invoice-rate-vs-landing gap made visible — the ⚠
  in the drill names exactly which drivers cause it.

## Test 4 — closed month degrades gracefully (Jun 2026)
Jun has an imported Bolt invoice (`boltBonusMonth('2026-06') != null`), and its daily uploads may
be incomplete.

- Switch the deck month to **Jun 2026 → click a tier segment**.
  - Rows show the **exact invoice gross** (e.g. `1,500 SAR`) — **NO** `Nd · rate/d`
    (days would be wrong from partial dailies) and **NO ⚠** (a closed month has no days left to land).
  - Tier ladder chips show only **`N paid at 6k rate`** — no "landing" number (nothing left to land).
- **Verified via harness (injected invoice):** `{"line":"1,500 SAR","warn":false}`. ✓

## Both themes
The secondary line uses `--dk-dim`; the ⚠ uses `--dk-warn`. Toggle the deck light/dark theme —
both must stay legible (no hardcoded hex).

## Symptom → root cause
| You see… | It means… | Not a bug because… |
|---|---|---|
| `days shows 0` / no `Nd · rate/d`, only `≈bonus` | no daily uploads for that driver that month | `daysWorkedForMonth` counts distinct daily-upload periods with net>0; 0 uploads = 0 days. The pill/bonus still come from the monthly total. |
| a `⚠` on a driver with a filled (banked) pill | he banked past the floor already | shouldn't happen — a filled pill means banked ≥ floor, and landing ≥ banked ≥ floor. If seen, check the driver appears in `computeRosterForMonth`'s roster (a "left the fleet" earner falls back to net-only landing). |
| `≈bonus` differs from the Finance invoice on a closed month | Finance reads the imported invoice; an open month's `≈` is the pace estimate | open months have no invoice yet — the `≈` prefix flags it as an estimate; closed months show the exact invoice gross (no `≈`). |
| 6k drill count ≠ "landing" count | the two ENGINES disagree (invoice rate vs calendar landing) | by design — that gap is the whole point of this build; the ⚠ rows explain it. |
| Saed-class driver in the 5k drill, not 6k | Bolt's invoice pays his full 5k (2,000) over a prorated 6k | `boltTier` = MAX(full-tier, prorated-pace-tier); when banked-tier wins, he's filed there. His landing (6k) shows in the dual count, no ⚠. |

## What was verified vs not
- **Verified live:** page boots on `http://localhost:3022/` with **zero console errors** (real browser).
- **Verified by executing real logic:** `node --check` on the extracted script (SYNTAX_OK) + a
  harness running the **verbatim** helper source against the real `boltTier`/`bonusFor`/`bonusForDriver`
  and real tier values — all three cases (Abdulrahman ⚠, Saed no-⚠, closed-month gross) matched exactly.
- **Not driven live with real fleet data** (the PULL step needs a human, and the app script is
  module-scoped so its functions can't be poked from the devtools console). The renders above are
  the expected output; confirm visually after PULL.
