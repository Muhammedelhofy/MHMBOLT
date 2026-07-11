# B-192 — Meaning-First v3 · S1: `understand()` in SHADOW

**Session:** 2026-07-08 · **Model:** Fable 5 · high · **Branch:** `feat/mfv3-s1-understand` (worktree `M8-wt-mfv3-s1`, off `origin/main` @ `cb0d25c`)
**Governing plan:** `M8_MEANING_FIRST_V3_PLAN.md` · **Doctrine:** vault ★ M8 DOCTRINE (meaning-first, NOT mirror-first)

---

## What shipped

| Piece | File | What it does |
|---|---|---|
| The semantic pass | `lib/understand.js` | ONE async `understand(message, history)` → the fixed 7-key contract `{reference, intent, capability, understanding_confidence, execution_confidence, reasoning_path, clarify}` via the free stack (Groq first, temp 0, native JSON mode). Capability menu = the registry's own `DOMAINS` (single source). Prompt composed from `CAPABILITIES` + the hard honesty limits (no budget model, no delete-from-chat, no money transfer, no booking) with a worked example AND a counter-example. |
| Shadow launch | `lib/orchestrator.js` (+1 require, +1 call) | `startShadow()` fired at the END of `resolveDomainRoute` — right next to the live verdict `{arb, intent, lookup}` — NEVER awaited there. Runs once per real turn (the stream path delegates with `precomputedRoute`). |
| Shadow flush | `lib/handlers/chat-buffered.js`, `chat-stream.js` | `flushShadow(4000)` in each handler's `finally`, AFTER the reply bytes / `res.end()`. Vercel keeps the invocation alive until the handler promise settles → the telemetry insert survives the lambda freeze (the await-un-flushed-writes gotcha) at ZERO added latency and ZERO reply bytes. |
| Telemetry | `m8_router_misses` via `miss-logger` | lane `understand:<capability>`, reason `uc= ec= cl= ref= int= live=<label> agree= <ms>ms why=<because>` (≤120 chars, message redacted by the standard privacy contract). |
| Kill-switch | `M8_UNDERSTAND` | `shadow` (default) \| `off` \| `on`. **"on" still behaves as shadow in S1** — authority for reads is S3 and lands only on measured shadow evidence. |
| Fixtures | `tests/fixtures/understand_fixtures.json` | 16 of Muhammad's REAL phrasings — tonight's four misses first ("what is the remaining?", "how much is left?", "recommend a trip with this budget", "do the same for Ahmed", "move it to tomorrow") + canonical reads/writes, Arabic, fleet, CV, weather, and the honest-can't ("send 200 sar to Ahmed"). |
| Scored runner | `tests/understand_fixtures_test.js` | Hard gate = the EXACT 7-key contract on every result. Meaning = a reported pass-rate that soaks (100% NOT required at S1). `--offline` mode drives the parse→normalize→contract plumbing with no network. Groq free-tier pacing + retry; a 429 counts as infra-skip, never a contract break. |
| PS mirror (scoped) | `tests/build192_understand.test.ps1` | Mirrors ONLY the pure compute helpers — `understandMode`, the normalize rules, `liveLabel`/`shadowAgrees`. Header forbids it ever growing meaning assertions. |
| Live test script | `tests/B192_LIVE_TEST.md` | Post-deploy: shadow rows land, deterministic-lane byte-identical check (shadow vs off), kill-switch, what-S1-is-NOT. |

## The context check (kickoff step one)

Confirmed before building: `resolveDomainRoute(baseMessage, history)` **already receives the full
history** (it feeds `walletRefContext(history)` at the same spot, orchestrator ~4048), and the
plan's S0 diagnosis agrees ("this is NOT a wiring bug"). So `understand()` was threaded straight
in at that seam — no re-plumbing needed. The stream path can't diverge: it delegates through
`precomputedRoute`, so the shadow fires exactly once per message.

## Test results

### Deterministic (no network)
- **Offline contract mode: 16/16 clean** — exact 7-key shape through parse→normalize on every fixture.
- **PS-5.1 mirror (pure helpers only): 21/21.**
- Orchestrator + both handlers load clean under the Kimi runtime.

### Live scored run (Groq `openai/gpt-oss-120b`, temp 0, native JSON mode, real key)

**CONTRACT: exact 7-key shape on all 16 fixtures ✓ · MEANING: 16/16 (100%)** — after ONE
fixture-driven prompt iteration (the sanctioned loop: baseline 14/16 → teach the pass two facts
→ rerun full suite as regression guard → 16/16, zero regressions).

The baseline's two misses, and what they taught (meaning facts, zero keywords):
1. `balance_fresh` — the model conflated *spend totals* (fully readable; B-191's honest balance
   answer) with *remaining-of-budget* (not computable) → the limits line now separates them.
   ec went 0.2 → 0.99.
2. `and_sara` — it didn't know the wallet is the HOUSEHOLD wallet, so a named family member
   looked unresolvable → one line ("a spending question about a family member inside a money
   thread is a wallet read") → uc 0.2 → 0.96, reference resolved.

**The acceptance case, actual output (tonight's bug):**
```json
{
  "reference": "the wallet balance/spend total from the previous turn",
  "intent": "wallet.read",
  "capability": "wallet",
  "understanding_confidence": 0.95,
  "execution_confidence": 0.1,
  "reasoning_path": {
    "reference": "previous_wallet_query",
    "intent": "wallet.read",
    "because": "follow-up to balance; no budget model to compute remaining"
  },
  "clarify": false
}
```
= understood almost perfectly, wallet lane, honestly NOT computable — the exact
uc-HIGH/ec-LOW separation that makes the S3 honest-can't reply possible. And its control pair,
`"what is the remaining?"` with NO history → `uc 0.20, capability none, clarify true` — the two
failure modes (ununderstood vs unanswerable) are now DIFFERENT numbers, which was the whole point.

Highlights across the suite: every anaphoric case resolved its reference ("do the same for
Ahmed" → wallet 0.97/0.99 · "move it to tomorrow" → tasks · "cancel that" → tasks · "and what
about Sara?" → wallet with reference) · "recommend a trip with this budget" → travel with the
budget reference · "send 200 sar to Ahmed" → understood 0.95 / execution 0.10 (M8 never sends
money — the honest-can't in the other direction) · Arabic wallet read language-blind · fleet /
CV-knowledge / weather-web all correctly separated. Median latency ~950ms on the free tier —
comfortably inside the reply-generation window the shadow hides behind.

## Acceptance vs the kickoff

| Acceptance item | Status |
|---|---|
| `understand()` emits the exact contract on all fixtures | ✅ 16/16 offline + contract gate on the live run |
| "what is the remaining?" + prior balance turn → uc HIGH, capability wallet, ec LOW | ✅ proven — see the full output above (uc 0.95 / wallet / ec 0.10, reference resolved to the prior wallet turn) |
| Live replies byte-identical shadow vs off | ✅ structural: the shadow result is consumed by `logMiss` ONLY (nothing reads it back); launch is fire-and-forget; flush runs AFTER the reply bytes. Final byte-proof on prod = `B192_LIVE_TEST.md` §2 (deterministic confirm-card compare) — needs deploy. |
| A shadow row lands in `m8_router_misses` | ⏳ needs deploy (his OK) — `B192_LIVE_TEST.md` §1 is the script |

## Honest caveats (named, per doctrine)

1. **Scored pass-rate, not byte determinism** — accepted step down in rigor for MEANING, named in the plan §"How this stays testable".
2. **Shared circuit breaker:** the shadow's Groq call uses the same `llm.js` cooldown map as live calls. A shadow-triggered 429 cools Groq for 60s for live fallbacks too. This is *correct* (a Groq rate limit is org-wide real state, live calls would 429 identically), but it's the one indirect coupling — noted so nobody "discovers" it later. Single-user cadence makes it a non-issue outside burst tests.
3. **Clarifier-pick turns don't fire a shadow** (the bare "wallet"/"fleet" answer to a did-you-mean ask) — deliberate; that turn's meaning is the pick token.
4. **Groq free-tier TPM** (~8k/min vs ~2k tokens/call) is the real prod constraint: fast consecutive turns can 429 the shadow → `understand:error` rows. Shadow fails safe; the S3 promotion decision should read the error rate alongside the agreement rate.

## What's next (the ladder, unchanged)

- **Soak:** a few days of shadow rows → compare `understand:*` vs live verdicts (`agree=` field).
- **S2:** fold reference resolution deeper (replace the word-list continuation stub) — still shadow.
- **S3:** promote to authority for READS + gate the web fallback (this is where "remaining" stops googling), on the soak evidence.
