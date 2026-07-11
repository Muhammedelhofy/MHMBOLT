# M8 Strategy — H2 2026 (locked 2026-07-02, Fable 5 strategy session)

> **2026-07-06 addendum:** the post-Bolt lane fates + post-R6 research direction + the §5-5
> doctrine-line candidates live in [`M8_POST_BOLT_STRATEGY.md`](./M8_POST_BOLT_STRATEGY.md)
> (Fable strategy session; 🔴 items await Muhammad's call). This file stays the H2 contract.

> Outcome of the goal/roadmap/stop/evolve review (inputs: GPT + Gemini prompts, the live
> codebase, NORTH_STAR.md, the mind diagram, and Muhammad's answers). This file is the
> plain-English contract for the next 3 months. NORTH_STAR.md stays the doctrine.

---

## The goal, in one line

**M8 runs my world reliably, and its math engine produces real, citable artifacts —
and it never claims more than it can prove.**

## The Track B bar (this replaces "crack a Millennium problem")

Cracking Collatz / a Millennium problem is the *direction the vector points*, never the
deliverable. The doctrine already de-scoped Millennium-tier targets (NORTH_STAR.md).
What we measure against instead — the prize ladder:

1. **The engine itself** — autonomous conjecture→falsify→Lean-verify→learn loop. ✅ ~built (L5 streak 1/3). Already rare.
2. **A citable artifact** — public "Collatz/196 verified-conjecture census v1"
   (generated conjectures + survival stats + counterexamples + Lean-checked leaves +
   honest negative results). ← **the 12-month deliverable.**
3. **Mathlib contributions** — formalized Collatz-adjacent lemmas accepted upstream.
   The most legitimate path to "contributed to unsolved math."
4. **A new verified result** — comes *through* 2–3, never instead of them.

### The method: obstruction-driven (Muhammad's clarification, 2026-07-02)
"Unlocking" a famous problem means: **map WHY it resists everyone** (the known
obstructions, from the M2 literature packs — e.g. Collatz: no monotone decreasing
measure; 196: no provable structural invariant), then **build M8 capabilities that
attack a specific named obstruction** — only where buildable on this stack.
- The census artifact (E7) therefore ships WITH an **obstruction map**: each problem's
  known barriers, which M8 capability targets which barrier, and an honest "no
  capability exists / not buildable here" label where true.
- The conjecture generator already IS this method for Collatz: proposing and
  falsifying candidate measures/invariants = attacking the known obstruction.
- Riemann / twin prime / Navier-Stokes: their obstructions need domains (complex
  analysis, sieve theory, PDE) that don't fit this stack — mapped honestly in the
  obstruction map, but no capability build. De-scope holds.

## STOP (ranked)

1. 🔴 Millennium framing (incl. the Riemann/twin-prime/Navier-Stokes "not started" rows as goals).
2. 🔴 Career OS inside M8 — job hunt stays separate (Muhammad's ruling 2026-07-02).
3. 🔴 Ecommerce inside M8 — same ruling.
4. 🟡 New input breadth (formats/platforms/deck polish) — Senses is good enough for the mission.
5. 🟡 Self-reflection 2nd pass (B-85c) + follow-up chips (B-88) — audit under E2; park if they feed drift/latency.
6. Never build: autonomous proof search · paid always-on compute · voice-latency infra projects.

## EVOLVE — 3-month roadmap (8–12 hrs/week)

| # | Build | What | Serves |
|---|-------|------|--------|
| E1 | 🔴 Turn integrity | In-flight turn guard + version-checked memory/entity writes (stateless serverless races → stale answers) | Confirmed pain #2 |
| E2 | 🔴 Context diet | Instrument the context packet per lane, then cut: rank harder, inject less, pin instructions | Confirmed pain #1 (drift/forgetting/hallucination) |
| E3 | 🟢 Groq migration ✅ | **DONE 2026-07-03 (B-177):** `llama-3.3-70b-versatile` → `openai/gpt-oss-120b` + `groqQuirks()` reasoning-param layer; §5 live-probe qualified (real parser, EN&AR); qwen3.6-27b & llama-3.1-8b pre-qualified rollbacks. Waterfall order unchanged. Prod self-verify pending deploy OK | Survival, hard deadline — MET (5 weeks early) |
| E4 | B-159 | Finish CRUD flip + currency-filtered breakdown leak | Routing completeness |
| E5 | Miss-loop cadence | Monthly ritual: review `m8_router_misses` → teach the registry | "Understands where I'm coming from" |
| E6 | L5 promotion | 2 more clean nights → then define L6 in one paragraph before building | Track B |
| E7 | Artifact v1 | Package the census → public repo + short write-up | The new bar |
| E8 | Corpus enrichment | More real docs into the KG | Track A depth |

Month 1: E1–E3 · Month 2: E4–E6 · Month 3: E7–E8.

**Update (2026-07-03, post-B-176 + crew round):** E1 ✅ · E2 ✅ (both shipped) · **E4 ✅** — B-176's
Intent Gate finished the CRUD flip AND made routing meaning-first/always-on. **The one delta from the
crew round (Manus + GPT):** post-B-176 the bottleneck moved from *routing* → *context quality*. So the
live sequence is **E3 (Groq, hard deadline) → context-signal-v2 (rank / freshness / confidence /
lane-aware retrieval — extends E2) + E5 miss-loop → E6/E7**. The order holds; this is the only change.
(Gemini's input was off a stale brief — pushed already-STOP'd items — so it doesn't move the plan.)

## Model assignment (who builds what)

| Model | Use for | Concretely |
|-------|---------|-----------|
| **Fable 5** (7-day quota window) | The hardest reasoning: subtle multi-file root-causing, architecture judgement, concurrency design, Lean formalization, writing specs others execute | ~~E2 context diet~~ ✅ · ~~E1 turn integrity~~ ✅ · ~~Groq-migration design~~ ✅ — **NEXT: context-signal-v2 (extends E2) spec + hand-off briefs** |
| **Opus** | Solid autonomous build sessions on a clear spec | ~~E3 execution + live tests~~ ✅ (B-177) · ~~E4 (B-159)~~ ✅ (folded into B-176) · **NEXT: context-signal-v2 execution, E8 ingestion runs** |
| **Sonnet** | Routine/mechanical work | Diagram/doc updates, PS test mirrors, miss-review ritual, small polish builds |

### Fable 5 — 7-day plan  (ORIGINAL 2026-07-03 plan — ✅ ALL LANDED, kept for the record)
> **STATUS 2026-07-03:** every item below SHIPPED faster than the 7-day estimate.
> E1 ✅ (a56ee90) · E2 ✅ · Groq spec ✅ (9e4f817) → **executed as B-177 ✅ (f285be7, prod-verified)**.
> **The live "next" is NOT in this list — see the Update line above §Model assignment:
> context-signal-v2 (extends E2) + E5 miss-loop → E6/E7.**
- ~~**Day 1:** goal locked, strategy written, doctrine + diagram updated.~~ ✅
- ~~**Days 2–3:** **E2 context diet**.~~ ✅ shipped
- ~~**Days 4–5:** **E1 turn integrity** — the write-guard.~~ ✅ shipped (a56ee90)
- ~~**Day 6:** Groq-migration spec + E2/E1 live verification.~~ ✅ (spec 9e4f817; B-177 executed + prod-verified 2026-07-03)
- ~~**Day 7:** hand-off briefs.~~ ✅ (BUILD_LOG + NEXT_SESSION_BRIEF current)

## Standing constraints (unchanged)
Free-LLM default · privacy wall absolute · money never enters LLM prompts · Vercel 12-fn cap
FULL (reuse `api/ops?fn=`) · confirm-before-write · PS-5.1 test mirrors + live phone test ·
**never push M8 main without explicit OK** (auto-deploys prod).
