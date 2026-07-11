# M8 Intent Gate — Meaning-First Routing for Action Lanes (SPEC)

**Author:** Fable 5 (spec only, no code) · 2026-07-03
**Executes:** Opus, from this spec. [FABLE] checkpoints marked explicitly.
**Fixes:** M8's #1 recurring pain — keyword-regex action lanes mis-route natural phrasing, and the fallback LLM hallucinates "I can't set reminders."

---

## 1. Verdict on the prep map

The diagnosis is **correct and verified** against the code (line refs checked 2026-07-03):

- Three independent keyword gates re-decide the same question; gate 2 (`TASK_PRESENT`, capability-registry.js:60) already matches "remind me" correctly, but gate 3 (`_CAP_TASK_RE` orchestrator.js:2968 + `_CAP_ACTION_RE` :2972, gate at :3034) discards that answer because `M8_REGISTRY_CRUD` defaults OFF (orchestrator.js:3601) and `_CAP_ACTION_RE` lacks "remind".
- `FLIP_SAFE_DOMAINS = ["knowledge","web","memory"]` (semantic-router.js:269) hard-excludes action lanes from semantic routing, by design.
- The fallback LLM prompt (`buildSystemPrompt`, orchestrator.js:135) contains **no capability list at all**, and no re-dispatch mechanism exists — hence "I can't."
- Full inventory: **8 distinct re-deciding gates** in the main handle path (~orchestrator.js:3825-3888): driver_profile parser, `classifyTaskCommand`, arbiter wallet⇄fleet, wallet parser, notes parser, money-note migration, `capabilityFallback`, plus standalone `_fleetVeto`/`looksFinance`/`_MONEY_PLAUSIBLE` re-checks at :2417, :2433-2435, :2849.

**One addition the prep map missed:** routing is only half the bug. Once routed, lane extraction is **also pure regex** — tasks via `_addFrom()` + time regexes (orchestrator.js:1274), wallet via `parseAmountCurrency`/`parseAddExpense` (:1604/:1620). A meaning-first router that hands "remind me today at 9:47 pm about the match" to a regex extractor that can't parse it would just move the fall-through one level deeper. The fix must include a **no-silent-fall-through rule inside lanes** (§3.4), or the whack-a-mole continues under a new name.

## 2. Answer to the open design question

**(b) — one intent decision per turn, trusted by all downstream gates.** Option (a) (flip on `M8_REGISTRY_CRUD` + patch `_CAP_ACTION_RE`) fixes exactly one phrasing family and leaves 8 gates and 3 word-lists to keep in sync — it IS the whack-a-mole. Build-152 already proved pattern (b) for wallet⇄fleet: one `arbitrate()` call whose `arb.domain` is trusted by the wallet handler and the capability veto (orchestrator.js:3861-3862, :3000-3002). This spec extends that proven pattern to all action lanes.

Not a rewrite: the existing lane handlers, arbiter, registry, and semantic router all stay. What changes is **who decides** (one gate instead of eight) and **what happens on parse failure** (LLM-extract or ask, never silent fall-through, never "I can't").

## 3. Architecture

### 3.1 `resolveIntent()` — the single gate

New function in orchestrator.js (or extending `resolveDomainRoute`, Opus's call), runs **once per turn, unconditionally, before any lane**:

```
intent = {
  domain,        // tasks | wallet | fleet | finance | notes | driver_profile | chat | ...
  band,          // "strong" | "medium" | "weak" | "none"
  confidence,    // numeric, from registry pickDomain / semantic cosine
  runnerUp, why  // for logging + clarifier text
}
```

Inputs, in order:
1. **Registry scoring, always-on.** `scoreMessage()` + `pickDomain()` (capability-registry.js:111/:127) are pure regex, zero-cost — remove the flag gating that currently keeps them off (`M8_REGISTRY_ROUTER`/`LOOKUP`/`CRUD` check at orchestrator.js:3602). They run on every message.
2. **Existing wallet⇄fleet arbiter** (`arbitrate()`) — kept as-is; its verdict feeds the intent object for money-domain messages (it is the senior authority for wallet-vs-fleet, per B-152).
3. **Semantic confirmation, only for the medium band** (see 3.2) — reuses `scoreSemantic()` cosine + margin (semantic-router.js:221). This respects the existing COST GUARD philosophy: embeddings only when the cheap gate is unsure. If embeddings are unavailable/flag off, medium band degrades to ASK (never to silent fall-through).

### 3.2 Confidence bands — the decision table

| Band | Definition | Action |
|---|---|---|
| **strong** | Registry STRONG regex (score 2), or `pickDomain` unambiguous with conf ≥ 0.9, or semantic confirms a PRESENT signal (cosine ≥ 0.85 AND margin ≥ 0.15 — the existing `FLIP_CONF`/`FLIP_MARGIN` constants) | Route to lane. Lane MUST handle it (§3.4). |
| **medium** | PRESENT-level signal (score 1) but ambiguous / low margin | Run semantic. Confirms → promote to strong. Doesn't confirm (or embeddings unavailable) → **ASK** one clarifier, reusing the arbiter's `clarifierText` pattern (orchestrator.js:3861). |
| **weak** | Sub-PRESENT or conflicting signals | Fall to LLM **with grounding note**: "the user may be asking for ⟨domain action⟩ — M8 CAN do this; if that's the intent, confirm it back, never decline." |
| **none** | No action signal | Normal chat LLM (still carries the capability list, §3.5). |

Ask-when-unsure replaces guess-or-decline. A wrong ASK costs one tap; a wrong write or a false "I can't" costs trust.

### 3.3 Downstream gates become consumers, not deciders

- Each lane handler receives `intent` and runs when `intent.domain` matches — **OR** when its legacy exact-command regex hits (union, not intersection: today's exact commands keep working even where registry coverage is thinner; zero regression risk).
- Current handler **precedence order is preserved** (driver_profile first at :3835, then tasks :3847, arbiter :3857, wallet :3862, notes :3868, migration :3872) — the intent gate decides *whether*, order decides *who first* when legacy regexes overlap.
- `capabilityFallback` (:2988): **delete** `_CAP_TASK_RE`/`_CAP_NOTE_RE`/`_CAP_ACTION_RE` re-decisions; it becomes a pure consumer of `intent` (fires its rescue when `intent.domain ∈ {tasks, notes, driver_profile}` and no lane claimed the message). The `_fleetVeto` already consumes `arb.domain` — extend the same style to consume `intent`.
- The standalone re-checks at :2417, :2433-2435, :2849 are re-pointed at `intent`/`arb` (most become one-line reads).
- `FLIP_SAFE_DOMAINS` stays untouched. Action lanes never auto-flip on semantics alone — semantic scores only *confirm* a registry PRESENT signal or *break ties*, they never originate a route into a write-capable lane. (This is the safety line that makes meaning-first routing acceptable for lanes that write.)

### 3.4 No-silent-fall-through inside lanes (the missing half)

Once a lane accepts a message with band=strong, it owns it. Three-step ladder:
1. Existing regex parser (`classifyTaskCommand`/`_addFrom`, `parseAddExpense`) — unchanged fast path.
2. Regex fails → **one LLM extraction call** (free Groq tier, per the free-stack default): strict JSON schema per lane, e.g. tasks `{op, title, due_iso, category?, recur?}`, wallet `{op, amount, currency, category?, note?}`. Temperature 0, reject on schema mismatch.
3. Extraction fails/ambiguous → **ASK** ("Set a reminder — what time / what's it about?"), never fall through to the general LLM, never decline.

This kills the phrasing whack-a-mole at the extraction layer too: new phrasings no longer require new regexes, they require nothing.

### 3.5 Capability-grounded fallback — the "never lie" guarantee

Two independent layers, so even a total routing miss can't produce "I can't":
1. **Capability list in `buildSystemPrompt`** (new constant, e.g. `M8_PROMPT_ABILITIES`): a short enumerated list of what M8 genuinely does (reminders/tasks, wallet expenses, fleet Qs, notes, driver profiles, briefs…) + the hard rule: *"You must NEVER claim you lack one of these abilities. If the user seems to want one, confirm the action back or ask a clarifying question."* Goes into every fallback prompt (the constant-composition at :135-151), not just weak-band ones.
2. **Weak-band grounding note** (§3.2) names the suspected domain specifically.

Optional layer 3 (Opus may defer to a follow-up build): a one-shot re-dispatch sentinel — fallback LLM may emit `⟦ROUTE:tasks⟧` when it recognizes an action request; orchestrator detects it, re-enters `resolveIntent` with the domain pinned, max one retry (loop guard). The existing `TASK_SENTINEL`/`MONEY_SENTINEL` invisible-char machinery is precedent for sentinel plumbing.

### 3.6 Flags

- Retire `M8_REGISTRY_CRUD`-as-enabler (registry scoring becomes always-on default behavior).
- One new kill-switch: `M8_INTENT_GATE` — default **ON**, `"0"` reverts to legacy gate order. Read from env like the existing flags. ⚠ Gotcha (memory): prod flags are inert until merged — the kill-switch only helps after the build is deployed, it is not a pre-deploy safety.

## 4. Build plan

Fixture-first: the test set comes from Muhammad's REAL phrasings (the explicit target), mined before any routing code changes.

| # | Step | Files | Owner |
|---|---|---|---|
| 0 | **Mine real phrasings.** Pull `role='user'` rows from Supabase `m8_conversations` (writer: lib/memory.js:470) + `m8_router_misses` (lib/miss-logger.js). Hand-label ~60-100 messages with expected domain (+ expected extraction for task/wallet adds). Write fixture `M8/tests/fixtures/routing_phrasings.json` + failing test `M8/tests/intent_gate_test.js` + PS 5.1 mirror (per the PS-mirror gotchas memory: PS-only fail + JS pass = test bug). Include "remind me today at 9:47 pm about the match" verbatim. | M8/tests/* | **[OPUS]** |
| 1 | **`resolveIntent()` + always-on registry.** Build the gate per §3.1-3.2 (semantic leg stubbed: medium band → ASK for now). Thread `intent` through the handle path; convert the 8 gates to consumers per §3.3; delete `_CAP_*_RE` re-decisions in `capabilityFallback`. Add `M8_INTENT_GATE` kill-switch. Log every decision via existing `logRoute`/`logMiss`. | lib/orchestrator.js, lib/capability-registry.js | **[OPUS]** |
| 2 | **Ask-when-unsure clarifier** for the medium band, reusing arbiter `clarifierText` style; wire `CLARIFY_SENTINEL` context-carry so the follow-up answer resolves the pending intent. | lib/orchestrator.js, lib/domain-arbiter.js | **[OPUS]** |
| 3 | **Capability-grounded prompt.** `M8_PROMPT_ABILITIES` constant + never-decline rule into `buildSystemPrompt`; weak-band grounding note. Add negative tests: for each fixture phrasing forced down the fallback path, assert the reply does NOT match /can'?t|don'?t have the ability|unable/i-style declines (test via mock LLM or string-level prompt assertions). | lib/orchestrator.js | **[OPUS]** |
| 4 | **In-lane LLM extraction ladder** (§3.4) for tasks + wallet: JSON-schema Groq call on regex-parse failure, ASK on extraction failure. ⚠ Waterfall note: `llama-3.3-70b-versatile` decommissions 2026-08-16 — call through the existing LLM waterfall, don't hardcode the model. | lib/orchestrator.js (+ wallet module) | **[OPUS]** |
| 5 | **Semantic tiebreaker** for the medium band (§3.2): call `scoreSemantic` only when band=medium; promote on ≥0.85/≥0.15; graceful degrade to ASK when embeddings off. Add tasks/wallet exemplars from step-0 real phrasings (exemplars exist but were never consulted for these domains). `FLIP_SAFE_DOMAINS` untouched. | lib/semantic-router.js, lib/orchestrator.js | **[OPUS]** |
| C1 | **Checkpoint — after step 1:** review Opus's final decision table + the consumer-conversion diff of the 8 gates. Only escalate if the union rule (legacy regex OR intent) creates a precedence conflict Opus can't resolve cleanly (most likely spot: driver_profile vs wallet on salary/rental phrasings). | — | **[FABLE]** (skip if step-0 fixture passes clean) |
| C2 | **Checkpoint — before deploy:** read the full fixture run results (JS + PS) + a sample of `m8_router_misses` decisions from a dry run. Verdict on ship. | — | **[FABLE]** |
| 6 | **Ship ritual:** `M8/tests/BUILD_LIVE_TEST.md` + live-chat questions (per live-test-script memory), BUILD_LOG entry, vault `Projects/M8.md` update, session brief. Deploy needs Muhammad's explicit OK (push to main auto-deploys prod — the one shared chokepoint). PWA verification from prod only. | M8/tests/, M8/BUILD_LOG.md, vault | **[OPUS]** + Muhammad's OK |

Steps 0-3 are the core fix and shippable alone (they kill both the mis-route and the hallucination). Steps 4-5 are the durability layer; they can be the same build or the next one — recommended same build, they're small.

## 5. Acceptance criteria

1. "remind me today at 9:47 pm about the match" → task created with due 21:47 today, title "the match" — via registry PRESENT → strong/medium → tasks lane → (regex or LLM-extract). Three independent rescues where today there are zero.
2. Every fixture phrasing routes to its labeled domain **or** produces a single clarifying question. Zero silent fall-throughs to ungrounded LLM for labeled action phrasings.
3. No reply, on any path, claims M8 lacks an ability it has (regex-audited over fixture-run outputs).
4. All existing exact-command phrasings still route identically (regression fixture from current passing tests).
5. No new keyword lane was added anywhere in the diff — reviewable claim: the diff must NET-DELETE action-gate regexes (removes `_CAP_TASK_RE`/`_CAP_NOTE_RE`/`_CAP_ACTION_RE` decisions; adds none).

## 6. Blast radius & hands-off

- 🎮 Safe: routing/prompt code paths, tests, fixtures — all local until deploy.
- 🔴 Touches-live at deploy time only: orchestrator is the prod chat path. Kill-switch `M8_INTENT_GATE=0` (post-deploy only). Bolt sync + 7am brief code: **HANDS-OFF, not in scope, must not appear in the diff.**
- Cost: +0 for strong/none bands (regex only); one embedding call on medium band (already cost-guard philosophy); one Groq call only when a routed action message defeats the regex parser. All free tier.
