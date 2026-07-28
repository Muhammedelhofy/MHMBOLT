# Build-186 — Company-data lock (handing the dashboard to ops agents)

**Model/Effort:** Opus 5 · high
**Date:** 2026-07-28
**File touched:** `index.html` only (+268 / −24)
**State:** built + live-verified on `localhost:3029`. **NOT committed, NOT deployed** — deploy needs Muhammad's explicit OK.

## Why

The dashboard is being handed to ops agents to track **driver performance**. It also carries
company money: P&L, profit projections, the Bolt-bonus split with Partner B, referral payouts,
per-driver cost deals, and the Supabase credentials in Settings. Agents must see the first and
none of the second.

## What was built

One switch — `fleetUnlocked()` — drives two mechanisms.

### 1. Locked tabs (never render while locked)

`finance` · `ambassadors` · `incentives` · `analytics` · `starmap` (Command Center) · `settings`

Clicking one opens the passphrase prompt; the panel's render function is **never called**, so its
HTML never enters the DOM. A CSS blur was deliberately rejected — it leaves the real numbers in
the page source.

`showTab()` is the single chokepoint. Every deep link in the app navigates by clicking a `.tab`
(`todayGo` / `todayDrill` / `todayGoExec`), so gating there gates all of them. The per-tab render
calls that used to hang off the tab `onclick`s (`showTab('analytics',this);renderAnalytics()`)
moved **into** `_doShowTab` — otherwise the trailing call would still have rendered the locked
tab after `showTab` refused to open it. `analytics` and `pipeline` were missing from
`_doShowTab`'s dispatch and are now there.

### 2. Settings needed extra handling

Settings is the one locked tab whose markup is **hand-written into the page**, not JS-rendered.
Gating the tab was not enough: `initSettingsUI()` → `renderSbStatus()` populates
`sbUrlInput` / `sbKeyInput` / `dashSyncKeyInput` with the real Supabase project URL and anon key,
leaving them in the DOM of a `display:none` panel. So while locked, `applySettingsLockState()`
lifts the panel's children into an off-document fragment. Every function touching those fields is
null-guarded and `getElementById` cannot see detached nodes, so nothing throws and nothing
populates. `saveSettings()` reads them unguarded, but its only callers are Save buttons *inside*
the panel — detached, they cannot be clicked.

### 3. Money stripped from the tabs that stay open

Driver net, tier bands, idle/pace/acceptance signals all stay — that is performance, and per the
income model a driver's net is **the driver's money**. What is withheld is the company's cut.

| Site | Locked shows | Unlocked shows |
|---|---|---|
| Captains deck stat | (stat omitted) | `Proj. company bonus +3,750 SAR` |
| Today deck stat | (stat omitted) | `PROJ. COMPANY BONUS` |
| Today DO-NEXT price tag | `→ 6k tier` | `+1,250 SAR` |
| Today "easy wins" bulk line | `1 × Easy tier wins` | `… = +1,250 SAR` |
| Today Money card row | (row omitted) | `Proj. company bonus +3,750` |
| Today tier-slip flag | `tier slip 5k→4k` | `… · −250 SAR bonus at risk` |
| Blocks strip stat | (stat omitted) | `Bonus at stake … SAR` |
| Blocks per-driver column | `16d · days blocked` | `−1,250 SAR · bonus at stake` |
| Blocks tier-pill tooltip | `was pacing at the 5k tier before the block` | `~1,250 SAR company bonus at stake` |
| Chase list (WhatsApp text) | `→ 6k tier` + no 💰 total | `(bonus +1,250)` + `💰 Company bonus within reach: +1,250 SAR` |

In every case the underlying number still **ranks** the queue (urgency ordering is the useful
part and reveals nothing) — only the printed amount is withheld.

`todayStatDrill('bonus')` is also guarded at the entry point, so no stale handler can reach the
per-driver company-bonus contributor list.

## Session model

- Passphrase stored as a salted digest (`LOCK_DIGEST`), so the literal is **not** in the file.
- Grant in `localStorage.boltFleetLock` = `{until: <epoch ms>}`, 7 days (`LOCK_DAYS`).
- Header chip: `🔒 Company data locked` ⇄ `🔓 Unlocked · 7d`. Clicking it while unlocked
  **re-locks immediately** (and retreats off a locked tab) — what you click before handing the PC over.
- Fails **closed**: missing, corrupt, expired, or type-spoofed grant all read LOCKED.

## ⚠ Honest scope

This is a **viewing gate, not a security boundary.** The underlying data lives in this browser's
localStorage; anyone with devtools, the CSV exports, or this file can still reach it. It stops an
agent *using* the dashboard, not one *attacking* it. Real enforcement would need the numbers to
live behind a server that refuses to send them — a different build.

(This restores and widens the `7ofy` Cerebro gate that SM-1 removed on 2026-07-07, for the
opposite reason: the PC is no longer only Muhammad's.)

## Live verification (localhost:3029, synthetic fleet data)

All checks passed:

- `_lockHash('7ofy') === LOCK_DIGEST` ✓ · wrong passphrase → `false` ✓ · literal absent from source ✓
- All 6 locked tabs clicked while locked → panel never activated, active panel stayed `today`,
  prompt opened with the right tab name ✓
- Open tabs (Captains, Blocks, Onboarding) clicked while locked → opened normally, no prompt ✓
- Wrong passphrase → `Wrong passphrase.`, still locked, prompt stays open ✓
- `7ofy` → unlocked, 7 days, prompt closed, **landed on the pending tab**, chip green, 🔒 marks gone ✓
- Lock-now → locked, retreated to `today`, grant removed ✓
- Expiry: `until` 1 day past → locked · 1h future → unlocked · `'{not json'` → locked ·
  `{until:'forever'}` → locked · absent → locked ✓
- Grant survives a page reload; Finance then opens with no prompt ✓
- Settings with a planted Supabase key: locked at boot → panel 0 chars, `sbKeyInput` **not in the
  document**; unlocked → panel back (18,155 chars) with the key in the field; re-locked → gone ✓
- After unlock, Settings opens with all 20 fields populated ✓
- Money table above verified by rendering each tab locked vs unlocked and diffing ✓
- No JS console errors (the only console errors were 401s from the deliberately fake test key)

## Known friction to decide on

Two Today domain-card rows — `Idle · no trips` and `Working below 4k pace` — deep-link via
`todayDrill()` into the **Analytics** tab, which is locked. An agent clicking them gets the
passphrase prompt.

There is already a working alternative that needs no unlock: the **NEEDS A PUSH** stat in Today's
top strip opens the same idle + below-pace list as an overlay (`todayStatDrill('needspush')`).

If that friction matters, the fix is to repoint those two rows at the overlay instead of the tab.
Not done — it changes behaviour beyond what was asked.
