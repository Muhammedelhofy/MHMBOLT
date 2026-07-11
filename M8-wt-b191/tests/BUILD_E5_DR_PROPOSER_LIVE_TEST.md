# E5 miss-mining follow-up — digital-root proposer fix · live test (prod: m8-alpha.vercel.app)

✅ **LIVE-VERIFIED 2026-07-05, sha `66e63ca` — 3/3 clean on canary 1.** This doc was written before
the fix, then used across 4 deploy rounds as live self-verify kept surfacing real gaps (each only
visible with actual LLM traffic, not offline tests) — see `BUILD_LOG.md` Session 85 for the full
4-layer story. Kept here as the standing regression script for this lane.

The fix is behind **`M8_DR_PROPOSER_EXAMPLES`** (default on). Rollback = set
`M8_DR_PROPOSER_EXAMPLES=off` and redeploy — no code revert (every layer — worked examples, the
raw-message fallback, the groq-first provider order, the deterministic retry — reverts to
byte-identical pre-fix behavior).

Context: mining `m8_router_misses` found terse kernel-test phrasings recurring on
`"I couldn't turn that into a machine-checkable number-pattern claim ... nothing to test yet"`.
The checker itself was always fine; four separate things needed fixing in the proposer path (see
BUILD_LOG for why each layer was needed): (1) worked examples in the two kernel-derived proposer
prompts, (2) a raw-message fallback in `runKernelTest` for when knowledge-intake's decomposition
honestly finds no kernel (a bare "test X" has no leap to extract), (3) a Groq-first provider order
scoped to just these two proposer calls (Gemini doesn't reliably make the inference), (4) a
deterministic temp=0 retry before declining (the temp=0.4 pass can legitimately sample empty).

## Acceptance canaries (fresh session each)

1. **"test the doubling digital-root claim"** (the exact mined phrasing) — ✅ **VERIFIED, 3/3**
   → EXPECT: a real tested claim — "✅ OBSERVED by exhaustive computation through n = ..." for the
   digital root of 2^n with period 6 (1,2,4,8,7,5,...) or an equally valid `dr_set` candidate, NOT
   "couldn't form a machine-checkable claim."

2. **"did you prove the vortex idea?"** — NOTE: this phrasing does NOT actually route through
   `detectKernelTest` (no test/check/verify verb near a kernel noun) — it correctly goes to general
   chat with web search instead. Not a canary for this fix; kept here only so a future tester doesn't
   mistake its (perfectly fine, honest "no I have not proved that") answer for a regression.

3. **"check this kernel: the digital root of 2^n repeats with period 6"** (mined phrasing) — ✅ **VERIFIED**
   → EXPECT: claim forms and tests via the LITERAL-claim path (numbers already stated), same result as #1.

4. **"is 28 a perfect number?"** (CM1 lane — must still work, unaffected)
   → EXPECT: unchanged "✅ VERIFIED: 28 is a PERFECT NUMBER..." (proves the CM1 classical proposer
   lane, which never shares this switch, is untouched).

## Regression — explicit/literal phrasings must stay byte-identical

5. **"the digital root of 3n is always 3"** (an explicit literal assertion, not a terse kernel ref)
   → EXPECT: same behavior as before this fix — tests the literal claim directly (this lane uses
   `buildLiteralSystem`, which this fix never touches).

6. **Collision check** — a normal chat/fleet/wallet/research turn from the same day must route
   exactly as before:
   - "how are my drivers doing today" → **fleet**
   - "how much did I spend on my trip to Cairo?" → **wallet**
   - "what's open on base-6-nine?" / "where are we on collatz?" → **chat** (research lane, as today)

## Notes for the tester
- Pure prompt-text change — no new `api/` fn, no DB writes, no new key. `tests/buildE5_dr_proposer_examples.test.js` (+ PS mirror) cover the kill-switch and byte-identity statically; this doc is for the one thing that can't be tested offline — whether the actual free-stack LLM (Gemini/Groq) now follows the worked example on a live call.
- If canary 1-3 still decline, the LLM may need a stronger/second example rather than a config issue — check `M8_DR_PROPOSER_EXAMPLES` is not accidentally `off` first.
