# DECK — the Bolt Fleet design language
**Date:** 2026-07-06 · **Author:** Fable 5 · high (FINALIZE design pass) · **Status:** SPEC + live exemplar (the TODAY tab in this branch is built in this language — copy patterns from it, don't re-invent).

**One sentence:** an *operations instrument panel* — the sci-fi comes from precision (mono numerals, hairline structure, honest status readouts), never from effects (no glow, no particles, no orbs, no scanlines).

---

## 0 · STANCE — what "sci-fi with taste" means here

1. **Instrument, not hologram.** The references are a cockpit panel and a trading terminal, not a movie HUD. Every pixel either informs or aligns.
2. **Data is mono, chrome is sans.** All numerals render in the mono face with tabular figures; all labels/UI in the sans. This one rule produces 80% of the "command deck" feel.
3. **Colour is a signal, never a decoration.** If a colour doesn't mean money / danger / warning / info / a bonus tier, it's grey.
4. **One glow.** Exactly one ambient animation exists in the whole app: the live status dot's heartbeat. Everything else moves only when the user acts.
5. **Action over vanity.** Every card leads with what to DO (who, why, worth how many SAR) — counts and totals are context, not content.
6. **The funnel is the frame.** The 4k/5k/6k tier ladder gets its own colour identities used identically on every tab — the business model becomes visible grammar.

---

## 1 · TYPOGRAPHY — IBM Plex, one engineered family for EN + AR + numbers

Replace the `Inter + Share Tech Mono` pair (Inter = the generic-AI-dashboard face; Share Tech Mono = the sci-fi cliché) with the **IBM Plex superfamily** — industrial, characterful, free, and with a **first-class Arabic sibling**, which makes the EN/AR toggle a font-swap instead of a redesign:

```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
```

```css
--sans: 'IBM Plex Sans', system-ui, sans-serif;
--mono: 'IBM Plex Mono', ui-monospace, monospace;   /* replaces Share Tech Mono everywhere */
[lang=ar] { --sans: 'IBM Plex Sans Arabic', 'IBM Plex Sans', system-ui, sans-serif; }
```

**Scale (px) — use these seven, nothing else:**

| Token | Size / weight / face | Use |
|---|---|---|
| `data-xl` | 26 · 700 · mono, tabular | Hero numerals only (1–2 per card max) |
| `data-lg` | 19 · 600 · mono, tabular | Stat-strip values |
| `data` | 13 · 400–600 · mono, tabular | Every number in tables/rows |
| `title` | 15 · 600 · sans | Card/section titles |
| `ui` | 13 · 400/600 · sans | Body, buttons |
| `ui-sm` | 12 · 400 · sans | Secondary rows, footers |
| `label` | 11 · 600 · sans · UPPERCASE · letter-spacing .08em · muted | Section labels, table headers, chips |

**Hard rules:** `font-variant-numeric: tabular-nums` on every element that can contain a number (set it on `body` and never undo). Letter-spacing lives ONLY on `label` (the old 5px-tracked glowing logo dies). Weights: 400/600/700 only. No text-shadow anywhere, ever.

---

## 2 · COLOUR — dark-primary token set

```css
:root {
  /* Surfaces — flat elevation via borders + lift, no glow shadows */
  --bg:          #0F1318;                 /* deck floor */
  --surface-1:   #161C23;                 /* cards */
  --surface-2:   #1D252E;                 /* nested blocks, hover */
  --surface-3:   #242E39;                 /* inputs, controls */
  --line:        rgba(148,163,184,.10);   /* hairline borders */
  --line-strong: rgba(148,163,184,.20);   /* hover/active borders, rules */

  /* Text */
  --text-hi:   #E9EEF3;  /* hero numerals, titles */
  --text:      #C4CCD5;  /* body */
  --text-mut:  #8B95A1;  /* labels, meta */
  --text-dim:  #5D6772;  /* disabled, placeholders */

  /* Signals — the ONLY non-grey chrome colours */
  --brand:  #3DDBAE;  /* Bolt green: money-positive, success, primary action */
  --danger: #FF5C7A;  /* blocked, loss, overdue */
  --warn:   #FFB020;  /* attention, slipping, stale */
  --info:   #58A6FF;  /* links, neutral info (the old cyan, demoted from decoration to meaning) */

  /* The bonus-tier ladder — the business lens, identical on every tab */
  --tier-6: #FFCF5C;  /* 6k — gold */
  --tier-5: #A78BFF;  /* 5k — violet */
  --tier-4: #6FA8FF;  /* 4k — steel blue */
  --tier-0: #5D6772;  /* below pace — dim, not red (below ≠ bad, it's the pipeline) */

  /* Tints — 8-10% alpha of a signal for row/panel backgrounds */
  --brand-tint:  rgba(61,219,174,.09);
  --danger-tint: rgba(255,92,122,.09);
  --warn-tint:   rgba(255,176,32,.09);

  --focus: 0 0 0 2px rgba(88,166,255,.45);  /* a11y focus ring — the only permitted "glow" besides the heartbeat dot */
}
```

**Usage doctrine:** brand-green is *earned* — company money, success states, the one primary button per view. Never as border decoration. Red/amber only with a reason a user could say out loud. Tier colours appear as **tier pills** (§4) and nowhere else, so they stay legible as a ladder.

---

## 3 · LAYOUT RHYTHM — every tab is the same deck

```
┌ DECK HEADER   title · context line          status readout · actions ┐
├ ALERT RAIL    (only when something needs attention — never empty)    ┤
├ STAT STRIP    4-6 compact instruments (label over mono value)        ┤
├ WORK GRID     action queue / cards / tables — the tab's substance    ┤
└ (drill panels open OVER this, they don't stack below it)             ┘
```

- **Spacing grid:** 4px base — allowed steps 4/8/12/16/20/28. Card padding 14px; section gap 20px; page gutter 20px; content max-width 1480px centered.
- **Radii:** cards 10px · controls 7px · pills 999px. **Borders:** 1px `--line` everywhere; `--line-strong` on hover/active. **Shadows:** none on cards (flat, technical); one soft `0 12px 32px rgba(0,0,0,.5)` allowed on *overlays* (modals, dropdowns, the driver panel).
- **Rows:** table rows 34px, compact lists 30px. Numeric cells right-aligned. Max ~9 columns; anything more moves into the driver panel.
- **No forever-scroll:** a tab shows its top layer (header + rail + strip + first work section) within ~1.5 viewports. Everything deeper is click-to-drill (section collapse or panel), and lists cap at N + "show all".
- **Bulkhead section rule** (signature detail): section labels render as `LABEL ──────────── [count]` — an 11px uppercase label, a 1px rule filling the remaining width, an optional mono counter chip. Replaces every decorative divider.
- **Status readout** (signature detail): top-right of every deck header, mono 11px, muted: `DATA 05 JUL · SYNC 00:52 ✓` — the honest heartbeat that replaces all fake FX. Turns amber automatically when the newest entry is ≥ 2 days old, with source (`CRON` / `CSV`).

---

## 4 · CORE COMPONENTS (visual contract — behaviour specs live in BOLT_FINALIZE_TAB_SPECS.md)

- **Stat** — `label` on top, `data-lg` mono value under it, optional delta chip (`▲ 12%` in brand/danger). No icons, no sparkles. 4-6 per strip, equal widths, hairline-separated.
- **Deck card** — surface-1, hairline border, 14px padding. Title row = `title` + optional right-side mono chip; body; optional footer meta (`ui-sm`, muted, hairline-top). Whole card clickable ⇒ hover lifts border to `--line-strong` + translateY(-1px), cursor pointer, and the title row's `→` affordance.
- **Action card** (the cockpit's hero, exemplar: Today's DO-NEXT queue) — rank chip (`#1` mono), **who** (driver, 600), **why** (one muted line), **worth** (`+1,500 SAR` mono in brand), and 1-2 real buttons (call/WhatsApp/open). The #1 card carries the corner-tick accent (two 8px hairline brackets, top-left + bottom-right) — the ONE permitted HUD flourish, on exactly one element per page.
- **Tier pill** — `999px` pill, tier colour at 14% alpha bg + tier colour text + 1px tier-colour border at 35% alpha: `6K` `5K` `4K` `—`. Projected (not yet banked) tiers render hollow (border + text only); achieved render filled. Same component on Today, Captains, Analytics, Finance, the driver panel.
- **Alert rail** — one component, three severities (danger/warn/info): 1px left-accent bar + tint bg + `ui` line + count chip + optional action link. Sits directly under the deck header; disappears entirely when empty (no "✓ all clear" boxes taking space — the strip's calm IS the all-clear).
- **Buttons** — primary (brand bg, #06231B text, 600), ghost (hairline border, text), danger-ghost. 30px tall, 7px radius, `ui` size. One primary per view maximum.
- **Chips/filters** — 999px, surface-3, active = brand text + brand 35% border. Filter rows scroll horizontally on mobile, never wrap past 2 lines.
- **Table** — `label` headers with sort arrows (▲▼ only on the active column), 34px rows, hairline row separators, hover = surface-2, click = driver panel. Zebra striping banned.
- **Empty states** — one dim glyph + one `ui` sentence + one action. **Loading:** static dim placeholder then a single 240ms fade-in — skeleton shimmer banned.

---

## 5 · MOTION — moves only when touched

```css
--t-fast: 120ms; --t: 180ms; --ease: cubic-bezier(.2,.7,.3,1);
```
- Hover/press: border + 1px lift / scale(.985). Panels/dropdowns: 180ms fade+6px slide. Tab switch: content fades in 160ms (no slide).
- Page load: cards rise 4px + fade, 25ms stagger, max 8 items — one breath, then still.
- The heartbeat: status dot pulses at 2.4s — **the only looping animation in the product.**
- `@media (prefers-reduced-motion: reduce)` disables all of it.
- Deleted concepts: number-scramble on hover, scan beams, pulse rings, particles, EKG bar, warp/ingestion overlays. (Exact anchors in §8.)

---

## 6 · LIGHT THEME — verdict: **DROP** 🔴 (Muhammad confirms)

Recommendation: **delete it.** Reasons: (1) it's a patch-layer — dozens of `html[data-theme=light] … !important` overrides fighting hard-coded dark surfaces, and every future change must be QA'd twice; (2) the verdict on record is "feels so white, bad font/colours"; (3) an ops deck used at night by the team has no light-mode constituency; (4) this is a *finalize* — surface area must shrink. **Delete:** the whole `html[data-theme="light"]` CSS block, `#themeToggleBtn`, `toggleTheme()`, and reduce `initTheme()` to a no-op that clears any stored `mohm_theme`. Fallback option if Muhammad wants to keep it: rebuild as a token-only remap (~20 token overrides, zero `!important`) — but that's real work better spent elsewhere.

---

## 7 · EN/AR TOGGLE + RTL

- **Switch:** `EN | ع` chip in the deck header → sets `<html lang dir>` + `localStorage.mohm_lang`, re-renders the active tab. Default EN.
- **Strings:** one `T = { key: {en:'…', ar:'…'} }` dictionary + `t(key)` (EN fallback). Rollout order: tab names → deck headers/status words → buttons/chips/labels → alert sentences. Driver names, sheet values and free-text stay as entered.
- **Numbers stay Western digits** (team convention for SAR figures): `fmt()` pins `Intl.NumberFormat('en-US')`. **Dates in AR must pin Gregorian + latin digits:** `toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', …)` — the bare `ar-SA` default is Hijri and would corrupt every period label.
- **RTL mechanics:** all NEW components use logical properties (`padding-inline`, `margin-inline-start`, `inset-inline-end`, `text-align:start`) so `dir=rtl` is free; numeric cells and phone numbers get `direction:ltr; unicode-bidi:isolate`; charts/sparklines sit in `dir=ltr` islands (time flows left→right in both languages); the tab strip and stat strip mirror naturally via flex.
- **Font:** `[lang=ar]` swaps `--sans` to IBM Plex Sans Arabic (§1); mono numerals stay IBM Plex Mono.

---

## 8 · KILL LIST — the de-cliché sweep (do FIRST, before restyling)

Delete outright (grep anchors — after each block, reload + zero console errors):

| Layer | Anchors |
|---|---|
| HTML | `#m8EkgBar` · `.ambient-orb-1/2` · `#dataIngestionOverlay` + all `#di-*` · `.jarvis-orb-wrap` (incl. `#m8NeuralCanvas`, `#jarvisOrb`, `#m8WaveCanvas`) · `#voiceToast` · `#m8Picker` · `#uploadScanBeam` |
| JS | every `m8*` function/ref (251), `voice*` handlers, `toggleM8`, `initHoloParticles`, `initKpiScramble`, `fireM8Pulse`, `triggerUploadScanBeam`, cortex/biometric helpers |
| CSS | `.jarvis-*`, `.m8-*`, `.m8pick-*`, `.holo-*`, `.voice-*`, `.cortex-*`, `.ambient-orb`, `#di-*`, scanline/warp/biometric keyframes, `border-flow`, `.holo-scramble`, `.m8-ring` |
| Sub-views | Captains **RADAR** (`captainView==='radar'` branch + `#radarCanvas`) · Star Map **GALAXY/SOLAR** (per tab spec #1) |
| Fonts | the `Share Tech Mono` Google-Fonts request |

Keep: `toast()` notifications, the sync status dot (it becomes the heartbeat), all data logic. M8 lives on as its own product — the dashboard stops embedding it (arch-review C6 resolved as REMOVE).

---

## 9 · THE EXEMPLAR

The **TODAY tab in this branch** implements all of the above: deck header with status readout + EN/AR toggle, alert rail, stat strip with tier-ladder instruments, the ranked ACTION QUEUE ("do these 3 today", SAR-weighted), and the five domain cards rebuilt as deck cards — with the old data functions untouched underneath. Roll the same pattern across tabs #1–#12 per `BOLT_FINALIZE_TAB_SPECS.md`. The new CSS lives in one clearly-marked block: `/* ═══ DECK DESIGN SYSTEM ═══ */`; legacy classes stay functional during rollout and are deleted tab-by-tab as each converts.
