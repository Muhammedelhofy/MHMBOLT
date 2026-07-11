# Meaning-First v2 — C1 [FABLE] review: DO-sentinel prompt + intercept

**Model: Fable · high.** Brief: `SESSION_BRIEFS/MEANING_V2_C1_DO_SENTINEL_REVIEW.md`.
Reviewed: `shadowPromptRule()` wording + `git diff 1f4c26b c7d5d93 -- lib/do-sentinel.js lib/orchestrator.js`.
**Verdict: APPROVED with fixes applied on this branch. NOT deployed — deploy is Muhammad's call.**

## The 5 ranked decisions

| # | Decision | Verdict |
|---|---|---|
| D1 | Prompt wording | **Tightened.** Added ONE negative worked example ("how much did I spend on groceries?" → asks ABOUT, append NO tag) and changed "on a NEW LINE" to "as the very LAST line" (placement drift was the other failure mode). One negative is enough — the rule must stay short for the free models. |
| D2 | Code-guaranteed strip | **Fixed, wider than the brief asked.** (a) All marker regexes now tolerate whitespace + case drift (`⟦DO: wallet ⟧`, `⟦do:Wallet⟧` parse AND strip). (b) `MARKER_ANY_RE` strips ANY DO-shaped `⟦…⟧` even off-menu/malformed — but ONLY DO-shaped, so a legit research-lane `⟦n⟧` denotation bracket survives. (c) New ASCII-bracket fallback (`[DO:tasks]`) — TRAILING + menu-bound only, so prose like "(DO: call the bank)" can never be eaten. (d) See the two extra defects below — the strip is now unconditional and runs before persistence. |
| D3 | Streaming shadow now vs defer | **Defer (per brief).** Buffered captures the measurement; streaming joins at S4 via the B-169f hold-first-chars delegate. No change. |
| D4 | `M8_DO_SENTINEL` default = `shadow` | **Keep `shadow` (per spec §4.1)** — measuring on real turns is the whole point, and the leak class it risked is now code-closed. ⚠️ For Muhammad: merging to main activates the prompt rule on buffered fall-through turns immediately; if you want an inert deploy first, set `M8_DO_SENTINEL=off` in Vercel env before the merge and flip later. |
| D5 | `claim-audit:denial` logs ALL denials | **Keep (per brief).** Stage-1 is measurement; the honest-vs-lie split is Stage 2 and the `honest_cant` fixture cases already spec it. No change. |

## Two defects found beyond the brief (both fixed)

1. **The strip was NOT code-guaranteed.** `_doSentinelObserve` returned the text
   *unstripped* whenever `parseTrailingMarker` failed — so a marker the model
   narrated mid-reply or emitted malformed would have reached the user verbatim.
   Now: strip runs unconditionally; a non-trailing/off-menu marker is logged as
   `do-sentinel:stray` (C2 reads that count as protocol-drift evidence).
2. **The intercept ran AFTER persistence and AFTER the trailing appends.** The
   observe call sat below `await saveMemory(sessionId, message, response)` (raw
   marker persisted into conversation memory → recalled into future prompts) and
   below `ensureHealthClose` + chips (which append text after the marker, un-trailing
   it → telemetry loss). The brief's "persist + return are clean" claim was wrong.
   Now: observe + claim-audit run right after the reflection block — after the last
   rewrite, before health-close/chips/STORE. A PS-mirror source assert pins the
   ordering (`observe runs BEFORE the STORE`).

## Files changed
- `lib/do-sentinel.js` — tolerant regexes + ASCII trailing fallback + lowercased domain + counter-example in `shadowPromptRule()`.
- `lib/orchestrator.js` — unconditional strip + `do-sentinel:stray` telemetry; call site moved above the STORE; tail comment tombstoned.
- `tests/meaning_v2_test.js` — +7 P1 checks (tolerance, ASCII fallback, prose safety, math-bracket safety, counter-example present).
- `tests/meaning_v2_test.ps1` — mirrored regex tolerance + 6 A-asserts + 3 B-asserts (incl. the before-STORE ordering pin).

## Verification (this worktree, post-change)
- `node --check` clean on both lib files.
- `tests/meaning_v2_test.js` — **66/67** (only the expected S4 `pending-action` red).
- `tests/meaning_v2_test.ps1` — **69 PASS / 4 FAIL / 3 SKIP** (fails = the expected S4 wiring reds only).
- `tests/intent_gate_test.js` — **101/101**; `tests/intent_gate_test.ps1` — **150/0** (routing regression clean).

## Next
1. 🔴 Muhammad: deploy decision. `/deploy-verify` on this branch → merge to M8 main (shadow activates) — or set `M8_DO_SENTINEL=off` first for an inert deploy.
2. After a few days of real usage → **C2 [FABLE]**: read `do-sentinel:*` (incl. `stray`) + `claim-audit:*` counts, decide the `on` flip + confirm-back scope.
3. S3 (wallet/notes ladders) can proceed in parallel — independent of the shadow data.
