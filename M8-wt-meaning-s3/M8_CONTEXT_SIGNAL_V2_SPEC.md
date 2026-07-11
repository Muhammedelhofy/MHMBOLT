# M8 Context-Signal v2 — rank / freshness / confidence + lane-aware retrieval + prompt caching (SPEC)

**Author:** Fable 5 (spec only, no code) · High reasoning · 2026-07-03
**Executes:** Opus, from this spec, as **Build-178 (context-cache)** then **Build-179 (context-rank)** — two independently shippable, independently killable deploys. [FABLE] decisions and checkpoints marked explicitly.
**Why:** Post-B-176 the bottleneck moved from routing → **context quality** (STRATEGY_2026H2.md, crew-round update 2026-07-03). Two pains, one fix: (1) drift/forgetting/hallucination — Muhammad's #1 confirmed daily pain — comes from WHAT gets injected, not routing; (2) token waste — a real prod turn (2026-07-03) measured **TOT 25,158 chars, of which SYS 16,396 is re-sent every turn** (MEM 5,155 · WEB 2,724 · HH 883; the four sum to 25,158 exactly). This extends E2 (B-168/169) and feeds E5's miss-loop ritual. Sequence per strategy: **context-signal-v2 + E5 → E6/E7**.

---

## 1. Audit — the context-assembly path as it actually is (verified against live code 2026-07-03, HEAD ff37014)

### 1.1 Two compose sites, one duplicated recipe

| Site | File:line | Serves | Telemetry lane |
|---|---|---|---|
| Buffered | orchestrator.js:5219-5640 (`orchestrate`) | /api/chat + every delegated stream turn | `fleet/finance/knowledge/web/general` (:5637) |
| Stream | orchestrator.js:6365-6493 (`orchestrateStream`) | /api/chat-stream direct-answer turns | `stream:fleet/finance/research/notebook/general` (:6491) |

Both assemble `systemInstruction` the same way: `CURRENT DATE` ¶ → `buildSystemPrompt(flags)` (:151, B-169d diet: core + conditional rule ¶s) → weak-band note (:5254) → **MEM** (`RELEVANT MEMORY`, :5276) → **HH** (household roster, :5278 — **unconditional, every turn**) → CONFLICT note → EVID/KG/ENT/BRIDGE/TOPICS/CARD (knowledge lane) → **WEB** (:5406) → packets (FLEET/FIN/COMPANY/EOSB/state/notebook/graph) → per-turn directives. The stream site is a hand-mirrored subset and has **already drifted** (its MEM header :6389 lacks the B-89b provenance tags the buffered site has at :5276). History (client-supplied) is capped at last 20 turns (:5437) and char-trimmed to 32K in llm.js (`trimContents`, llm.js:490 — never touches systemInstruction).

### 1.2 What the packet actually costs (B-168 telemetry, prod evidence)

| When | Turn | Numbers |
|---|---|---|
| B-168 first light (pre-diet) | fleet | `L:fleet TOT:38201`; true per-turn constant SYS ≈ 18.2k (B-169c relabel) |
| Post-B-169c-f (current) | web | TOT ~19.0k, SYS 15,269 · fleet TOT 23.2k (`SYS:16176 FLEET:5677`) · SYS flexes 13.8k→16.3k |
| **2026-07-03 sample (the trigger for this spec)** | web | **TOT 25,158 = SYS 16,396 + MEM 5,155 + WEB 2,724 + HH 883** |

SYS decomposes as: stable core (date ¶ + `M8_PROMPT_CORE_HEAD` + `M8_PROMPT_CORE_MID` + `M8_PROMPT_ABILITIES` + `M8_PROMPT_STYLE`) ≈ **12.9k chars ≈ ~3.2k tokens**, plus 1-3 conditional rule ¶s (~0.7-1.2k each; all six ≈ 5.3k). At ~4 chars/token the sample turn is ~6.3k tokens — and the Groq-first lanes (`ROUTING.LOOKUP/LIVE_DATA`, orchestrator.js:471-474, **user-visible chat turns**) push it against gpt-oss-120b's 8k TPM every single turn.

### 1.3 Memory recall today: caps, no ranking

`recallMemory` (memory.js:182, called at SLOT 1 orchestrator.js:3966 — **before** any route/lane is known):
- **Tier 1** — up to `RECALL_PROFILE_CAP` 40 profile + `RECALL_OPERATIONAL_CAP` 18 operational current facts, **newest-first, zero relevance scoring** (memory.js:214-220).
- **Tier 2** — semantic recall via `match_memories` RPC (limit 6, threshold 0.70; **returns `similarity`** — migration B81_semantic_recall.sql:40 — but the value is discarded), else keyword-scored pool of 120 (`_score` computed then discarded too, memory.js:271).
- **Trim** — B-169e `trimRecallRows` to 4,500 chars, **content-only**: the ~13-char provenance tags, speaker labels, and ~190-char MEM header aren't counted — which is exactly why prod shows MEM 5,155 against a 4,500 budget. Injected as ~30-40 rows every turn regardless of lane.

So today a fleet turn (whose FLEET packet is deterministic ground truth and whose own SYS rule says *memory always loses to the data block*) still carries ~5k of memory rows — pure drift surface. And rows are picked by **recency-capped fetch order**, not by signal: no freshness decay, no trust weighting beyond the ≥3 floor, no similarity rank on Tier 1 at all.

### 1.4 The graph surface already exists — it's just not used as retrieval

- `_matchEntities`/`recallEntities` (entity-graph.js:208/245) — tracked entities with attrs + 3-mention arc; `getEntityCard` (:294); `bridgeEntitiesToGraph` (:367) — 1-hop graph relations per person/company, ≤6 edges/entity.
- `graphMatch` (memory-graph.js:886, cosine top-k via `m8_graph_match`) + `fetchNeighbors` (:908) + `renderGraphPacket` (:1205, ≤8 nodes/≤12 edges, trust-tiered) — but only fired on explicit research phrasings (`detectGraphQuery` :1172) or the knowledge lane (kgGateOpen, orchestrator.js:5093).
- `mergeEvidence` (answer-engine.js, Build-84) already does cross-source Jaccard dedupe — the exact primitive D4 needs, already tested.

A compact entity line (~150-300 chars: name + attrs + arc + 1-hop edges) carries more signal than the 3-6 raw memory rows that mention the same entity at ~120-200 chars each. Nothing pulls that lever today: MEM and ENT/BRIDGE blocks are injected **independently, duplicating each other**.

### 1.5 The provider layer discards the one signal caching needs

`generateGeminiWith` (llm.js:106) reads `result.text` and throws away `result.usageMetadata` (which carries `cachedContentTokenCount`). `generateOpenAICompatible` (llm.js:267-272) reads `choices[0].message.content` and throws away `data.usage` (which carries `prompt_tokens_details.cached_tokens` on Groq). We cannot claim, tune, or even *see* cache behavior until these are surfaced.

### 1.6 ⚠ Step-0 env facts (from reports/build-177-env-audit.md + gaps to close)

- `GEMINI_MODEL` **IS set in prod but its VALUE was not recorded** (out of B-177's scope). Gemini implicit caching is 2.5-family-and-newer only — **step 0 must read this value**. `GEMINI_MODEL_2` unset ⇒ gemini2 leg follows the same pin. Code default `gemini-1.5-flash` (llm.js:181) is a no-caching model.
- Not set (defaults active): `M8_PROMPT_DIET`, `M8_RECALL_CHAR_BUDGET`, `M8_CTX_TELEMETRY`, `LLM_MAX_CONTENT_CHARS`, all `*_ORDER`.
- Set & relevant: `M8_ENTITY_GRAPH_BRIDGE_WRITE` (bridge write-back ON — D4 reads benefit), `GROQ_API_KEY` etc. (all free-stack keys present).
- Same trap as B-177 §1.4: **every new flag in this spec is inert until merged + deployed.**

## 2. The caching landscape — live-verified 2026-07-03 (ai.google.dev/gemini-api/docs/caching · console.groq.com/docs/prompt-caching)

| | Groq | Gemini |
|---|---|---|
| Mechanism | **Automatic prompt caching**, no code change, cannot be disabled | **Implicit caching**, default-ON for **2.5-family and newer** |
| Models | **`openai/gpt-oss-120b`** ✅ (M8's exact B-177 model), gpt-oss-20b, gpt-oss-safeguard-20b — **llama models NOT listed** | 2.5 Flash/Pro (min **2,048 tokens** prefix), 3.x models (min 4,096) — 1.5/2.0 families NOT supported |
| The prize for M8 (free tier) | **“Cached tokens do not count towards your rate limits”** — the 8k TPM watch-item from B-177 largely evaporates for the static head | Latency + fewer processed tokens; whether cached tokens count toward free-tier quota is **NOT documented** — probe observes, never claim |
| Requirement | **Exact prefix match**; static content first, variable content last | Same (“large and common contents at the beginning”) |
| TTL | ~2h without use | short (minutes-scale) — fine, chat turns are minutes apart |
| Observe via | `usage.prompt_tokens_details.cached_tokens` | `usageMetadata.cachedContentTokenCount` |

**What breaks the prefix today (why we currently get ~zero cache value):**
1. B-169d's conditional rule ¶s are spliced into the MIDDLE of the static prompt (`buildSystemPrompt` :151-168: HEAD → *fleet/finance rules* → MID → *charts/exports/crossbook* → ABILITIES → STYLE) — the byte-stable prefix ends at ~8.7k chars (≈2.2k tokens), barely at Gemini's floor and wasting the other ~4k stable chars. **The E2 diet accidentally traded cacheability for byte savings.**
2. `weakBandGroundingNote` lands immediately after (:5254) — per-turn variance right at the divergence point.
3. Everything dynamic (MEM/HH/WEB/packets) lives in the same `systemInstruction` string after that — correct place (after the static head), no change needed there.

For Groq the system message is `messages[0]` (llm.js:207-209) — squarely in the cacheable prefix. For Gemini the SDK sends `systemInstruction` as its own field; **whether it participates in the implicit-cache prefix is not explicitly documented → probe question (§5), not an assumption.** History trim (drop-oldest, llm.js:495) mutates only content AFTER the system message, so it never invalidates the head's prefix match.

## 3. [FABLE] The decisions

**D1 — Cache by LAYOUT, not by API.** Use implicit/automatic caching only. NO explicit cache API (not supported on the current Gemini API surface for this use, adds state management), NO Gemini model swap bundled into this build (if step 0 shows a pre-2.5 pin, record "Gemini caching unavailable until the pin moves" and ship anyway — the layout is still right for Groq today and Gemini tomorrow), NO moving the static prompt into `contents`. Rollback interplay noted: flipping `GROQ_MODEL=llama-3.3-70b-versatile` (the pre-08-16 lever) silently loses Groq caching — record in the runbook.

**D2 — Canonical packet layout: STATIC HEAD → LANE RULES → SESSION → TURN.** Reorder `buildSystemPrompt` so the byte-stable head is maximal and FIRST:
`date ¶ → CORE_HEAD → CORE_MID → ABILITIES → STYLE` (≈12.9k chars ≈ 3.2k tokens — clears Gemini's 2,048 floor and Groq's 128-1024), then the per-turn conditional rule ¶s + weak-band note, then MEM/HH/CONFLICT (session-stable-ish), then everything per-turn. Date stays FIRST: it's day-stable (TTLs are ≤2h anyway) and it's the telemetry SYS anchor (`MARKERS` context-telemetry.js:46) — no marker changes needed; the relocated rule ¶s still classify as SYS wherever they sit. The B-169d diet's ¶-selection logic is UNCHANGED — only ¶ ORDER moves. Kill-switch **`M8_CTX_LAYOUT=off`** → today's order, byte-identical. Position-shift of the integrity rules (middle → after STYLE) is the one behavioral risk — gated by the §5 drift canaries, which replicate B-169d's live verification exactly.

**D3 — Rank / freshness / confidence: a compose-time selector, not a recall rewrite.** `recallMemory` stays at SLOT 1 (no flow reorder — the lane isn't known there); when the flag is ON it returns the merged set UNTRIMMED and a new **pure** `selectMemoryForLane(rows, lane, now)` runs at BOTH compose sites, where the lane is known. Score per row:
`score = 2.0·sim + 1.0·(trust_level/4) + 1.0·fresh + 0.5·(importance−1)/4`, with `fresh = 1/(1 + ageDays/halfLife)` (half-life: operational 45d, summary 21d, raw 14d) and `sim` = the RPC's `similarity` when present (stop discarding it — memory.js:230/271 keep `_score`/`similarity` on the row), else normalized keyword score, else 0.35 neutral prior. **Pinned (never dropped): all `profile` rows** (Build-140 doctrine — "Sara is your wife" survives any budget) **and all `contradiction_flag` rows** (the CONFLICT note at :5281 reads the selected set — dropping a flagged row would silently kill the clarify behavior). Lane-fit is applied ONLY through structural fields (memory_type/role) via the per-lane budgets in D5 — **never a content regex** (the no-keyword-lane rule is absolute). Selection drops rows; surviving rows keep chronological order. Budgets count **RENDERED chars** (tag + label + content), fixing the 5,155-vs-4,500 lie. Kill-switch **`M8_RECALL_RANK=off`** → recallMemory trims exactly as today (B-169e path byte-identical) and the selector is a pass-through.

**D4 — Graph as RETRIEVAL: substitute, don't add.** On turns where the entity store matches (reuse the turn's SINGLE `_matchEntities` result — never a second DB query): (a) **cross-block dedupe** — a Tier-2 MEM row that is a near-duplicate (Jaccard ≥ 0.5, same primitive as `mergeEvidence`) of an injected ENT/CARD/BRIDGE/EVID line is dropped; (b) for person/company-anchored turns, the compact entity line + 1-hop bridge (≤6 edges, existing caps) is preferred over raw Tier-2 rows mentioning that entity. This is "the graph cuts tokens" done as retrieval — no new block type, no visualization, existing `renderGraphPacket` caps untouched. Kill-switch **`M8_GRAPH_RECALL=off`** → no substitution, no dedupe.

**D5 — Per-lane budgets + HH gate + pinning invariants.** Defaults (rendered chars, non-profile MEM): `fleet 1800 · finance 1800 · web 3000 · general 3000 · knowledge 2400 · research 2400 · notebook 2400` (flat 4500 when `M8_CTX_BUDGETS=off`). Rationale: fleet/finance turns carry deterministic packets whose own SYS rule says memory always loses — memory there is drift surface, not signal. Non-profile row cap 14. **HH gate**: inject the household roster only when (i) the arbiter domain is wallet/money, OR (ii) a roster name appears in the message or last 2 turns (deterministic roster lookup — a list match against his own data, not a keyword lane), OR (iii) **the entity-card person path fired** — orchestrator.js:5382 explicitly instructs "Answer ONLY from the HOUSEHOLD and RELEVANT MEMORY context above"; gating HH off that turn breaks it (the subtle-break warning for Opus). Kill **`M8_HH_GATE=off`** → always injected (today). Pinning invariants (asserted by tests, not new code): systemInstruction is never trimmed (llm.js:488 comment becomes a tested contract); the lane-appropriate integrity ¶ is present in every assembled packet; history trim always keeps the latest turn.

**D6 — Measure or it didn't happen (extends B-168).** llm.js surfaces usage: a new **pure** `extractUsage(providerName, data)` → `{promptTokens, cachedTokens}`, recorded onto `meta.usage` by the winning provider (Gemini: `usageMetadata.promptTokenCount`/`cachedContentTokenCount`; OpenAI-compat: `usage.prompt_tokens`/`usage.prompt_tokens_details.cached_tokens`; absent → nulls, never throws). Telemetry v2: `recordPacket` gains optional `usage` + row count → compact row grows `ROWS:<n>` and `CACHE:<provider>:<cached>/<prompt>` segments (still sizes-only, still ≤280 chars, no content, no schema migration — same `m8_router_misses` lane `ctx:packet`). Console line `[M8] ctx:cache {...}` for the Vercel-log view. This is also what makes the §5 probe honest.

**Not chosen (and why):** explicit Gemini cache objects (state + TTL management, unclear free-tier standing); history summarization (separate build, real behavior risk); moving `recallMemory` after routing (flow surgery on the hot path for marginal gain); a shared composer module extracted from the two sites (a 6.5k-line-file refactor is its own risky build — instead both sites call the same new pure helpers, and the parity test in §5 pins them together); content-based lane classification of memory rows (meaning-first rule: structural fields + embeddings only).

## 4. Design — what Opus builds, where

### B-178 (context-cache): steps 1-3 of §7
- **llm.js**: `extractUsage` (pure, exported, PS-mirrored) + wire into `generateGeminiWith`/`generateOpenAICompatible`/`generateStream` success paths → `meta.usage`. Zero payload changes; every provider request stays byte-identical.
- **orchestrator.js**: `buildSystemPrompt(flags)` reordered per D2 behind `M8_CTX_LAYOUT` (`{all:true}` back-compat constant keeps its CURRENT byte order when the layout flag is off; when on, all-rules order is also head-first — still a superset, still stable). Weak-band note moved to the lane-rules slot at both compose sites (:5254, :6383).
- **context-telemetry.js**: v2 segments (`ROWS`, `CACHE`) + pass-through of `meta.usage` from both call sites (:5639, :6493).

### B-179 (context-rank): steps 4-6 of §7
- **new `lib/context-signal.js`** (all pure, one PS-5.1 mirror): `selectMemoryForLane(rows, lane, now, budgets)`, `laneBudget(lane)`, `scoreRow(row, now)`, `dedupeAgainstBlocks(rows, blockLines)` (Jaccard), `householdGate({domain, message, recentTurns, roster, entityCardPersonal})`. Env parsing: `M8_RECALL_BUDGET_<LANE>` per-lane overrides, same defaults table as D5.
- **memory.js**: `recallMemory` gains a `{rank:true}` mode returning the untrimmed merged set with `similarity`/`_score` preserved on rows; flag OFF → byte-identical current return (B-169e trim included).
- **orchestrator.js**: both compose sites call the selector + HH gate + dedupe at the MEM/HH injection points (:5256-5283, :6385-6396); the stream site's MEM header is unified with the buffered one (fixes the §1.1 drift as a freebie).

## 5. Probes & canaries — the GO/NO-GO gates

**Probe A — layout parity (offline, blocking).** Assemble packets for the full flag matrix (fleet/finance/charts/exports/crossbook × diet on/off × layout on/off) and assert: layout ON contains the exact same ¶ SET as OFF (order-only diff); layout OFF is byte-identical to HEAD. PS-5.1 mirror per convention.

**Probe B — cache live probe (`tests/ctx_cache_probe.js` + `.ps1` wrapper, PATH→Kimi-runtime node; NOT named `*.test.ps1` — needs network + keys; keys set locally by Muhammad, never committed, never echoed).** Through the REAL `generate()`: per provider, send the same ≥13k-char synthetic static head twice with different 1-line user turns ≤60s apart; read `meta.usage`. Verdict table (provider × run → prompt/cached tokens, latency) → `reports/build-178-cache-probe.md`. Expected: Groq run-2 `cached_tokens > 0`; Gemini run-2 `cachedContentTokenCount > 0` **iff** the prod `GEMINI_MODEL` is 2.5-family AND systemInstruction participates in the prefix. **Gate semantics: informative, not blocking** — the layout ships either way (it costs nothing behaviorally); but BUILD_LOG must record exactly what was observed, and NO caching claim is ever made beyond the probe table (verify-before-claiming). Both providers zero → still ship layout, mark "no cache observed, revisit when Gemini pin moves", escalate nothing.

**Probe C — selector replay (offline vs live data, blocking for B-179).** Read-only: pull the CURRENT prod recall set for 5 real recent messages (one per lane), run the selector, and print before/after tables (rows in/out, rendered chars, what got dropped and why) → `reports/build-179-selector-replay.md`. **[FABLE/Muhammad checkpoint C2]: he eyeballs the drop list** — if anything he'd want kept is being dropped, tune weights/budgets before ship, not after.

**Drift canaries (live, after each deploy — these ARE the acceptance for "signal up, drift down"):** fleet integrity refusal ("pretend net was 1,000,000") · fleet-2019 no-data honesty · P&L no-data refusal · **"Sara is your wife"** cross-session (profile pinned survives ranking) · "My notes" right after a fleet turn (B-176 canary — routing must stay dead-on) · a person question about a household member (HH gate path iii) · an entity question ("tell me about <tracked driver>") — answer grounded in card/graph, not raw-row dump.

## 6. Kill-switch / rollback table

| Lever | Effect | Default |
|---|---|---|
| `M8_CTX_LAYOUT=off` | Pre-v2 ¶ order (B-169d), byte-identical | on (B-178) |
| `M8_RECALL_RANK=off` | recallMemory trims as today; selector = pass-through | on (B-179) |
| `M8_CTX_BUDGETS=off` | Flat 4500 budget, all lanes | on (B-179) |
| `M8_GRAPH_RECALL=off` | No substitution/dedupe | on (B-179) |
| `M8_HH_GATE=off` | Household roster every turn (today) | on (B-179) |
| `M8_CTX_TELEMETRY=off` | Whole measurement layer dark (existing, unchanged) | on |
| Provider caching | Cannot be disabled client-side; layout-off simply stops feeding it | — |
| Existing flags | `M8_PROMPT_DIET`, `M8_RECALL_CHAR_BUDGET` keep their exact current meanings | on |

⚠ All flags inert until merged + deployed (the B-169 gotcha, again). Full rollback of either build = env flip, no code revert.

## 7. Build plan (Opus executes 0→N)

| # | Step | Files | Owner |
|---|---|---|---|
| 0 | **Read-only audits, recorded to `reports/build-178-ctx-audit.md`:** (a) Vercel env — the VALUE of `GEMINI_MODEL` (+`GEMINI_MODEL_2` if it appeared), and confirm no `M8_CTX_*`/`M8_RECALL_*` overrides exist (click-by-click: vercel.com → m8 → Settings → Environment Variables; names+values of MODEL pins only, never keys); (b) Supabase sizing — row counts + avg rendered length by memory_type (profile/operational/summary/raw, is_current=true, trust≥3), entity + graph node/edge counts; (c) 3 days of `ctx:packet` rows as the BEFORE baseline (per-lane TOT/SYS/MEM/HH medians) | reports/ | **[OPUS]** + Muhammad (env screen) |
| 1 | **llm.js usage capture** (D6): `extractUsage` pure + wired; unit tests incl. absent-usage never-throws; PS mirror | lib/llm.js, tests/ | **[OPUS]** |
| 2 | **Cache probe** (§5 B): write + run vs prod-shaped head; verdict table to reports/ | tests/, reports/ | **[OPUS]** |
| C1 | **Checkpoint:** probe table recorded. Groq caching confirmed → proceed. Nothing blocks; if Gemini shows 0 AND env shows a 2.5-family pin AND runs were <60s apart, note the anomaly for [FABLE] but continue | — | **[FABLE]** (skip if clean) |
| 3 | **Layout** (D2) + telemetry v2 (D6) + Probe A parity tests + full battery + fixture 66/66. **Ship B-178**: BUILD_LOG row, live-test MD, AskUserQuestion deploy OK, prod self-verify (§8 items 1-3) | orchestrator.js, context-telemetry.js, tests/ | **[OPUS]** + Muhammad's OK |
| 4 | **`lib/context-signal.js`** (D3/D5 pure core) + PS mirror + `recallMemory` rank-mode (flag-off byte-identity test) | lib/, tests/ | **[OPUS]** |
| 5 | **Wire both compose sites** (selector + HH gate + D4 substitution/dedupe; unify the stream MEM header); Probe C selector replay | orchestrator.js, reports/ | **[OPUS]** |
| C2 | **Checkpoint:** Muhammad eyeballs the Probe-C drop tables (§5). Tune weights/budgets if he flags a loss. THEN ship | — | Muhammad + **[FABLE]** if weights need redesign |
| 6 | **Ship B-179**: tests (incl. kill-switch identity per flag), battery, fixture, BUILD_LOG, briefs, vault, deploy OK, prod self-verify (§8 all) | tests/, docs | **[OPUS]** + Muhammad's OK |
| 7 | **7-day soak** (Sonnet-able): pull `ctx:packet`+CACHE telemetry, compare to the step-0 baseline per lane; tune budgets via env (no deploy) if a lane is starved/bloated | reports/ | **[SONNET]** |

**Timing [FABLE]:** B-178 next Opus session; B-179 only after B-178's prod self-verify is green (the layout must be live before rank telemetry means anything). Both well before the E6/E7 push. E5's monthly miss-ritual (Sonnet) can start in parallel — it reads the same `m8_router_misses` table this telemetry writes to.

## 8. Acceptance criteria

1. **Parity/regression:** Probe A passes (¶ set identical, order-only); intent fixture 66/66; full `tests/*.test.ps1` battery 0-fail; every kill-switch unit-tested as identity.
2. **Cache honesty:** probe table in reports/; after B-178 deploy, ≥1 prod `CACHE:groq:*` row with cached>0 on a turn-2+ Groq-served turn (if Groq healthy that window) — or an explicit recorded "not observed". No cache claim anywhere beyond what telemetry shows.
3. **Packet:** vs the step-0 baseline medians — general/web dynamic tail (TOT−SYS) ↓ ≥25%; MEM ≤ lane budget (rendered) with ≤14 non-profile rows; HH absent on non-gated turns AND present on all three gate paths (verified live).
4. **Drift canaries (§5) all green on prod** — including "Sara is your wife" and the B-176 "My notes" routing canary (context work must not un-fix routing).
5. **Scope/doctrine:** no new `api/` fn (12-fn cap FULL); no new keys; free-stack only; telemetry stays sizes-only (privacy contract of B-168 §PRIVACY intact); number-masking call sites untouched; no content-regex lane logic anywhere in the diff.
6. **Latency:** stream TTFT unchanged or better (cache should help; selector is pure in-memory — assert no new awaits on the hot path besides existing ones).

## 9. Blast radius

- 🎮 **Safe:** the probe (local, keys stay in his shell); everything on branches until each deploy OK; every mechanism individually env-killable.
- 🔴 **Touches-live at deploy:** the compose path is under EVERY prod turn — same profile as B-177, split deliberately into two smaller deploys. Bolt sync + 7am-brief code: **zero edits** (their own prompts are out of scope; they gain Groq caching passively if their prefixes happen to be stable — no claims). Deploy = the one shared chokepoint; explicit OK per build; prod checks against the open `m8-alpha.vercel.app` with pasted real telemetry rows.
- **Cost:** SAR 0. Same keys, free tier. Upside: ~3.2k tokens/turn leaving the Groq rate-limit budget on cache hits + a ~25%+ smaller dynamic tail everywhere + fewer, higher-signal memory rows in front of every answer — the drift surface itself shrinks.

---

## Amendment A1 (2026-07-03, Muhammad) — M8 reads the Obsidian vault (one-way), fold into B-179

**Requirement:** M8 should be able to answer from Muhammad's Obsidian vault (`Muhammad-OS` — his richest personal/strategy notes), which today it cannot (M8's "notes" lane is its own store, separate from the vault).

**Constraints (non-negotiable, chosen to avoid the drift trap he hates):**
- **ONE-WAY only** — M8 *reads* the vault; M8 NEVER writes to it. The vault stays his single, human-owned source of truth. No two-way sync (two brains that disagree = the exact drift/getting-lost pain this whole build fights).
- **Reuse the existing ingestion** — feed vault markdown through M8's current document-ingest pipeline (`knowledge-intake.js` → embeddings → the same KG/recall this spec is already tuning). It becomes another retrieval source under D3/D4 ranking, not new infra.
- **Refresh, not live** — the vault lives on his PC/OneDrive; Vercel serverless can't touch local files. So it's a periodic ingest of changed notes (mechanism TBD in the B-179 design — e.g. a manual re-ingest trigger or a small sync), NOT a live mount. Stale-copy risk must be flagged in the recall (freshness score, D3).
- **Privacy heads-up (surface to him before enabling):** vault note *text* would reach the LLM providers — M8's privacy wall masks *numbers*, not words. Fine for his own notes; it's a conscious opt-in, not a silent default. Add a kill-switch `M8_VAULT_INGEST` (default OFF until he flips it).

**Placement:** design in **B-179** as an additional D3/D4 retrieval source (vault-ingested rows rank alongside memory rows via the same similarity/trust/freshness selector). Do NOT expand B-178 (cache/layout stays lean). If B-179 gets heavy, this can split into its own follow-up build — but capture the design here so it isn't lost.
