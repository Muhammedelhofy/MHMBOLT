# Bolt Dashboard — Command Center + Today actionability

**Branch:** `bolt-command-center` (off `origin/main` @ `21a422d`) · **File touched:** `index.html` **only**
**Model/Effort:** Opus · high · **Date:** 2026-07-07
**Scope:** UI-only. Reuses the existing engines (`computeRosterForMonth`, `smTierDetail`/`_tierClassify`, `tierStatusFor`, `ambassadorRollup`, `dkOpenDriver`) — **recomputes nothing, touches no cron / sync / finance math.**

---

## What shipped — two parts

### (a) Today — the six stat cards are now clickable drills
The top stat strip in `renderToday()` was display-only. Every card now drills to **its own driver list → each row opens the A1 driver panel (`dkOpenDriver`)**, reusing the Star Map list-overlay pattern (a body-level `dkListOverlay` in the same `.sm2-ov-*` visual language). A small `▸` affordance marks a clickable card; a card whose number is 0 stays inert (no empty drill).

| Card | Drills to | Source |
|---|---|---|
| **Fleet Net** | Active this month (drivers earning, by net) | `R.current` not-idle/not-blocked |
| **Proj. Company Bonus** | Bonus contributors (by company bonus) | `d.companyBonus > 0` |
| **Tier ladder** (4 pills) | Each band → its drivers | `smTierDetail(month)` (== Finance) |
| **Needs a push** | Idle + below-4k-pace | `d.idle` + `d.band===0` |
| **Blocked** | Live-suspended drivers | `liveBlockedKeys()` via roster `d.blocked` |
| **Active · latest day** | That day's active drivers | latest history day (`hoursOnline\|orders > 0`) |

Each list row shows **name + tier pill + the key info** (net / why-flagged, e.g. *"idle · no trips"*, *"below 4k pace · 660"*). The alert-row drills and the domain cards below the strip are **unchanged** (as instructed).

### (b) Star Map → **Command Center** — Muhammad's daily strategy deck
- **Renamed** "Star Map" → **"Command Center"** (tab label + deck header + tooltips).
- **SM-1 passcode DELETED** (not bypassed): the `showTab` gate, `_starmapUnlocked` flag, the entire Cerebro lock JS (`openCerebroLock`/`_cerebroSubmit`/…), the `#cerebroOverlay` markup, and all `.cbr-*` / `#cerebroOverlay` CSS are gone. The tab now opens instantly like any other.
- **D-3 REVERSED** — it now HAS driver lists + drill on every aggregate:
  - **Bonus-projection hero promoted to the top** (full-width, first card under the timeframe) — the strategy headline. Stat strip + tier ladder follow.
  - **"Ambassadors working" panel** (reframed leaderboard): per ambassador → drivers brought · active% · fleet-net MTD · incentive MTD · slipping flag (all from `ambassadorRollup`). **Row click → the names behind the number** (that ambassador's drivers → A1), with a footer link out to the full Ambassadors tab.
  - **Drill-to-names on every aggregate:** tier-ladder segments (already), **funnel ACTIVATED + EARNING stages (new)**, TIERED, and the ambassadors panel all open the driver list → A1. `smLadderDrill` gained `activated` / `earning` kinds.
- Kept all **5 instruments** (tier ladder · funnel · ambassadors · bonus hero · growth), the month/ALL-TIME selector, and the trust-only alert rail.

### Follow-up (2026-07-07) — tier-band drill pills now show the BUCKET's tier
Band drills (Today's 4 tier pills + Command Center's `6000`/`5000`/`4000`/`below`/`tiers`) previously rendered each row's pill from the driver's **banked net-band** — naturally `<4K` early in the month, so clicking "6K 18" showed `<4K` pills. Now every row shows the **tier the `smTierDetail` bucket represents** (6K→6K, 5K→5K, below→<4K), **filled if banked ≥ floor, hollow if only on pace** (same semantics as `dkDriverTierPill` and the tier-ladder chips). For a closed/invoiced month every row is filled; for the live month they're hollow (on pace). Verified in the DOM: Today 6K drill → 4× `dk-tier t6` "6K", 5K → 2× `t5` "5K", below → 3× `t0` "<4K"; Command Center `tiers` → 4× "6K" + 2× "5K", each name tagged with its own bucket.

---

## Self-verification (seeded fixture, both themes, zero console errors)

Verified on the served worktree (`localhost:3021`) with a 10-driver / 6-day Jul-2026 fixture. Every drill's row count equals the engine's own number (consistency, not hand-count):

| Today drill | Rows | Command Center drill | Rows |
|---|---|---|---|
| Active this month | 8 = active | Activated (roster) | 10 = roster |
| Bonus contributors | 6 = tiered | Earning this month | 9 = not-idle |
| Needs a push | 3 = idle 1 + slow 2 | On a tier (4k+) | 6 |
| Blocked | 1 | 6k tier | 4 |
| Active · 06 Jul | 9 | Idle / Blocked | 1 / 1 |
| 6k / 5k / 4k / <4k | 4 / 2 / 0 / 3 | Ambassador Engy / Khaled | 4 / 4 drivers |

- **A1 end-to-end:** clicking a drill row closes the overlay and opens the driver modal (`modalOverlay`/`modalPanel` visible) scoped to the month. ✓
- **Command Center opens instantly** (no Cerebro prompt); deck title reads "Command Center"; `openCerebroLock`/`_starmapUnlocked` are `undefined`. ✓
- **Bonus hero renders above the stat strip.** ✓
- **Light + dark themes** both clean (overlay + deck legible in each). ✓
- **Console:** zero errors across Today, Command Center, and every drill.

---

## Prod verification — grep markers

After deploy, confirm the served `mhmbolt.vercel.app` HTML actually updated (the webhook has silently missed pushes before):

**Must be PRESENT**
```
>Command Center</div>
function todayStatDrill
function dkListOverlay
function smAmbassadorDrill
Ambassadors working
smLadderDrill('activated')
```
**Must be ABSENT** (passcode fully removed — gate, JS, overlay, CSS)
```
openCerebroLock
_cerebroSubmit
cerebroOverlay
_starmapUnlocked
```
> Note: the literal `7ofy` still appears **4×**, but only in removal-documentation comments — there is no functional `=== '7ofy'` check left. Grep for `_cerebroSubmit`/`openCerebroLock` (= 0) to confirm the gate is gone, not for bare `7ofy`.

Suggested one-liner:
```
curl -s https://mhmbolt.vercel.app/ | grep -c "todayStatDrill\|Ambassadors working\|Command Center"   # expect >= 3
curl -s https://mhmbolt.vercel.app/ | grep -c "openCerebroLock\|_cerebroSubmit\|cerebroOverlay"        # expect 0
```

---

## Orientation — what this touched

| Piece | Status | Touches live? |
|---|---|---|
| Today stat-card drills | 🎮 UI-only, additive | No |
| Command Center rename + layout | 🎮 UI-only | No |
| Passcode removal | 🎮 deletion only | No |
| Ambassadors-working drill | 🎮 reuses `ambassadorRollup` | No |
| Cron / sync / finance math | untouched | — |

🔴 **On you:** deploy is gated on your explicit OK (main auto-deploys prod). After OK + deploy, I'll self-verify against the served HTML with the markers above.

**Deliverables:** this report + `tests/BOLT_COMMAND_CENTER_LIVE_TEST.md` (live-chat checklist).
