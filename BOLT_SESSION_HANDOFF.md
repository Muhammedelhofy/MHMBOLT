# MOHM Fleet — Session Handoff (2026-06-02)

**For:** a fresh Claude chat continuing work on the MOHM Fleet dashboard.
**File:** `C:\Users\m7ofy\OneDrive\Documents\Claude\Projects\Bolt\index.html` (single-file app, ~8500 lines, JARVIS/M8 dark theme).
**Serve:** `serve.ps1` → http://localhost:3000. Also deployed on **GitHub Pages** (HTTPS). Data lives in browser `localStorage` per-origin; cloud sync is JSONBin via `?bin=<id>` URL param.

> Opening prompt for the fresh chat:
> "Read `BOLT_SESSION_HANDOFF.md` and your auto-memory (MEMORY.md → mohm-fleet-dashboard, m8-command-center, cloud-compression-codec), then continue."

---

## ✅ PRE-LAUNCH CODE AUDIT — done & verified against real data (2026-06-02)

Full money-math + data-integrity + UI audit before going live. Verified by reproducing each issue (synthetic seed in the throwaway preview origin) → fixing source → re-confirming, then a real-data cross-check via the user's bin (`6a07c8d7250b1311c358ce16`, 21 days 9 May–1 Jun 2026).

**Bugs found & FIXED:**
1. **Divergent monthly-net (money-misreporting).** Driver modal (`getMonthlyNet`) and Finance PnL (`computeDriverNetForPeriod`) computed a driver's monthly net differently and both undercounted — modal used exact case-sensitive name matching + unguarded sum; PnL did `if(!h.periodInfo) return` (silently dropped entries lacking periodInfo). Demoed: true 350 → modal 150, PnL 100. **Fix:** one canonical `sumDriverNetForMonth()` + `entryInMonth()` (~line 1578) both now delegate to — periodInfo-independent, `driverKey` case-insensitive, `sN` NaN-safe, `Array.isArray` guarded; `getDriversInMonth` aligned. See [[mohm-fleet-dashboard]].
2. **Transfer status on a malformed date** mislabelled any negative as REVERSED (NaN bypassed both window guards in `computeTransferStatus`) → now bails to neutral PENDING + skips corrupt log keys.
3. **`getHistory()` drivers-array invariant guard** added — a legacy/corrupt entry missing `drivers` used to crash any `h.drivers.find/.map` (the "no voice"/blank-render class). One guard at the read chokepoint protects all ~30 call sites. See [[cloud-compression-codec]].
4. **`openModal` tier access** `d.tier?.englishName` (cheap insurance at the modal open-point).

**Verified CORRECT (no change):** PnL FLAT/PCT fleet-cut + IN/OUT signs; Net Transferred = gross−reversed; `aggregateDriverRows`/`buildAggregatedDrivers` sums+averages; cloud codec lossless for all 36 displayed/money fields; `mergeHistories` newer-wins; CSV parse path + >24h guard + replace-by-period; `captainView` state machine (not persisted, valid literals); sort state (all 10 keys); empty-data & single-day rendering across all views. **Real-data cross-check: all 22 May drivers agree across modal / PnL / raw hand-sum (fleet May net 21,062 SAR).**

**⚠️ One thing for the user to confirm (NOT changed):** `n()` (`parseFloat`) would mis-parse a number with a thousands separator (`"1,234.50"`→`1`). Totals have been correct, so Bolt almost certainly exports plain decimals — glance at one raw CSV to be sure before relying on it for larger numbers.

**Remaining to go live:** push `index.html` to GitHub Pages (`muhammedelhofy.github.io/MHMBOLT`) + hard-refresh (Ctrl+Shift+R) to bust cached JS — fixes have NO effect on the live site until pushed.

---

## 1. What was fixed this session (DONE, verified)

### Finance — Payment Transfer Log (working)
- **Total now nets out reversals.** "Total Transferred" was counting clawed-back money; renamed to **Net Transferred** = gross − reversed, with a `gross X · reversed −Y` caption. (`renderFinanceTransferView`, ~line 6790.)
- **Reversed transfers render correctly** — a reversed positive shows red + struck-through with a clear note, instead of a healthy green "+".
- **Roster-integrity flag** — `driverFirstSeenMs(name)`: if a transfer is recorded on a date *before* that driver ever appears in history, the row shows an amber "⚠ No fleet activity until … — verify this date/CSV". This addresses the "9 May shows 4 drivers who joined later" concern (root cause is almost certainly a multi-day/cumulative CSV saved under one date).

### M8 command center — TYPED + CLICK paths (working great, keep these)
- Smart box `#m8Smart` + chips (Fleet Briefing / Top Driver / Below Target) + driver cards all work when typed or clicked.
- **Driver performance cards** — `m8DriverPerf(name, scope)`: typing/saying a captain's name shows an inline card (Net/Orders/Hours/Avg-day) with **Yesterday / This Month / Last Month / All Time / Full Dossier** chips. Remembers the driver (`m8Context.driver`) so "this month"/"last month" re-scope the same person. Verified math.
- **Parser robustness** — fixed `\b(prefix)\b` regex bug (so "analytics/settings/hours/orders/earnings" match), wake-word stripping, "yesterday report" no longer hijacked by briefing, and `findDriverByVoice` hardened against malformed history entries (a missing `drivers[]` array used to crash the whole parser).
- Three-layer `parseVoiceCommand` chain: base (~2785) → data-query (~4300) → outer (~8290). Outer runs first. See memory `m8-command-center.md`.

---

## ✅ RESOLVED 2026-06-02 — M8 voice = push-to-talk (Option B)

User chose **Option B**. The whole always-on wake-word subsystem was deleted (`m8WakeWordHit`, `startWakeListener`/`stopWakeListener`, `m8ToggleAlwaysListen`, `m8UpdateWakeToggleUI`, `m8InitWake`, `wakeRecog`/`m8AlwaysOn` globals, `m8_always_listen` flag, the `#m8WakeToggle` button, the `#m8MicDbg` line). There is now ONE recognizer run as a single pass: `m8RestartListen` is `continuous=false` with no `onend` re-listen loop — listens once, dispatches, stops the mic. The orb still greets + opens + fires one pass; a new **🎙 Speak** button (`#m8TalkBtn`) fires another pass without closing. This removes the dual-recognizer abort loop entirely. Verified: zero console errors, open/close clean. **§2 and §3 below are now historical.**

---

## 2. (HISTORICAL) M8 VOICE — the unresolved problem (user is OK shelving this)

**Symptom:** spoken commands/names don't work; wake word ("Hofy"/"M8") doesn't summon.

**Root cause (confirmed via on-screen `#m8MicDbg` diagnostics):** the browser `SpeechRecognition` API only allows ONE recognizer on the mic. M8 ran TWO — a background **wake** recognizer and the **command** recognizer — which abort each other in an endless `error: aborted` loop, so nothing is captured. Arabic/Saudi name transcription under `en-US` STT is also poor.

**What was tried (all in the file now):**
- Command recognizer switched to `continuous=true` (no start/stop churn). ✅ command side now reaches "listening (mic live) — speak now".
- Hard mutual exclusion: `startWakeListener` bails if `voiceRecog || m8WakeMode || m8PickerOpen()`; `m8RestartListen` calls `stopWakeListener()` first; abort backoff 1000ms.
- Live diagnostics: `#m8MicDbg` line at panel bottom + `m8Dbg()` + console `[M8]` on every recognizer event; `m8MicCheck()` probe.

**Still failing:** user's latest logs show the **wake recognizer still abort-loops** ("wake: listening → aborted") even with the picker open — the mutual exclusion isn't fully holding for the always-on wake path, and an always-on mic is bad for battery/UX anyway.

---

## 3. (HISTORICAL — DECIDED: Option B) pick a voice direction

- **Option A — Remove voice entirely.** Delete the wake listener + command recognizer + diagnostics; keep the typed smart box, chips, and driver cards (all reliable). Cleanest. M8 becomes a fast typed/click command center.
- **Option B — Single push-to-talk (RECOMMENDED).** No wake word, no auto re-listen loop. Clicking the orb does ONE recognition pass (greet → listen once → act → stop). This removes the dual-recognizer abort loop entirely while keeping voice as a bonus. Reliable; mic only on during the one pass.
- **Option C — Keep debugging always-on.** Not recommended — browser wake-word support is inherently flaky and Arabic-name STT is weak.

**To implement A or B, the relevant functions are:** `toggleM8`, `showM8Picker`/`hideM8Picker`, `m8RestartListen`, `startWakeListener`/`stopWakeListener`/`m8ToggleAlwaysListen`, `m8Greet`, `m8HandleVoiceCmd`. For B: drop the wake recognizer and the `onend` re-listen loop; make `m8RestartListen` fire once (no restart), keep `m8HandleVoiceCmd`. Remove the HANDS-FREE toggle UI (`#m8WakeToggle`) and the `#m8MicDbg` line once stable.

---

## 4. Open finance follow-up (not yet done)
- Confirm the **9 May transfer-log anomaly** with real data: open Finance → Transfer Log → 9 May; any driver who joined later now carries the amber roster-integrity flag. If present, re-upload that data as **single-day** CSVs (the >24h guard nudges toward this). The reversal-pairing window is left at 3 days per user's spec.

## 5. Data / deploy notes
- GitHub Pages is a new origin → starts with empty localStorage. Restore via `…github.io/<repo>/?bin=<BIN_ID>` then Pull. Cloud is capped (~1 month); 9 May→today fits.
- **Foreign-name voice/search needs `khair_name_mapping` loaded** — verify it's present on the GitHub origin (Settings), else foreign names like "Ayman" can't resolve to the Saudi account holder.
- Mic permission only persists on secure origins (https / localhost), not `file://`.
