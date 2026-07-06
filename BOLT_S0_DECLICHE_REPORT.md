# Bolt Dashboard FINALIZE — S0 (De-cliché sweep + global chrome)

**Date:** 2026-07-06 · **Session:** Opus · high · **Branch:** `bolt-finalize-s0` (off `claude/finalize-design`)
**Status:** ✅ built + verified on the :3017 preview (real Supabase data, zero console errors). **NOT merged — awaiting Muhammad's deploy-OK.**

S0 is the first rung of the S0–S7 ladder in `BOLT_FINALIZE_TAB_SPECS.md`, executed with the
`BOLT_DASHBOARD_FINALIZE_BRIEF.md` DECISION OVERRIDES applied (brief wins over Fable's spec).

---

## What changed — `index.html` only (net −2,356 lines: 95 in / 2,451 out; 15,783 → 13,427)

### 1 · De-cliché kill list (§8) — the visible AI-clichés are gone
Removed HTML + CSS + JS for: the embedded **M8 orb** (jarvis, neural/wave canvases), **ambient orbs**,
the animated **grid overlay**, **holographic particles**, **KPI number-scramble**, **M8 pulse rings**,
**upload scan beam**, **warp** overlay, **biometric-scan** overlay, **data-ingestion** overlay + `#di-*`,
the **EKG boot trace**, driver-row **HUD scan lines**, summary-card **3-D tilt / corner-glow**, and the
**glitch** flash. The upload path no longer fires `triggerGlitch`/`triggerWarp`/scan-beam.

### 2 · Embedded M8 assistant removed (arch-review C6 + brief #10 = REMOVE)
The dashboard stops embedding M8 (it lives on as its own product). Deleted the whole self-contained
island — command picker, voice engine (recognition, matching, `parseVoiceCommand`/`executeVoiceCommand`
+ their extensions), data-query engine, fleet/week/driver **briefing generators**, the **cortex report
panel**, and the M8 finance views. Verified it was a closed island (no external callers) before excision.

### 3 · Captains **RADAR** sub-view removed (spec #9)
Deleted the `captainView==='radar'` branch, `#radarCanvas`, the tactical-radar render/animation, and the
`◎ RADAR` toggle button. **By Captain / By Day / Compare Days kept.** Driver rows still open the panel:
`bioScanThenOpen` is now a thin pass-through to `openModal` (the scan flourish is gone, the behaviour isn't).

### 4 · Fonts → IBM Plex superfamily
`Inter` + `Share Tech Mono` **dropped** from the Google-Fonts request and every usage. `--sans` = IBM Plex
Sans, `--mono` = IBM Plex Mono, and `[lang=ar]` already swaps to IBM Plex Sans Arabic (from the DECK block).
`font-variant-numeric: tabular-nums` pinned on `body`.

### 5 · Global tokens re-based to the DECK palette (dark)
Legacy `:root` surfaces/text/border/signals re-based onto `BOLT_DESIGN_SYSTEM.md` §2 values (deck floor
`#0F1318`, surface-1 `#161C23`, text ramp, `--warn #FFB020`, cyan demoted to info-blue `#58A6FF`). **All
glows removed** (`--glow-green`/`--glow-cyan`/`--shadow-sm` → none) so legacy tabs share the deck floor
with the DECK tabs and switching tabs is no longer jarring.

### 6 · Light theme — KEPT + fixed (D-2 override; NOT dropped)
Rebuilt as a **proper warm off-white variant**, token-only remap of **both** the legacy palette **and** the
DECK `--dk-*` tokens, so every tab (legacy + DECK) switches cleanly. Warm parchment ground `#EDE8DE`,
warm-white cards `#FBF9F4`, near-black warm text, and the **tier ladder adapted for light so it still reads
as signal**: 6k deep-gold `#9A7411`, 5k violet `#6B46C1`, 4k steel `#2C6FD6`. `!important` reduced to zero
on the surface overrides (specificity handles it); glows removed in both themes.

### 7 · Header + tab strip in DECK language
Header/tabs re-tokened (flat surface-1, `--dk-line` borders, no glow shadows). **Emoji removed from all tab
labels.** The sci-fi header ornaments went too: the fake **signal bars** (vanity), the `border-flow` logo
glow, the forever-pulsing sync dot (now a static status colour), and the mission-clock glow. Kept the clock,
sync dot, period chip, Pull/Upload/Bolt-Sync buttons, and the **theme toggle** (D-2).
Net result: exactly **one looping animation** app-wide — the DECK heartbeat dot — per §5 of the design system.

---

## DECISION-OVERRIDE deviations from Fable's S0 spec (brief wins)
| Spec S0 said | Brief override | What I did |
|---|---|---|
| Drop the light theme (D-2) | **Keep + fix colours** | Built a proper warm light variant (§6 above) |
| Remove the Star Map tab (D-3) | **Keep both** — rebuild Star Map high-level later | **Star Map tab preserved untouched**; only its GALAXY/SOLAR internals are left for the rebuild session (see Deferred) |

## Deferred (documented, not silently skipped)
- **Star Map GALAXY/SOLAR sub-views** → left for the dedicated **Star Map high-level rebuild** session
  (D-3). Gutting them now would be throwaway work with breakage risk on a tab that gets replaced wholesale.
  The Star Map tab + its COMMAND bridge render fine; the tab is access-gated as before.
- **Cortex ALERTS** (`checkCortexAlerts` + `#cortexAlertContainer`) → **kept.** They fire only on CSV/Bolt
  **upload** (not page load) and carry **real signal** (negative payout, cash deficit, acceptance evasion)
  with no replacement until the **A3 alert-rail registry (S2)** re-homes them. Removing in S0 would be a
  signal regression. Their sci-fi language/beep is cosmetic and S2 will fold them into the DECK rail.
- **Legacy hard-coded cyan decoration** (`rgba(0,212,255,…)` borders/tints across legacy tabs) → removed
  per-tab as each converts to DECK (design-system rollout rule), not in a global S0 sweep.

---

## Verification (:3017, real prod Supabase data — reads only)
- **Zero console errors/warnings** after a fresh load **and** after cycling **all 10 tabs**.
- Real data loads: `synced 06:33`, period `05 Jul 2026`, Today renders the full DECK cockpit (alert rail,
  tier-ladder stat strip 6K/12·5K/2·4K/4·<4K/27, ranked DO-NEXT queue, domain cards, EN/ع toggle, 14-day
  sparkline) — confirmed via accessibility snapshot.
- **Dark** verified via `preview_inspect`: header flat surface-1 `#161C23` + `--dk-line`, no shadow, IBM Plex
  Sans; active tab brand-green underline, **no text-shadow**.
- **Light** verified via `preview_inspect`: warm ground `#EDE8DE`, near-black hero numerals `#221F18`,
  6k tier pill deep-gold `#9A7411` legible on warm-white.
- Captains has **no RADAR button** (By Captain / By Day / Compare Days only); clicking a driver still opens
  the detail panel. Star Map opens without error.
- Only one infinite animation remains app-wide (the DECK heartbeat dot).
- **Note:** the preview **screenshot** tool timed out repeatedly this session (an environment/tool issue —
  evals, inspect, console, network, and the a11y snapshot all worked instantly and the page is healthy).
  Visual verification was done with `preview_inspect` (per its own guidance, more accurate than screenshots
  for colours/fonts/spacing) + the a11y snapshot.

## Guardrails honoured
- Own worktree off `claude/finalize-design`; **only `index.html` touched** in the worktree (+ this report).
- Live core untouched (no crons, no Bolt sync, no Supabase writes, no deploy). F1–F3 counting surfaces not
  touched (S0 is chrome-only).
- **STOPPED before merge** — awaiting Muhammad's explicit deploy-OK. Vault + BUILD_LOG update deferred to
  post-merge per the session-close rule.

## Next rung
**S1 — Mirror-accuracy backbone** (F1 per-driver day-merge + `s` source tag, F2 `getFleetRoster()` + count
relabels, F3 departed-hardening). Opus · med-high. F1/F2/F3 must land before any counting surface is
restyled in S2.
