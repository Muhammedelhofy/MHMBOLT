# Meaning-First v2 — S2: CAPABILITIES source + claim-audit + DO-sentinel (shadow)

**Stage:** S2 = spec steps 1–3 (`M8_MEANING_FIRST_V2_SPEC.md`). **Model:** Opus · high.
**Branch:** `build/meaning-v2-s1` (continues S1). **Nothing deployed.**
**Behavior change on deploy:** prompt-text only + telemetry. Everything acting is flag-gated / shadow.

## What shipped
| File | Step | What |
|---|---|---|
| `lib/capability-registry.js` | 1 | `CAPABILITIES` (per-domain `{label,blurb,canDo,cantDo}`) + `buildAbilitiesPrompt()`. The abilities prompt is now **composed from this single source** — can't drift from the registry (fixes G6) — and carries **both** D4 rules (never-lack + the new never-**done**). |
| `lib/orchestrator.js` | 1–3 | `M8_PROMPT_ABILITIES = _abilities.buildAbilitiesPrompt()` (hand-typed body retired, spec §5 S2). Claim-audit + DO-sentinel-shadow helpers + wiring. |
| `lib/claim-audit.js` | 2 | Pure `detectDoneClaim` (spec §4.4 **extended** — catches the real "Noted… marked as" false-done the draft regex missed) + `detectCapabilityDenial`. |
| `lib/do-sentinel.js` | 3 | Pure `DO_MENU` (writes-only), `parseDoMarker`/`parseTrailingMarker`/`stripDoMarker`, `doSentinelMode()` (3-state), `shadowPromptRule()` (with a worked example, per the C1 LLM-prompt lesson). |
| `tests/*` | — | Byte-stability assert added; PS D4 grep + 3 `intent_gate_test.ps1` greps repointed to `capability-registry.js` (consequence of retiring the orchestrator body). |

## Wiring (all safe)
- **Prompt (step 1):** always-on, composed from CAPABILITIES. Static per deploy ⇒ B-178 static-head cache intact. Kill-switchless (it's the honesty guarantee, same posture as B-176's never-lack rule).
- **Claim-audit (step 2):** telemetry-first. On a reply that reaches the user **without a lane sentinel** (TASK/MONEY), logs `claim-audit:false_done` (a write-claim, nothing written) or `claim-audit:denial` (a candidate false "can't"). **Stage 1 = log only, zero behavior change.** Hooked on both the buffered and streaming reply-finalize points.
- **DO-sentinel (step 3):** `M8_DO_SENTINEL` 3-state, **default `shadow`**. On a fall-through turn (registry band none/weak), the buffered system prompt gets `shadowPromptRule()`; `_doSentinelObserve()` strips+logs any trailing `⟦DO:<domain>⟧` **before the user or persistence see it**. `off` ⇒ rule absent (byte-identical).

## Scope decisions (flagged for the [FABLE] C1 checkpoint)
1. **DO-sentinel is buffered-path only this stage.** The streaming path already emitted its chunks, so a trailing shadow marker can't be post-hoc stripped there without the hold-first-N-chars/delegate mechanism (spec §4.1 streaming note). Streaming-path shadow + the `on`-mode lane re-entry are the **C1/S4** follow-ups. Shadow data therefore comes from buffered turns (a large share — every non-streamable turn delegates there).
2. **Marker-strip is code-guaranteed only for a *well-formed* marker** (`⟦DO:\w+⟧`). A malformed one (space, wrong bracket) would not strip → a cosmetic leak in shadow. This is exactly the C1 review item ("the marker itself must be code-guaranteed stripped"). Recommend C1 reviews `shadowPromptRule()` wording before enabling on prod.
3. **`claim-audit:denial` logs all sentinel-less denials**, honest or not — the CAPABILITIES-aware honest-vs-lie split (fixture `honest_cant` cases) is Stage 2. Fine for a measurement signal at C2.

## Verification (this session, all green)
- **meaning_v2_test.js: 59/60** — PARTS 0/1/2/4 green; only PART 3 (pending-action, S4) red.
- **meaning_v2_test.ps1: 60 pass / 4 fail** — (A) reference logic + (B) S2 wiring green; only pending-action (B) red.
- **Regression (criterion 7):** `intent_gate_test.js` **101/101**; `intent_gate_test.ps1` **150/0**; `orchestrator.js` loads clean.
- **Behavioral proof:** trailing `⟦DO:wallet⟧` → parsed `wallet` + stripped clean; no-marker → null; false-done (khalid + the §4.4-miss "Noted/marked") → detected; false-cant (putdown) → detected; normal fleet answer → both detectors quiet.
- Run (worktree): `NODE_PATH=<M8>/node_modules node tests/meaning_v2_test.js` · `& tests\meaning_v2_test.ps1`.

## Next
S3 (extractWalletLLM + extractNoteLLM ladders) → S4 (pendingAction + DO-sentinel `on` + confirm-back) → S5 (net-deletes). The **C2 [FABLE]** gate (read `do-sentinel:*` / `claim-audit:*` shadow counts on prod) needs S2 **deployed** + a few days of real usage before flipping `M8_DO_SENTINEL=on`.
