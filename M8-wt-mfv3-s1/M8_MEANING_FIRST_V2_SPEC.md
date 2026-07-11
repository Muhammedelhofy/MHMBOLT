# M8 Meaning-First Routing v2 — Closing the Last Keyword Gaps (SPEC)

**Author:** Fable 5 · high effort · 2026-07-07 · branch `spec/meaning-first-v2` (worktree `M8-wt-meaning-v2`), **unmerged, spec only, no build**
**Executes:** Opus, from this spec. [FABLE] checkpoints marked explicitly.
**Supersedes nothing — completes `M8_INTENT_GATE_SPEC.md` (B-176).** That spec fixed *routing*; this one fixes the three failure modes that survive it.
**The pain (verbatim constraint):** "linking word→answer will never work — I can phrase the same question infinite ways." Route by MEANING, or ASK. Never a new content-keyword lane. Never a false "I can't."

---

## 1. Honest state audit — what is ALREADY meaning-first (do not rebuild)

Verified against `origin/main` @ `10d76b1`, 2026-07-07. Every line ref re-checked this session.

| Shipped piece | Where | What it guarantees |
|---|---|---|
| **One intent decision per turn** — `resolveIntent()`, always-on, pure | capability-registry.js:212, wired orchestrator.js:3910-3931 | 8 re-deciding gates became consumers; registry signal beats `*_context` lean |
| **Semantic tiebreaker** (medium-band write forks, confirm-only) | orchestrator.js:3933-3956 | meaning breaks a tasks⇄notes⇄wallet tie before asking; never *originates* a write route |
| **Semantic flip** (read lanes) + exemplar embeddings | semantic-router.js, B-164/166 | knowledge/web/memory route by cosine when regex is unsure |
| **Wallet⇄fleet arbiter, LLM leg on true contest** | domain-arbiter.js, B-152 | money-safety boundary is meaning-resolved, senior to the registry |
| **Tasks in-lane LLM extraction ladder** | `extractTaskLLM` orchestrator.js:1592, ladder at :1634-1642 | regex-miss → LLM normalise → deterministic re-parse → ASK. Never silent, never "I can't" |
| **Travel lane** = the model architecture | lib/travel.js (B-183/187/189) | registry row = ownership only; ALL slot parsing is one LLM extractor; clarify-once on ambiguity |
| **Never-decline abilities prompt**, every turn | `M8_PROMPT_ABILITIES` orchestrator.js:135-144, pushed at :196 | the fallback LLM is told what M8 CAN do + the hard never-deny rule |
| **Weak-band grounding note** | orchestrator.js:208, :5631, :6882 | a fall-through turn names the suspected domain to the LLM |
| **Clarify machinery** | `CLARIFY_SENTINEL` domain-arbiter.js:41, `clarifierText[For]` :220/:271 | an ASK carries invisible context so the answer resolves the pending route |

The E5 miss-loop audit (2026-07-04) found `m8_router_misses` **mined out** — no live recurring mis-routes today. v2 is therefore not a firefight; it is the *architecture completion* that stops the next fire from being possible.

## 2. The remaining keyword surfaces — the gap inventory

These are the places where a phrasing M8 has never seen still produces a wrong outcome. Ranked by trust damage.

### G1 — The zero-signal action dead-end (the #1 remaining lie path) 🔴
A task/wallet/note request that trips **no registry vocab** scores 0 → band `none` → chat → grounded LLM.
Example: *"don't let me forget the car registration renewal"* — no `remind me`, no `task`, no `note` ⇒ `TASK_PRESENT` (capability-registry.js:77) misses. The abilities prompt makes the LLM *offer correctly* ("Want me to set that reminder — what time?"). Then:
- **Dead-end:** his "yes, 9am" carries no registry signal either (`_LEAN_CUE` :205 doesn't match a bare yes) → chat again. Nothing can execute the offer. `handleTaskReference` is gated on `TASK_SENTINEL` task context (orchestrator.js:1421) — LLM offers don't carry it.
- **The reverse lie:** with no tool to call, the fallback LLM's most probable next token after "yes, 9am" is *"Done — I'll remind you at 9am."* **Nothing was written.** B-176 outlawed "I can't do X"; nothing outlaws **"I did X" when it didn't.** A false "done" is the exact manipulated-feeling failure documented in [feedback-verify-before-claiming] — worse than a false "can't", because he only discovers it when the reminder never fires.

### G2 — Wallet + notes extraction is still pure regex 🔴
`parseAddExpense`/`parseAmountCurrency` (orchestrator.js:1818/:1802) and `parseNoteCapture` (:3321) have **no LLM ladder**. A wallet-routed turn whose phrasing defeats the regex falls to `capabilityFallback`'s money card. Tasks got the ladder in B-176 step 4; wallet and notes were explicitly deferred and never picked up.

### G3 — The capability cards teach him M8's words (soft keyword residue) 🟠
`capabilityFallback` (orchestrator.js:3239) replies *"Phrase it like that and I'll handle it"* / *"e.g. 'add 50 sar lunch'"*. Honest, never a lie — but it is the word-catch model wearing a polite mask: **M8 asking the human to speak regex.** Meaning-first means M8 extracts; the card should be the last resort ASK, not the first response to a routed-but-unparsed request.

### G4 — `_NOTE_ACTION_VERBS` is a literal verb keyword lane 🟠
orchestrator.js:3299 — a 30-verb whitelist (`call|text|buy|renew|…`) deciding which free-form imperatives get the task-offer. It is exactly the banned pattern (open content vocabulary deciding an action), shipped pre-doctrine. Every phrasing outside the verb list silently gets nothing.

### G5 — Registry growth policy is "add more regex" 🟡
Every new ability adds STRONG/PRESENT rows (travel added ~40 alternations). The rows are fine as *accelerators* (see §3), but nothing stops a future session treating them as the *only* recognizer again — the exact regression [feedback-no-new-keyword-lanes] documents ("each session AGREES it's wrong then builds MORE keyword regex"). The doctrine has never been written down inside the repo where a coding session will actually see it.

### G6 — The abilities prompt can drift from reality 🟡
`M8_PROMPT_ABILITIES` is a hand-typed constant. When a lane is added (travel!) or renamed, nothing forces the prompt to update ⇒ the never-lie guarantee silently decays. (Checked: the current constant does not mention travel.)

**Explicitly NOT gaps (keep, with reasons):** the registry STRONG/PRESENT rows themselves (free, deterministic, PS-mirror-testable **accelerators** — see doctrine D1); the wallet⇄fleet arbiter vocab (money-safety, senior by design); sentinels (`TASK_SENTINEL`/`MONEY_SENTINEL`/`CLARIFY_SENTINEL` — invisible plumbing, not routing); the fleet/finance read lanes; closed-class confirmation words (§4.2 — a finite grammatical class, not content vocab).

## 3. The doctrine — five invariants (write into the repo, not just this spec)

This section ships verbatim as **`M8/DOCTRINE_MEANING_FIRST.md`** + a pointer from `CLAUDE_CONTEXT.md`/`AGENTS.md`, so every future coding session reads it before touching routing. That is the fix for G5's recurrence loop.

- **D1 — Regex is a cache of meaning, never a wall.** A regex may ACCEPT fast (score a domain, skip an LLM call). A regex may never REJECT alone: "no action here" may only be concluded by a meaning-capable layer (semantic score, LLM read) or end in an ASK. Corollary: a new *phrasing* must never require a new regex; only a new *ability* may add a registry row (ownership vocab + exemplars, no slot parsing).
- **D2 — One decision per turn.** `resolveIntent()` stays the single spine. New lanes consume `intent`; they never re-derive their own gate (the B-157/B-169 lesson, twice proven).
- **D3 — The model reads, the code computes.** LLMs normalise phrasing into canonical commands; deterministic code parses dates, amounts, currencies from the canonical form. No model-invented figures (the extractTaskLLM / travel-lane split, kept everywhere).
- **D4 — Never lie in either direction.** Never claim M8 lacks an ability it has (shipped, B-176 step 3). Never claim an action happened unless a LANE wrote it — a "done" without a lane sentinel is a capability lie in reverse (new, §4.4).
- **D5 — Ask beats guess for writes; act beats ask for reads.** At most ONE question per turn, and every question carries a pending-context sentinel so the answer lands (§4.2). A wrong ASK costs one tap; a wrong write or a false "done" costs trust.

## 4. Architecture — four components close all six gaps

### 4.1 The DO-sentinel: the fallback LLM becomes the recognizer of last resort (closes G1-recognition, G4)

The one place that already reads *every* zero-signal turn with full meaning capability is the fallback LLM itself. Give it a structured side-channel instead of prose-only output:

- **Prompt extension** (appended to `M8_PROMPT_ABILITIES`): *"If the user is asking you to PERFORM one of these actions — set/change/log something — rather than asking ABOUT them, reply with ONLY this marker as your whole message: `⟦DO:tasks⟧` (or `⟦DO:wallet⟧`, `⟦DO:notes⟧`, `⟦DO:driver_profile⟧`). No other text."*
- **Orchestrator intercept:** reply begins with `⟦DO:<domain>⟧` ⇒ do not emit it; re-enter the handle path once with `intent = { domain, band: "llm", why: "do_sentinel" }` pinned → the lane's extraction ladder runs on the ORIGINAL message.
- **Loop guard:** the pinned re-entry may not reach the fallback LLM again. Ladder success → §4.3 confirm-back. Ladder failure → the lane's ASK. One hop, ever.
- **Streaming:** hold emission until the first ~12 chars arrive (the marker is emitted alone and first by construction); on detection, cancel the stream and delegate to the buffered path — the exact B-169f delegate mechanism (orchestrator.js:4073-4078) already does stream→buffered handoff with a `precomputedRoute`.
- **Cost: zero new LLM calls.** The fallback call was already being made; the marker replaces its answer only when an action was recognized.
- **Menu is writes-only.** Read domains (knowledge/web/memory/fleet/finance/travel) are NOT in the marker menu — reads already have semantic routing upstream, and the grounded LLM answering a read is not a failure. Keeps the sentinel's blast radius minimal.
- **Kill-switch `M8_DO_SENTINEL`:** `shadow` (default at ship — marker is logged `do-sentinel:<domain>` via `logRoute`, then stripped, prose regenerated by re-calling without the marker rule? NO — too costly. Shadow mode instead instructs via a *separate* one-line suffix: emit the marker AFTER the prose answer; orchestrator strips + logs it, user sees only prose) · `on` (marker-only protocol, intercept acts) · `off` (rule absent from prompt, byte-identical to today). Shadow first ⇒ we measure recognition precision on real turns before it ever acts ([FABLE] C2 reads the shadow log).

G4 falls out for free: `_NOTE_ACTION_VERBS`' job — "is this free-form imperative an action?" — is exactly what the DO-sentinel decides by meaning. The verb whitelist and its offer plumbing are retired in S5 (net-delete).

### 4.2 `pendingAction` — offers and questions that can actually be accepted (closes G1-dead-end)

Generalize the arbiter's proven pending-clarify pattern (CLARIFY_SENTINEL + `originalQuestion(history)`) into ONE mechanism for every lane ASK, ladder ASK, capability card, and §4.3 confirm-back:

- Every M8 question/offer about an action is tagged with a typed invisible sentinel: `⟦PEND:tasks⟧`-style (registered next to TASK_SENTINEL/MONEY_SENTINEL; invisible chars, same family).
- On the next user turn, IF the last assistant turn carries `PEND` AND the turn is an **acceptance** (`yes/yeah/ok/sure/do it/go ahead/تمام/نعم/أيوه/اوكي` — a *closed grammatical class*, finite and stable; doctrine D1 bans open **content** vocab, not function words) or a **slot answer** (anything short that isn't a refusal):
  → re-enter the pinned lane with the composite message `⟨original user turn⟩ — ⟨this answer⟩` and re-run the ladder. Deterministic, no server-side state, mirrors `originalQuestion(history)` — the storage IS the history, same as the arbiter.
- A refusal (`no/لا/never mind/forget it`) or an unrelated turn clears the pending — no nagging, normal routing resumes.
- This single mechanism makes: LLM offer → "yes" → executed; ladder ASK ("what time?") → "9am" → executed; confirm-back → "yes" → written. All three currently dead-end (task-ref covers only task-context turns).

### 4.3 Extraction ladders for wallet + notes, confirm-back for meaning-only writes (closes G2, G3)

- **Clone the `extractTaskLLM` pattern** (the shipped, proven shape — same waterfall, temp 0, JSON, 5s timeout, `_looseJson`):
  - `extractWalletLLM`: normalise → canonical `"add <amount> <currency> <category/note>"` → deterministic `parseAddExpense` re-parse. **Privacy wall intact:** the model sees the message TEXT only — never a stored figure, never history (identical to what the task ladder already sends); replies keep `MONEY_SENTINEL`. Kill-switch `M8_WALLET_EXTRACT` (default ON, mirrors `M8_TASK_EXTRACT`).
  - `extractNoteLLM`: normalise → canonical `"note: <content>"` → `parseNoteCapture` re-parse. Kill-switch `M8_NOTE_EXTRACT`.
  - Both fire ONLY when `intent.domain` already says wallet/notes (same spend-guard as :1598-1599) — cost = one free-tier call per regex-defeating routed turn, i.e. rare.
- **Confirm-back rule (the trust boundary for writes):**
  - Deterministically recognized writes (registry strong/medium + regex or ladder parse) execute directly — unchanged, today's behavior.
  - **Meaning-only recognized writes** (arrived via DO-sentinel, band `llm`) get ONE confirm-back before writing: *"Set: renew car registration — tomorrow 9:00am. Yes?"* (tagged `PEND`). One tap; protects against an LLM misfire writing to his wallet. *(Decision, reversible: if shadow data shows near-perfect sentinel precision, drop confirm-back for tasks/notes and keep it for wallet only.)*
- **The capability cards demote to last-resort ASK text.** Order inside a routed lane becomes: regex parse → LLM ladder → ladder's specific ASK ("What should it say, and when?") — the generic "phrase it like…" card fires only when even the ASK path is impossible. Card bodies stay as the honest can/can't statements they are, sourced from §4.4's single source.

### 4.4 One capability source + the false-"done" audit (closes G6, G1-reverse-lie)

- **`CAPABILITIES` export in capability-registry.js:** per domain, plain-English `canDo: [...]` / `cantDo: [...]` lines (wallet's "can't delete an expense from chat" moves here). `M8_PROMPT_ABILITIES` is **built from it at module load** — the prompt can never drift from the registry again, and honesty runs in BOTH directions (deny-nothing-real, promise-nothing-fake). ⚠ Cache note: the string is composed once at load ⇒ still a static constant per deploy ⇒ the B-178 `M8_CTX_LAYOUT` static-head prefix (orchestrator.js:203) and Gemini implicit caching are unaffected.
- **Prompt rule added (D4's second half):** *"You cannot perform writes yourself. Never say you set, added, saved, logged, or scheduled something — a lane confirms actions, not you. Offer or ask instead."*
- **Claim audit (telemetry-first):** on any reply that reaches the user WITHOUT a lane sentinel (no TASK_SENTINEL/MONEY_SENTINEL/PEND), run a pure detector for done-claims (`/\b(?:i(?:'ve| have)? (?:set|added|saved|created|logged|scheduled|recorded)|(?:reminder|task|note|expense).{0,20}(?:set|added|saved)|done[.!])\b/i` + Arabic mirror `ضبطت|أضفت|سجلت|حفظت|تم\b`). Hit ⇒ `logRoute("claim-audit:false_done")`. **Stage 1 logs only** (zero behavior risk); a later build may escalate to rewrite-to-offer once real counts are seen. Pure function ⇒ PS-mirror-testable.

### 4.5 When M8 asks vs acts — the decision table (the policy, in one place)

| Recognition | Read lanes (knowledge/web/memory/fleet/finance/travel) | Write lanes (tasks/wallet/notes/driver_profile) |
|---|---|---|
| **strong** (registry 2 / semantic-confirmed / clarified) | act | act — regex parse, else ladder, else lane ASK |
| **medium**, unambiguous | act | act via parse→ladder; ladder fail → lane ASK |
| **medium**, contest | semantic tiebreak → act; else ONE clarifier | same (write-fork tiebreak shipped, orchestrator.js:3941) |
| **weak** (context-lean) | act on the lean | **never write off a lean** → ASK |
| **none + DO-sentinel** | n/a (reads not in menu) | extract → **confirm-back once** → write |
| **none** | grounded LLM (abilities + never-decline + never-claim-done) | same — and the DO-sentinel is watching |

Rules: at most ONE question per turn; every question/offer carries `PEND` so the answer lands; a wrong ASK is the accepted cost, a wrong write or false "done"/"can't" is never accepted.

## 5. Path off the remaining keyword lanes — staged, each stage shippable + kill-switched

| Stage | Ships | Behavior change | Retires (net-delete) |
|---|---|---|---|
| **S1** | Fixture v2: mine `m8_conversations` for (a) zero-keyword action phrasings, (b) offer→yes dead-end transcripts, (c) any false-"done" replies; hand-label ~40-60. HIS words verbatim, never invented phrasings ([feedback-verify-before-claiming] rule 3) | none (fixture + failing tests) | — |
| **S2** | DO-sentinel in **shadow** + claim-audit telemetry + `CAPABILITIES` single source | prompt text only (suffix marker, stripped) | hand-typed `M8_PROMPT_ABILITIES` body |
| **S3** | `extractWalletLLM` + `extractNoteLLM` ladders | wallet/notes regex-miss → ladder → specific ASK (was: generic card) | card as first response (demoted, not deleted) |
| **S4** | DO-sentinel **ON** + `pendingAction` + confirm-back | zero-signal actions execute after one confirm; offers/ASKs become acceptable | — |
| **S5** | Cleanup | — | `_NOTE_ACTION_VERBS` + free-form offer plumbing; any card text unreachable post-ladder |

Gate between S2→S4 = [FABLE] C2 reading the shadow log (sentinel precision on real turns). Each stage: own worktree, PS-5.1 mirror for every new pure function (marker detector, acceptance detector, claim-audit regex, ladder JSON handling), `tests/BUILD_LIVE_TEST.md`, deploy only on explicit OK.

**End-state test of the whole doctrine:** a brand-new phrasing for an existing ability requires **zero code changes** to be understood (registry hit, or ladder, or DO-sentinel — three meaning rescues deep). A brand-new ABILITY requires: one registry row (ownership vocab only) + exemplars + one `CAPABILITIES` entry — and the prompt updates itself.

## 6. Build plan

| # | Step | Files | Owner |
|---|---|---|---|
| 0 | S1 fixture + failing tests (JS + PS mirror) | tests/fixtures/meaning_v2_phrasings.json, tests/meaning_v2_test.* | **[OPUS]** |
| 1 | `CAPABILITIES` export + prompt composition + both D4 prompt rules; assert static-head byte-stability across two composes | lib/capability-registry.js, lib/orchestrator.js | **[OPUS]** |
| 2 | Claim-audit detector (pure) + `logRoute` wiring, telemetry-only | lib/orchestrator.js (or new lib/claim-audit.js) | **[OPUS]** |
| 3 | DO-sentinel: prompt rule (shadow suffix mode), intercept, strip+log, `M8_DO_SENTINEL` 3-state | lib/orchestrator.js | **[OPUS]** |
| C1 | **Checkpoint:** review sentinel prompt wording + intercept diff. LLM-prompt lesson applies: the marker rule needs a worked example in the prompt, and the marker itself must be code-guaranteed stripped | — | **[FABLE]** (skip if fixture green) |
| 4 | Wallet + notes ladders (clone task pattern) | lib/orchestrator.js | **[OPUS]** |
| 5 | `pendingAction`: PEND sentinel family, acceptance/refusal detector (closed-class), composite re-entry | lib/orchestrator.js, lib/domain-arbiter.js (reuse originalQuestion) | **[OPUS]** |
| C2 | **Checkpoint:** read `do-sentinel:*` shadow precision + `claim-audit:*` counts from prod telemetry (needs S2 deployed + a few days of his real usage). Verdict: flip `M8_DO_SENTINEL=on` + confirm-back scope | — | **[FABLE]** + his OK |
| 6 | S4 flip + S5 net-deletes + `DOCTRINE_MEANING_FIRST.md` + BUILD_LOG + live-test file + vault update | repo root, M8/tests/ | **[OPUS]** + his deploy OK |

Steps 1-3 are one shippable build (S2); 4-5 the second (S3+plumbing); 6 the flip. Recommended: three Opus sessions, disjoint files per the parallel rules if run concurrently — though 3-5 all touch orchestrator.js, so **sequential is safer here**.

## 7. Acceptance criteria

1. *"don't let me forget the car registration renewal"* → (shadow: logged `do-sentinel:tasks`) → (on: confirm-back → "yes" → task written with TASK_SENTINEL). Today: prose offer, then dead-end.
2. Offer→"yes" and ASK→slot-answer both execute via `pendingAction` — zero dead-end turns across the fixture.
3. No reply on any path claims a write happened without a lane sentinel (claim-audit count = 0 on fixture; prod telemetry trends to 0).
4. No reply denies a `CAPABILITIES.canDo` ability; no reply promises a `cantDo` one (both directions regex-audited over fixture outputs).
5. Wallet/notes phrasings that defeat the regex parser reach their ladder or a specific ASK — the generic "phrase it like that" card appears 0 times in the fixture run.
6. **Net-delete:** the S5 diff removes `_NOTE_ACTION_VERBS` + its offer plumbing and the hand-typed abilities body, and adds NO new content-keyword regex anywhere (reviewable: `git diff --stat` + grep for new alternation lists in the routing path).
7. All existing exact-command phrasings, the whole `intent_gate_test` fixture (100/100), and travel/money-safety behavior are byte-identical with all new switches `off`.

## 8. Blast radius, cost, hands-off

- 🎮 Safe until deploy: everything is local branch work; every behavior change sits behind `M8_DO_SENTINEL` / `M8_WALLET_EXTRACT` / `M8_NOTE_EXTRACT` / claim-audit (telemetry-only). ⚠ prod flags are inert until merged — switches help only post-deploy.
- 🔴 Touches-live at deploy: orchestrator.js is the prod chat path; push to main auto-deploys. Explicit OK required per stage. **HANDS-OFF: Bolt sync, 7am brief, travel lane internals, wallet⇄fleet arbiter seniority — none may appear in the diffs.**
- Cost: zero new LLM calls on every happy path. DO-sentinel piggybacks the existing fallback call; ladders fire only on regex-defeat of an already-routed turn; claim audit is a local regex. All free-stack.
- Privacy: no ladder or sentinel path ever sends stored figures or history to a model — message text only, same wall as today.
