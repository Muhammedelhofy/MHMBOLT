# Meaning-First v2 — C1 checkpoint: review the DO-sentinel prompt wording + intercept

**Model: Fable · high.** This is the spec's **[FABLE] C1** gate (`M8_MEANING_FIRST_V2_SPEC.md` §6): *"review sentinel prompt wording + intercept diff. The marker rule needs a worked example in the prompt, and the marker itself must be code-guaranteed stripped."* Read-only review + a set of go/no-go decisions. **Nothing is deployed** — S2 sits on branch `build/meaning-v2-s1` (commits `1f4c26b` S1, `c7d5d93` S2, off M8 `origin/main` @ `10d76b1`).

## Why you're here
S2 shipped the DO-sentinel in **shadow** (default). On a fall-through turn (registry band none/weak) the buffered LLM is asked to append a `⟦DO:<domain>⟧` marker if the user asked it to PERFORM a write; the orchestrator strips+logs it before the user sees anything. Before this prompt change runs on prod (even in shadow), it needs your eyes — the two things the spec singled out are (a) the marker rule wording, (b) code-guaranteed stripping.

## Review target A — the prompt wording (verbatim, from `lib/do-sentinel.js` `shadowPromptRule()`)
> DO-SENTINEL (internal side-channel — the user NEVER sees this tag): If this turn is the user asking you to PERFORM a write action — set/change/log/save something, not asking ABOUT it — then AFTER your normal reply, on a NEW LINE, append exactly ONE tag from this fixed menu: ⟦DO:tasks⟧ | ⟦DO:wallet⟧ | ⟦DO:notes⟧ | ⟦DO:driver_profile⟧. Worked example: user says "throw 30 egp to groceries" -> your reply ends with a newline then ⟦DO:wallet⟧. If the turn is NOT a write request, append nothing. Never explain or mention the tag.

Worked example: ✅ present (the LLM-prompt lesson). Menu: writes-only, closed. Questions for you:
- Is "PERFORM a write vs ask ABOUT" a sharp enough line for the free models (Groq gpt-oss-120b / Gemini flash)? Does it need a second worked example — a NEGATIVE one ("how much did I spend? -> append nothing")?
- Any risk the model narrates the tag or emits it mid-reply rather than trailing? (Intercept only strips a *trailing* marker for the log; `stripDoMarker` removes any well-formed one anywhere — see target B.)

## Review target B — the intercept diff (`git diff 1f4c26b c7d5d93 -- lib/do-sentinel.js lib/orchestrator.js`)
- `lib/do-sentinel.js` — pure: `DO_MENU` (writes-only), `parseTrailingMarker` (`⟦DO:x⟧` at end), `stripDoMarker` (global `⟦DO:\w+⟧`), `doSentinelMode()` (shadow|on|off, default shadow), `shadowPromptRule()`.
- `lib/orchestrator.js`:
  - `_doSentinelObserve(response, msg, route)` (defined after `MONEY_SENTINEL`): if mode≠off and a trailing marker is present → `logRoute(msg, "do-sentinel:"+dom, …)` then `stripDoMarker(...).replace(/\s+$/,'')`. Returns clean text.
  - Shadow rule appended to the **buffered** `systemInstruction` right after `weakBandGroundingNote(_route.intent)`, gated on `_route.intent.band ∈ {none,weak}`.
  - Called just before the buffered `finalResponse` assembly (so persist + return are clean).
  - **Streaming path: NOT wired** (chunks already emitted). Documented as the C1/S4 follow-up.

## Decisions for you (ranked)
| # | Decision | My recommendation |
|---|---|---|
| D1 | Approve / tighten the prompt wording (add a negative worked example?) | Add ONE negative example ("how much did I spend? → nothing"); otherwise approve. |
| D2 | **Code-guaranteed strip:** a malformed marker (`⟦DO: wallet ⟧`, wrong bracket) would NOT strip → cosmetic leak in shadow | Make `stripDoMarker` whitespace-tolerant AND add a belt-and-suspenders sweep on fall-through replies that removes any `⟦…⟧` residue. Cheap; kills the leak class. |
| D3 | Streaming-path shadow now, or defer | Defer — buffered captures a large share; do streaming at S4 `on` via the B-169f delegate (hold-first-chars), as the spec §4.1 describes. |
| D4 | `M8_DO_SENTINEL` default = `shadow` (activates the prompt change on deploy) vs `off` until an explicit flip | Keep `shadow` per spec — it's the whole point of measuring — but confirm, since it's an always-there prompt change on the buffered path once deployed. |
| D5 | `claim-audit:denial` logs ALL sentinel-less denials (honest + lie) | Keep for Stage-1 measurement; the CAPABILITIES-aware honest-vs-lie split is Stage 2 (the fixture `honest_cant` cases already spec it). |

## How to verify before deciding
```
# worktree M8-wt-meaning-s1
NODE_PATH=<M8>/node_modules node tests/meaning_v2_test.js   # 59/60 (only S4 pending-action red)
& tests\meaning_v2_test.ps1                                  # 60 pass / 4 fail (S4 only)
node tests/intent_gate_test.js                               # 101/101 (routing regression)
& tests\intent_gate_test.ps1                                 # 150/0
```
Fixture: `tests/fixtures/meaning_v2_phrasings.json` (35 real cases). Build reports: `reports/meaning-v2-s1.md`, `reports/meaning-v2-s2.md`.

## After approval
1. Apply any D1/D2 wording/strip tweaks (small, on this branch).
2. Deploy S2 (shadow) via `/deploy-verify` — merge to M8 `main`, confirm READY, self-verify on prod.
3. Collect a few days of real usage, then **C2 [FABLE]**: read `do-sentinel:*` / `claim-audit:*` counts, decide the `M8_DO_SENTINEL=on` flip + confirm-back scope. S3 (wallet/notes ladders) can proceed in parallel — it's independent of the shadow data.
