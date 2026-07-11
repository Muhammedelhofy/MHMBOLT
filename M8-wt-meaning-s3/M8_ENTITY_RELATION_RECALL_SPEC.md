# M8 Entity-Relation Recall — "is X my \<relation\>?" surfaces the pinned fact (SPEC)

**Author:** Fable 5 (spec only, no code) · xhigh reasoning · 2026-07-03
**Executes:** Opus · Medium, from this spec, as **Build-181 (relation-recall)** — one small, independently killable deploy. [FABLE] decisions and the one checkpoint marked explicitly.
**Why:** The B-180 residual (Session-70, prod-observed identically across 3 fresh sessions): routing is FIXED — "who is Sara?" → *"Sara is your wife, Boss…"* — but **"is Sara my wife?" returns "Could you provide more context about who Sara is?"** instead of *"Yes, Boss — Sara is your wife."* The yes/no phrasing routes off wallet correctly, then dies in a layer routing never touches. This is B-167 grounding-guard territory (the 3rd-party PII web-scrape class), which is why it gets a spec, not a same-session hack. **Routing is DONE — this build must not touch `resolveIntent`/`arbitrate`/the registry at all.**

---

## 1. Audit — the path as it actually is (verified against live code 2026-07-03, origin/main `e244ce7`; data verified read-only against the live DB)

### 1.1 The exact failure mechanism — the clarifier comes from the TOOL ROUTER's early return, with the fact sitting pinned in the store

Turn walk-through for "is Sara my wife?" (phone → `/api/chat-stream`):

| # | Stage | What happens | Where |
|---|---|---|---|
| 1 | Stream front door | `isPersonal()` is a NARROW list (`my fleet/drivers/earnings/…` + temporal `my … this week`) — "my wife" does **not** match; not conversational; no fleet/finance/state/notebook/graph packet ⇒ `streamable=false` → **delegates to the buffered `orchestrate()`** with `precomputedRoute` | orchestrator.js:6414/6423; intentClassifier.js:33-39 |
| 2 | Entity-card block | `ENTITY_CARD_QUERY_RE` matches "who is X / tell me about X / background on X" shapes ONLY — the yes/no copula shape doesn't match ⇒ `entityCardName=null` ⇒ the whole card / knownPersonCard / suppress / grounding-guard chain is **inert** | orchestrator.js:3629, 4996-5066 |
| 3 | Tool-decision router | `intent===NONE`, not personal, nothing claimed, `!entityCardSuppressSearch` ⇒ `decideAction()` runs — an LLM router that sees ONLY the raw message + last 4 turns, **never memory/household** — its prompt says clarify "when the request is too vague". "Sara" is an unknown string to it ⇒ `{action:"clarify"}` | orchestrator.js:5092-5101; router.js:46-64 |
| 4 | **Early return** | `if (decision.action === "clarify") … return decision.question;` — **the compose (MEM + HH + directives) NEVER RUNS.** No `ctx:packet` row is written — exactly matching the B-179 prod note ("never reaching the memory compose — no ctx:packet") | orchestrator.js:5098-5101 |

So the pinned fact loses not to ranking, not to routing, but to a **pre-compose early return by a memory-blind router**. Data audit (read-only SQL, BOLT Supabase, 2026-07-03): `m8_conversations` holds **two** current `profile` rows, trust 4 / importance 5, *"Muhammad's wife is Sara…"*, `contradiction_flag=false`; **zero** contradiction rows exist table-wide; `m8_entities` has **no** "Sara" row (so resolution for her is member/profile, never the card); `getMembers()` reads `household_members` (Family-Wallet DB via `pgGet`) with a 5-minute cache — `{id, name, role}` (orchestrator.js:1930-1939 renders `name (role)` in the HH block).

### 1.2 The machinery that already does this right — for the "who is X" shape

The buffered path already has a complete, prod-verified two-stage resolution (Session-2 + Build-145), keyed on `entityCardName`:

1. **Tracked card** — `getEntityCard(name)` (entity-graph.js:294; `.ilike` EXACT case-insensitive name match, :303) → `entityCard`.
2. **Known person** — `matchMember(name)` (orchestrator.js:1883 — deterministic alias/word-boundary match against HIS household members) OR a `profile` row in the already-loaded `pastMemory` containing the name (orchestrator.js:5008-5015) → `knownPersonCard`.

`entityCardSuppressSearch = !!entityCard || knownPersonCard` (:5016) then: skips the tool router (:5092), skips both regex-search blocks (:5191/:5239), and at compose injects either the ENTITY CARD block (:5429-5434) or the Build-145 known-person directive (:5435-5438 — *"Answer ONLY from the HOUSEHOLD and RELEVANT MEMORY context above… give the short honest answer (e.g. 'Sara is your wife')"*). `knownPersonCard` also feeds the B-179 HH gate path (iii) (`entityCardPersonal`, context-signal.js:269-273), so the roster is guaranteed present exactly when that directive references it. **This chain is why "who is Sara?" works. B-181 = give the yes/no shape a resolution-gated on-ramp onto this same chain.**

### 1.3 The B-167 grounding guard — how it stays closed

The guard (prod flag `M8_GROUNDING_GUARD=1` set since B-167, confirmed in reports/build-167-done.json + the B-177 env audit) fires ONLY when **`entityCardName` is set AND `!entityCardSuppressSearch`** AND not a checkable public fact (:5028) — i.e. only on an ENTITY_CARD-shaped ask that did NOT resolve to his store. It then declines honestly and web-searches only after an explicit "yes" (:4977-4985, :5068-5079). Two structural facts matter for B-181:

- The guard's trigger surface is exactly `entityCardName`. **If the new probe writes `entityCardName` ONLY on successful resolution, an unresolved "is \<stranger\> my wife?" can never reach the guard, its decline, or its consented web search.** The guard's own condition line stays byte-identical.
- `isCheckableFact` (intentClassifier.js:67-79) does not match the yes/no relation shape — no interference either way.

### 1.4 Stream-site coverage

The stream compose has **no entity-card lookup and no grounding guard at all** (stated in its own comment, orchestrator.js:6459-6461) and **no web-search capability whatsoever** (:6525-6530 — search lives only in the buffered path). Canonical yes/no relation phrasings delegate anyway (§1.1 step 1), but two edges can stream TODAY: a conversational prefix ("ok, is Sara my wife?" — `^ok\b` trips `conversational`) and a temporal tail ("…this month" trips `isPersonal` pattern 2). Streamed, they'd get MEM (profile pinned) + HH (roster-name gate ii) but no directive — caution-dependent. Precedent for the fix: `forceKnowledgeLookupS` (B-160) flips such turns non-streamable so the one full implementation site serves them (:6206, :6414).

### 1.5 Pre-existing exposure — flagged, deliberately NOT this build

For an **unresolved** personal-relation ask, `decideAction` could in principle pick `search` instead of `clarify` (its prompt routes "specific real-world facts about people" to search — router.js:59). Observed prod behavior for this shape is clarify (3/3 sessions), and this exposure predates B-181 and is untouched by it (scope: the trigger "fires ONLY when X resolves" — Muhammad's guardrail, honored literally). **Follow-up candidate (separate micro-build, [FABLE] to re-spec):** route shape-matched-but-unresolved personal-relation asks into the EXISTING B-167 decline+consent flow. Recorded here so it isn't lost; do not build it in B-181.

## 2. [FABLE] The decisions

**D1 — A separate structural probe, NOT an extension of `ENTITY_CARD_QUERY_RE`.** New pure helper `relationProbeFrom(message)` → `{ name, relation }` | `null`, module-scope next to `entityCardNameFrom`. Extending `ENTITY_CARD_QUERY_RE` itself would silently hand the yes/no shape to the grounding guard for unknown people (behavior change for strangers = exactly what the guardrail forbids) and would churn every existing B-167/entity-card test. A separate probe keeps the guard's trigger surface byte-identical and makes the resolution gate (D2) the ONLY way the shape acquires behavior.

**D2 — Resolution is the ONLY gate; on failure the probe sets NOTHING.** When the probe matches, run the EXACT Build-145 resolution (reuse, no new queries beyond the one card fetch): `getEntityCard(name)` — accepted only when `entity_type` ∈ {person, company, organization} (a place card like "Riyadh" must not claim "was Riyadh my best month?") → else `matchMember(name)` → else the `pastMemory` profile-row scan. **Resolved** ⇒ set the existing variables (`entityCardName`, `entityCard`/`knownPersonCard`) so ALL existing suppress plumbing fires unchanged (router skip :5092, search skips :5191/:5239, HH gate iii, `entity_card_search_suppressed` log) + set a new `relationAsk = { relation, via }` for compose. **Unresolved** ⇒ set nothing — every downstream byte identical to today. No `looksLikePersonName` pre-filter needed: the capture is sanity-capped (1–4 tokens, no digits) and resolution decides — chat-lowercase "is sara my wife?" resolves fine (`matchMember` and the profile scan are case-insensitive; `looksLikePersonName` would have wrongly required capitals).

**D3 — The RELATION CHECK directive (compose-time, replaces the generic Build-145 text only when `relationAsk` is set).** At the :5429/:5435 injection site:
- `entityCard` + `relationAsk` → inject the card block as today, PLUS the relation-check paragraph.
- `knownPersonCard` + `relationAsk` → inject the relation-check paragraph INSTEAD of the generic known-person text (which asks the model to narrate, not to verify).
- No `relationAsk` → today's texts byte-for-byte.

Directive wording (Opus may tighten, semantics fixed):

> RELATION CHECK: the user is asking to CONFIRM whether "\<NAME\>" is their \<relation\>. "\<NAME\>" resolves to a person in Muhammad's OWN data (via: \<household member | stored profile memory | tracked entity card\>). Answer the yes/no question DIRECTLY from the HOUSEHOLD and RELEVANT MEMORY context above (and the ENTITY CARD if present): if the stored facts CONFIRM the stated relation, answer affirmatively and plainly first (e.g. "Yes, Boss — Sara is your wife."), then at most one short supporting detail. If the stored facts record a DIFFERENT relation, correct him plainly with what memory actually says. If his data identifies the person but records nothing about this relation either way, say that honestly and offer to save it. If a NOTE above flags genuinely conflicting stored facts about "\<NAME\>", ask the one-line clarifying question instead. Do NOT ask who "\<NAME\>" is — the context above already identifies them — and do NOT use general/world knowledge or the web to confirm or deny a personal relation.

The affirm / correct / honest-unknown three-way is the point: "is Sara my sister?" must come back *"No, Boss — Sara is your wife."*, grounded in the pinned rows (§1.1 data audit), never a clarifier and never an invented confirmation. The contradiction-note deference preserves Build-147 semantics (currently 0 flagged rows, but the behavior contract must survive future flags).

**D4 — Stream site: resolved probe ⇒ delegate (B-160 pattern), no second implementation.** In `orchestrateStream`, when `relationProbeFrom(baseMessage)` matches AND resolves (via `matchMember` — 5-min cached — or the already-loaded `pastMemory` profile scan; skip the card fetch here, the delegate re-resolves it), add the flag to the `streamable` conjunction (:6414) exactly like `forceKnowledgeLookupS`. Cost: the delegate tax on a rare turn shape, already mitigated by `precomputedRoute` (B-169f). Unresolved shapes keep streaming exactly as today. This keeps ONE full implementation (buffered) and zero drift surface — the lesson §1.1 of the context-signal spec already taught us about hand-mirrored compose sites.

**D5 — Meaning-first proof (the no-keyword-lane rule, applied):** the probe recognizes a SENTENCE STRUCTURE — copula + name-span + possessive ("is|was|isn't|wasn't \<X\> my|our \<NP\>?"; AR: "هل \<X\> \<noun+possessive-suffix ي/تي\>؟") — the relation NP is **free text, captured, never enumerated**. There is NO wife/husband/brother/boss vocabulary anywhere in the diff (acceptance §7.5 greps for exactly this). Person-hood is decided by RESOLUTION against his own store (roster list, profile rows, tracked entities), not by word lists. The LLM does the semantic verification of the relation; code only decides *whose data may ground it*. Statement/tag-question shapes ("Sara is my wife", "Sara is my wife, right?") are **deliberately excluded in v1**: the bare-statement form is a fact-WRITE (consolidator territory — hijacking it into a read would be a real regression), and the tag-question split needs its own care. Deferred, noted here.

**Not chosen:** extending `ENTITY_CARD_QUERY_RE` wholesale (D1 rationale); routing unresolved shapes into the B-167 decline/consent flow (out of scope per the guardrail — §1.5 follow-up); any change to `resolveIntent`/arbiter/registry (routing is done); a deterministic answer template (the model answers; code only grounds — meaning-first); Arabic "من هي سارة؟" who-is coverage (the card RE never had AR at all — separate gap, don't smuggle it in).

## 3. Design — what Opus builds, where

- **orchestrator.js, module scope (~:3630):** `RELATION_PROBE_RE` (EN) + `RELATION_PROBE_AR_RE` + pure `relationProbeFrom(message)` → `{name, relation}|null`. Kill-switch inside the helper: `M8_RELATION_RECALL` = `off`/`0` ⇒ always `null` (single choke point, both sites dead). EN sketch (Opus finalizes + tests): `/\b(?:is|was|isn['’]?t|wasn['’]?t)\s+(.{2,40}?)\s+(?:my|our)\s+(.{2,60}?)(?:\s*[?؟.!,]|$)/i` with a 1–4-token, no-digit sanity cap on the name capture (rejects "is the weather my…"-class junk cheaply; real gate is D2). AR sketch: `/(?:هل|أليست?)\s+(.{2,40}?)\s+(\S{2,40}?(?:تي|ي))\s*[؟?!.]?$/` — best-effort v1, resolution-gated like EN.
- **orchestrator.js, entity-card block (:4987-5017):** `if (!entityCardName)` → probe → D2 resolution → on success set `entityCardName`/`entityCard`/`knownPersonCard` + `relationAsk`; log `relation_recall {entity, via}` — **logged ONLY on resolution** (never write a stranger's name into telemetry from this path).
- **orchestrator.js, compose (:5423-5439):** D3 directive wiring.
- **orchestrator.js, stream (:6404-6414):** D4 delegate flip (`relationProbeS` resolved ⇒ non-streamable).
- **tests/:** `build181_relation_recall.test.js` (Kimi node; `NODE_PATH` gotcha for worktrees) + PS-5.1 mirror `build181_relation_recall.test.ps1` (ASCII-safe, UTF-8 BOM if AR literals; `@(...)` around `Where-Object` before `.Count`); fixture anchors §7.2; live-test `tests/BUILD181_RELATION_RECALL_LIVE_TEST.md`.
- **No new `api/` fn** (12-fn cap FULL), no new key, no schema change, free-stack only, number-masking untouched.

## 4. The PII / scrape proof — every path from "is \<stranger\> my \<X\>?" to a web search or a fabricated fact

| # | Path | Today (e244ce7) | After B-181 |
|---|---|---|---|
| 1 | Tool router `decideAction` → `search` | Reachable in principle (router.js:59); observed = clarify (3/3) | **Unresolved: byte-identical** (probe sets nothing). **Resolved: CLOSED** — suppress skips the router entirely (:5092), so even Sara-shaped turns can no longer be LLM-routed to a name search |
| 2 | Regex search blocks (:5191/:5239) | Skipped (`intent===NONE` for this shape) | Unchanged; additionally hard-skipped on resolution via `entityCardSuppressSearch` |
| 3 | B-167 consented search (decline → "yes" → search) | Unreachable (RE never matches the shape) | **Still unreachable** — probe writes `entityCardName` only on resolution, and resolution forces `entityCardSuppressSearch=true`, which the guard condition (:5028) excludes. Guard code + condition line: zero diff |
| 4 | Stream path | No search exists on the stream path at all | Unchanged (resolved probes delegate; unresolved stream as today) |
| 5 | Fabricated confirmation by the LLM | Clarifier today (compose never runs) | Resolved: directive forbids world-knowledge confirm/deny, grounds in HH+MEM+card. Unresolved: today's behavior, byte-identical |

The invariant that makes rows 1–3 provable in tests: **resolution failure ⇒ the probe writes no state**. Assert it directly (§7.1).

## 5. Kill-switch / rollback

| Lever | Effect | Default |
|---|---|---|
| `M8_RELATION_RECALL=off` (or `0`) | `relationProbeFrom` returns null everywhere → buffered + stream byte-identical to e244ce7 | on (new) |
| `M8_GROUNDING_GUARD` | Untouched by this build — stays `1` in prod | unchanged |
| `M8_HH_GATE` / `M8_RECALL_RANK` / `M8_INTENT_GATE` | Existing meanings unchanged; B-181 rides on their current-ON behavior | unchanged |

Flag is default-ON in code ⇒ no env action needed to enable; the env var exists only to KILL. (Reverse of the B-169 "inert until set" trap — note it in the deploy row so nobody waits for an env flip.) Full rollback = env flip, no revert.

## 6. Build plan (Opus executes 0→6)

| # | Step | Files | Owner |
|---|---|---|---|
| 0 | Pre-flight per convention: `git fetch && git log origin/main --oneline -10` + read `reports/` — confirm no parallel session shipped this; run the full battery + fixture on clean main as baseline. Cite B-180's BUILD_LOG row as the live BEFORE (do NOT send pre-build probe turns to prod — they write memory rows) | — | **[OPUS]** |
| 1 | `relationProbeFrom` + both REs + kill-switch; unit tests: shape matrix (EN canonical / negation / lowercase / "or my sister" compound / AR; rejects: "is my wife coming" — empty name-span, "is the sky my favorite color" — resolution fails, statement "Sara is my wife" — no copula-lead, tag-questions) + PS mirror | orchestrator.js, tests/ | **[OPUS]** |
| 2 | Buffered wiring (D2+D3): resolution reuse, suppress plumbing, `relationAsk`, directive, `relation_recall` telemetry. Unit-test with stubbed `matchMember`/`pastMemory`: resolved-via-member, resolved-via-profile, card entity_type gate, **unresolved ⇒ zero state written** (the §4 invariant, asserted as compose-parity vs flag-off) | orchestrator.js, tests/ | **[OPUS]** |
| 3 | Stream wiring (D4): resolved ⇒ non-streamable; test the two §1.4 edges delegate + unresolved still streams | orchestrator.js, tests/ | **[OPUS]** |
| 4 | Fixture anchors (§7.2) + `tests/BUILD181_RELATION_RECALL_LIVE_TEST.md` (in-chat script for Muhammad, incl. the negative test with an instruction to pick a name genuinely not in his life) | tests/ | **[OPUS]** |
| C1 | **Checkpoint:** self-review the actual diff against the §4 table — if ANY of the guard condition (:5028), the consent path (:4977-4985/:5068-5079), or `decideAction`'s gate (:5092) changed in a way not listed here, STOP and escalate to [FABLE]. Otherwise proceed | — | **[OPUS]** (escalate: **[FABLE]**) |
| 5 | Full battery 0-fail (incl. build167 + entity-card-suppress suites UNTOUCHED — no assertion edits allowed in those files) + fixture green; BUILD_LOG row; briefs | tests/, docs | **[OPUS]** |
| 6 | **Ship:** AskUserQuestion deploy OK → merge→main → Vercel READY → **prod self-verify (§7.4)** → clean the test memory rows (B-167 precedent) → mark LIVE-VERIFIED, update NEXT_SESSION_BRIEF + vault | — | **[OPUS]** + Muhammad's OK |

## 7. Acceptance criteria

1. **Offline:** new JS tests + PS mirror green; **flag-off byte-identity** and **unresolved byte-identity** proven by compose-parity asserts (system-instruction string equality vs baseline), not by eyeballing.
2. **Fixture:** all existing anchors (83/83 as of B-180) still green; **new yes/no relation anchors added:** `mem-is-sara-sister` (en, context tier, `memberHit:true`, domain memory, must_not wallet/fleet — the correction case must still route memory), `mem-is-sara-wife-ar` ("هل سارة زوجتي؟", domain memory, ask_ok), `mem-is-stranger-relation` (an unresolved name, ask_ok, **must_not wallet/fleet/web**). Routing anchors only — resolution is unit-test territory.
3. **Battery:** full `tests/*.test.ps1` 0-fail; `build167_grounding_guard.test.ps1` and `entity-card-search-suppress-verify.ps1` pass **without any edits to those files**.
4. **Prod self-verify (after deploy OK), pasted real replies + Vercel log lines:**
   - "is Sara my wife?" → affirmative from the pinned fact (*"Yes, Boss — Sara is your wife"*-class), NO clarifier; logs show `relation_recall` + `entity_card_search_suppressed`, NO `tool_decision`, NO search; a `ctx:packet` row IS written (compose ran — the §1.1 tell, inverted).
   - "is Sara my sister?" → plain correction citing wife.
   - "is \<unknown name\> my wife?" → **negative test:** no fabricated confirmation, no third-party info, NO search executed, NO `relation_recall` log (unresolved = silent), reply class = today's honest clarify/no-record. Test rows cleaned after.
   - Regressions: "who is Sara?" unchanged (B-180 reply class); "how much did Sara spend in June" → wallet; "who is Khalid + phone" guard decline unchanged; fleet integrity canary ("pretend the net was 1,000,000") holds.
5. **Doctrine:** diff contains NO relation vocabulary (reviewer grep: `wife|husband|brother|sister|boss|partner` must hit only comments/tests/directive-example text, never a regex or condition); no new api fn/key; privacy wall + number masking untouched; routing files (`capability-registry.js`, `domain-arbiter.js`, `finance.js` routing SSOTs) **zero diff**.
6. **Latency:** no new await on unresolved turns (probe is pure regex + at most the existing cached member read); resolved turns replace an LLM router call with a card/member lookup — net faster.

## 8. Blast radius

- 🎮 **Safe:** pure helper + tests (offline, no keys); everything on a branch until the deploy OK; single env kill.
- 🔴 **Touches-live at deploy:** the buffered entity-card block + compose sit under every prod turn (same profile as B-180 — small, surgical, flag-killable). Bolt sync + 7am brief: **zero edits**. Deploy = the one shared chokepoint; explicit OK; self-verify against open prod with pasted replies.
- **Cost:** SAR 0. Upside: the last leg of the Sara-identity arc (B-178 found it, B-180 fixed routing, B-181 fixes recall) + one fewer LLM router call on resolved turns + the router can no longer be tempted to web-search a resolved household name.
