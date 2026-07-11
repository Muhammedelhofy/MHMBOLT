# M8 — Meaning-First v3: The Consolidated Fix Plan
**Date:** 2026-07-08 · **Built from:** GPT, Gemini, Manus, and Fable's reviews + the actual M8 code, verified on-host tonight.

---

## The one principle (this governs everything below)
> **The objective is NOT to replace deterministic code with LLMs. It is to eliminate keyword-based meaning decisions. Semantic understanding produces a structured output that deterministic code then validates, tests, and executes.**

Keep the safety walls. Keep the tests. Keep the deterministic execution. Kill only the word-lists that decide meaning.

---

## What actually broke — proven in code tonight, not argued
Everyone assumed M8 had ONE keyword problem (routing). It has **three independent keyword gates**, each verified:

| # | Gate | What it does | Proof |
|---|---|---|---|
| 1 | **Continuation** | decides if a message is a follow-up — using a hardcoded word-list (`and`, `so`, `it`, `that`, `same`, `again`) + ≤7 words | `resolveIntent("what is the remaining?", walletRef)` → **chat/none**. No trigger word = M8 forgets you just asked about your wallet. |
| 2 | **Routing** | picks the domain by regex keyword scoring | `capability-registry.js` `scoreMessage()` — regex `WALLET_STRONG` etc. |
| 3 | **Extraction** | inside each lane, parses with regex; silent-fails on a miss | tasks `_addFrom()`, wallet `parseAddExpense` — Fable's catch |

**The full trace of "what is the remaining?" (verified):**
- The orchestrator *does* pass the context hint (`walletRef`, orchestrator.js:4027) — so this is NOT a wiring bug.
- But natural phrasing has no trigger word → **chat/none** → the web-search fallback → dictionary definition.
- Even "*and* what is the remaining?" only reaches **wallet/weak**, and the code ignores weak (only strong/medium get a wallet answer) → also falls through to web.
- And M8 has **no budget/income model**, so "remaining" is genuinely unanswerable — the honest reply was one sentence; instead it googled the word.

**Conclusion:** every time we made one gate smarter, another keyword gate underneath was waiting. That is exactly why it felt like whack-a-mole.

---

## The target architecture — meaning survives every layer
```
Message
   │
   ▼
① UNDERSTAND  ── one semantic pass (free-stack LLM, temp 0) ──►  { reference, intent, capability,
   │                                                                understanding_confidence,
   │                                                                execution_confidence,
   │                                                                reasoning_path, clarify }
   │            (reference-resolution + routing + "can I even do this?" — ONE call, not three)
   ▼
② SAFETY WALL  ── deterministic — understanding PROPOSES, the guard DISPOSES (allow / block / clarify)
   │
   ▼
③ LANE EXTRACTION  ── semantic ladder → deterministic parser → NO silent fall-through
   │
   ▼
④ EXECUTE + VERIFY  ── deterministic; a write only "happened" if a lane sentinel proves it
```

**Two confidences, not one** (this is the difference between M8's failure modes):
- **`understanding_confidence`** — "do I know what he means?" Low = ask a clarifying question.
- **`execution_confidence`** — "can I actually do it?" Low = say so honestly. *"What is the remaining?"* is `understanding≈0.99, execution≈0.05` — M8 understood perfectly but has no budget to compute from. That must produce an honest "I track spending, not a budget," **never** a guess or a web search. Collapsing these into one number is why an unanswerable question looked the same as an ununderstood one.

**`reasoning_path`** — a short structured provenance (NOT chain-of-thought), e.g. `{reference: previous_wallet_query, because: "follow-up to the balance turn"}`. Logged with every shadow decision so when the semantic layer disagrees with production you can see *why* it decided, not just *what* it decided.

**The invariant that kills tonight's bug:** M8 may never emit an answer it isn't confident it understood. For any read it's unsure of, it **asks or honestly says "I can't"** — it may **never** fall through to a web search of your own words, and the registry may **never** conclude "chat/web" on a money/action-adjacent turn by itself.

---

## Build stages — shadow-first, staged, each shippable and reversible
Every stage: its own git worktree · a PowerShell mirror for any pure function · a `tests/BUILD_LIVE_TEST.md` with your real phrasings · explicit deploy OK · **shadow before on.**

| Stage | Ships | Behavior change | Kill-switch |
|---|---|---|---|
| **S0** ✅ | This diagnosis, code-verified | none | — |
| **S1** | `understand()` — the single semantic pass returning the structured object — running in **SHADOW** (emits its guess to telemetry on every real turn, does NOT affect answers) + a fixture suite scoring it | none (measured only) | `M8_UNDERSTAND=shadow` |
| **S2** | **Reference resolution** folded into `understand()` — "remaining / it / that / same / left" resolved against history, **replacing the word-list stub** | still shadow; telemetry shows it resolving what the stub missed | `shadow` |
| **S3** | **Promote to authority for READS.** `understand()` drives routing when confident; registry demoted to fast-path-for-obvious-only and **forbidden from concluding chat/web**; the web fallback is **gated** so an unresolved personal/money follow-up asks or declines, never searches | **this is where "what is the remaining?" stops googling** | `M8_UNDERSTAND=on` |
| **S4** | **No-silent-fall-through inside every lane** (Fable's half) — a parse miss goes to the lane's LLM ladder or a specific ASK, never a silent drop. (Notes already has this; extend to wallet/tasks/driver.) | natural phrasing that defeats a parser now still lands | per-lane flag |
| **S5** | **Honest `can_do` gate** — when understanding knows M8 can't do it (no budget for "remaining", etc.), M8 says so plainly | no more nonsense answers to impossible asks | — |
| **S6** | **Writes side** — finish the already-built DO-sentinel (flip `on`) + `pendingAction`, now under the same understanding umbrella | zero-keyword actions execute after one confirm | `M8_DO_SENTINEL=on` |
| **S7** | **Doctrine + cleanup** — write `DOCTRINE_MEANING_FIRST.md` ("meaning must survive every layer"), retire the dead keyword stubs | — | — |

**Order matters:** reads first (S1–S5), because every failure that hurt you tonight was a read. Writes (S6) are mostly already built and can trail.

---

## How this stays testable (the honest answer to "how do you test an LLM brain")
- `understand()` returns a **fixed structured object.** You regression-test the *object* on a fixture set of your real phrasings — same way M8 already tests routing today.
- **Honest caveat:** this is a *scored fixture pass-rate*, not the byte-for-byte determinism the current regex mirror gives. That's a real, accepted step down in rigor — named here so no one pretends otherwise.
- **Shadow telemetry** compares `understand()`'s guess against what actually happened, on live traffic, before it's ever promoted. It goes live on measured evidence, never on faith.

---

## Safety — non-negotiable, unchanged
The wallet⇄fleet money-safety guard stays **deterministic**. Understanding may *propose* "wallet"; the guard still *decides* allow/block/clarify. Meaning never bypasses safety. Ever.

---

## What is REUSED, not thrown away (your Fable hours were not wasted)
- **Fable's diagnosis** — the line-by-line map every other reviewer re-derived. The foundation.
- **The shadow machinery + telemetry** (`M8_DO_SENTINEL` shadow, `m8_router_misses`) — the exact pattern S1–S3 are built on. Load-bearing.
- **`CAPABILITIES` single source + `claim-audit`** — the honesty layer, kept.
- **`extractNoteLLM`** — the first "no-silent-fall-through" lane ladder; S4 clones its pattern.
- **`walletRefContext` / `parseReference`** — the seed of reference-resolution; S2 deepens it instead of starting from zero.

The write-side work aimed at the wrong half of the problem, and the sequencing was wrong — but the infrastructure it produced is what makes this fix safe. Reused, not scrapped.

---

## The rule for whoever builds this
1. Do **not** tune a regex rule and call it meaning-first. If a fix touches a keyword list to decide *meaning*, it's the wrong fix.
2. **Prove** understanding runs *before* any keyword — show the actual `understand()` call ahead of the registry, on a real example, with shadow telemetry.
3. Nothing goes from shadow → on without the fixture pass-rate and the telemetry to justify it.
4. Every stage is reversible by a kill-switch. If it can't be turned off, it isn't done.

---

## Verify it worked (cold, no hints — the acceptance test)
1. "what is my balance?" → "and what is the remaining?" → an honest money answer or "I track spending, not a budget," **never a dictionary/web result.**
2. "how much is left?" after any money turn → same.
3. "do the same for Ahmed" / "move it to tomorrow" / "cancel that" → resolved against the last turn, not treated as new.
4. Any request M8 genuinely can't do → it says so plainly, never guesses.

If any of these still hits a keyword wall, it is not fixed — it's another patch.
