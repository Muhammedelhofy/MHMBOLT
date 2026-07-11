# Meaning-First v2 — S1: the last-keyword-gap fixture (build report)

**Stage:** S1 (spec `M8_MEANING_FIRST_V2_SPEC.md` §5, build step 0). **Model:** Opus · high.
**Branch:** `build/meaning-v2-s1` (worktree `M8-wt-meaning-s1`, off M8 `origin/main` @ `10d76b1`).
**Behavior change:** none. Deliverable = fixture + failing tests only. **Nothing deployed.**

## What shipped
| File | Role |
|---|---|
| `tests/fixtures/meaning_v2_phrasings.json` | 35 hand-labelled cases, **all verbatim from `m8_conversations`** (real app sessions only). 6 zero_keyword_action · 17 pending_action · 12 false_claim. |
| `tests/meaning_v2_test.js` | Authoritative contract. PART 0 (fixture integrity) GREEN now; PARTS 1–4 RED until S2–S5 build the v2 modules. |
| `tests/meaning_v2_test.ps1` | PS-5.1 mirror (pure ASCII, no Node). (A) reference detectors GREEN over real data; (B) source-wiring greps RED until S2–S5. |

## Provenance & integrity (the "never invent a phrasing" rule)
- Mined 2026-07-07 from BOLT Supabase `ltqpoupferwituusxwal`, `m8_conversations`. **Only real app sessions** (`session_id ~ '^session_[0-9]'`, 760 user turns / 122 sessions). Autonomous/eval/build sessions (`m3armed_od2arm.*`, `r6v-*`, `evallive_*`, `burst-*`, `verify-*`, `lean-*`, `b1*`) were **excluded** — not his words.
- Every `zero_keyword_action` msg was scored against the **real** `lib/capability-registry.js` (`scoreMessage`/`resolveIntent` via Kimi Node v24): all 6 confirmed `writeMax === 0` → `chat/none`. PART 0 of the JS test re-asserts this on every run, so a mislabelled ("invented") phrasing can't slip in.
- Every `false_claim` reply is the **real DB reply** (had_sentinel=false confirmed) — nothing was actually written.

## What the data actually showed (honest finding — this reshaped the fixture)
The spec hypothesised three failure shapes. The data confirms them, but with a twist worth flagging for the C1/C2 checkpoints:

1. **Zero-keyword ACTION volume is LOW.** When he wants a reminder he types "remind me" (keyword) and the registry catches it. The gap is real but narrow (matches the E5 "miss-loop mined out" audit). So the fixture is weighted toward the *downstream* damage, not mis-routing.
2. **The dominant real damage is the false claim, both directions:**
   - **false "can't"** — `put down fifty riyals for lunch` → *"I can't directly record or add expenses…"* (M8 **has** a wallet add lane). Also `throw 30 egp to groceries` → *"I can't send money"* (misread a log as a transfer). Also `Remind me… about the match` → *"I don't have the ability to set reminders"* — **hours after** the same user successfully added a task that day.
   - **false "done"** — `Today khalid paid… keep it till we pay him not to forget` → *"I've logged this note…"* (no sentinel). `on Sunday I want to check Bolt… very high priority` → *"Noted… marked as a very high priority"* (no sentinel).
   - **dead-end ASK** — `Just pop up a notification "meeting min" at 11` → *"What does 'meeting min' refer to?"*; and a full notify-loop where his answers ("Sound popup notification on mobile") never landed.
3. **A detector gap the fixture caught before the detector exists:** the spec §4.4 done-claim regex (`i've set|added|saved|logged|scheduled|recorded|done`) **misses** the real `Noted… marked as a very high priority` false-done. The fixture flags `c-false-done-priority` and the reference detector (JS + PS) **extends** §4.4 with `noted|marked as|i'll (remind|note|keep|track)|added … to your`. S2 step 2 must implement the extended detector, not the draft.

## The contract S2–S5 must satisfy (the tests are the spec)
- `lib/capability-registry.js`: `CAPABILITIES` (per-domain `{canDo,cantDo}`, incl. read lanes like knowledge) + `buildAbilitiesPrompt()` — the abilities prompt composed from it, naming **travel** (fixes G6) and carrying the D4 never-claim-done rule. *(S2 step 1)*
- `lib/claim-audit.js`: `detectDoneClaim(text)` (extended §4.4) + `detectCapabilityDenial(text)`. Audit logs `false_done` only when a done-claim fires **and no lane sentinel** is present (case `c-normal-task-added-real` guards the sentinel-gating). *(S2 step 2)*
- `lib/do-sentinel.js`: `DO_MENU` (writes-only: tasks·wallet·notes·driver_profile), `parseDoMarker`, `stripDoMarker` (marker `⟦DO:<domain>⟧`, code-guaranteed strip per C1). *(S2 step 3)*
- `lib/pending-action.js`: `isAcceptance` / `isRefusal` (closed grammatical class); slot-answers/deflections classify as **neither** so they land via the lane, never as a phantom yes. *(S4 step 5)*

## Red-state proof (run this session)
- JS: `12/17` (PART 0 fixture-integrity green; PARTS 1–4 red — 5 absent modules). exit 1.
- PS: `49 PASS / 15 FAIL / 3 SKIP` — (A) all reference-logic green over real data; (B) all wiring red. exit 1. File verified 0 non-ASCII bytes.
- Run: `node tests/meaning_v2_test.js` · `& tests\meaning_v2_test.ps1`.
