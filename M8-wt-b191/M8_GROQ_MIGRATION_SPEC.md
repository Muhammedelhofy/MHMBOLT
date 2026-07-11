# M8 Groq Migration — E3 Survival Swap (SPEC)

**Author:** Fable 5 (spec only, no code) · 2026-07-03
**Executes:** Opus, from this spec, as **Build-177**. [FABLE] decisions and checkpoints marked explicitly.
**Deadline:** Groq decommissions `llama-3.3-70b-versatile` on **2026-08-16**. M8's free-tier workhorse (intent gate, arbiter, task extraction, summaries, fact extraction, LOOKUP/LIVE_DATA chat) dies with it unless swapped first — with **no quality regression** and **no response-parser breakage**.

---

## 1. Audit — every reference to the dying model (verified against live code 2026-07-03)

Good news first: **there is exactly ONE swap point.** No caller anywhere hardcodes a Groq model; they all pass `providerOrder` strings and inherit the model from `generateGroq()`.

### 1.1 The swap point + collateral defaults (code changes land HERE only)

| # | File:line | What | Action |
|---|---|---|---|
| 1 | llm.js:299 | `process.env.GROQ_MODEL \|\| "llama-3.3-70b-versatile"` — THE default | Swap to the chosen model (§3) |
| 2 | llm.js:21, 295-298 | Header doc + the gpt-oss-blank warning comment | Rewrite to match the new reality |
| 3 | llm.js:313 (+:23) | `CEREBRAS_MODEL \|\| "llama3.3-70b"` — **this is why the Cerebras leg is dead**: Cerebras no longer serves any Llama-3.3 on public endpoints (verified 2026-07-03, inference-docs.cerebras.ai — their only production model is `gpt-oss-120b`) | Fix default to `gpt-oss-120b`, probe-gated (§4.2) |
| 4 | llm.js:329 (+:25) | `OPENROUTER_MODEL \|\| "meta-llama/llama-3.3-70b-instruct:free"` — the `:free` pool for this model shrinks as upstreams sunset it | Probe; if dead/empty, swap to a live free **non-reasoning** instruct model verified that day (§4.3). Non-blocking |

### 1.2 Consumers — Groq-first provider orders (NO code change; they inherit the swap)

`M8_INTENT_PROVIDER_ORDER` default `"groq,cerebras,gemini,gemini2,mistral,openrouter"` — domain-arbiter.js:43-44 (used :109), intent-router.js:37-38 (used :117), orchestrator.js:1541 (task extractor). Other Groq-first orders: `ROUTING.LOOKUP/LIVE_DATA` orchestrator.js:471-474 (**user-visible chat turns**), `SUMMARY_PROVIDER_ORDER` memory.js:99, `FACT_EXTRACT_PROVIDER_ORDER` memory.js:453, `M8_EXTRACT_PROVIDER_ORDER` knowledge-intake.js:248, `ROUTER_PROVIDER_ORDER` router.js:26 + fleet.js:1825, `M8_REFLECT_ORDER` reflector.js:44, `M8_CHAIN_ORDER` reasoning-chain.js:31, `M8_ENTITY_ORDER` entity-graph.js:28. Groq-third: `LLM_PROVIDER_ORDER` llm.js:15/455/509, `DEEP_ORDER` orchestrator.js:484, `DOC_PROVIDER_ORDER` deckgen.js:96/docgen.js:62. Gemini-only (untouched): answer-engine.js:41, memory-consolidator.js:31, proactive.js:23, visionProviderOrder orchestrator.js:416.

### 1.3 Confirmed NOT affected

- **Pinned `generateOnce` callers** pin gemini/anthropic/openrouter, never groq: lean.js:253-256, lemma-dag.js:222-224, conjecture-memory.js:287.
- **api/transcribe.js:35** uses Groq `whisper-large-v3` — production, not on the deprecation list.
- **`m8_kv`** holds no model/provider overrides (only notify.js reads it) — runtime override surface is Vercel env only.
- Comment orchestrator.js:1493-1494 already states the extractor calls the waterfall precisely so this decommission can't break it — true, keep.

### 1.4 ⚠ The override trap — Vercel env audit is STEP 0

If `GROQ_MODEL` is set in Vercel, **changing the code default does nothing** (same class as the "prod flag inert until merged" gotcha, mirrored). Before building, audit prod env for: `GROQ_MODEL`, `CEREBRAS_MODEL`, `OPENROUTER_MODEL`, `LLM_PROVIDER_ORDER`, `M8_INTENT_PROVIDER_ORDER`, `SUMMARY_PROVIDER_ORDER`, `FACT_EXTRACT_PROVIDER_ORDER`, `M8_EXTRACT_PROVIDER_ORDER`, `ROUTER_PROVIDER_ORDER`, `M8_REFLECT_ORDER`, `M8_CHAIN_ORDER`, `M8_ENTITY_ORDER`, `DOC_PROVIDER_ORDER`, `ANSWER_ENGINE_ORDER`. For Muhammad (click-by-click): vercel.com → project **m8** → Settings → Environment Variables → search each name → report which exist (names only, never values). Any set `*_MODEL` var must be deleted or updated in the same deploy window as the code swap.

### 1.5 Docs to update at ship time

BUILD_LOG.md (B-177 row) · NEXT_SESSION_BRIEF.md · STRATEGY_2026H2.md:57 (E3 row → done) · m8_mind_2026.html:404 + :483 (E3 entry) · vault `Projects/M8.md` · memory note `m8-llm-and-settings-maintenance`.

## 2. The model landscape — live-verified 2026-07-03 (console.groq.com/docs/{models,deprecations,reasoning,rate-limits})

The landscape moved hard since the last look; every mid-size candidate people would guess is dead or dying:

| Candidate | Status on Groq | Verdict |
|---|---|---|
| `llama-4-maverick-17b-128e` | **already decommissioned** (2026-03-09) | ☠ not an option |
| `moonshotai/kimi-k2-instruct-0905` | **already decommissioned** (2026-04-15) | ☠ not an option |
| `llama-4-scout-17b-16e` / `qwen/qwen3-32b` | preview, both die **2026-07-17** (two weeks!) | ☠ not options |
| `openai/gpt-oss-120b` | **production**; Groq's official replacement #1 for our model | ✅ **PRIMARY pick** (§3), with quirks layer — the known blank-output trap is understood and defused below |
| `qwen/qwen3.6-27b` | **preview**; official replacement #2 | ✅ Fallback #1 — quality fine, but preview = can vanish without deprecation notice; wrong tier for a survival pin |
| `llama-3.1-8b-instant` | production, explicitly recommended for older models; huge free quota (14.4K req/day) | ✅ Fallback #2 (floor) — parser-identical to today, but 70B→8B is a real quality drop; can't be primary |
| `groq/compound`, `groq/compound-mini` | production | ❌ **excluded on the privacy wall**: agentic systems with server-side web tools, not plain models |

**Free-tier limits** (vs `llama-3.3-70b-versatile` today: 1K req/day, 12K tok/min, 100K tok/day): `gpt-oss-120b` = 1K req/day, 8K tok/min, **200K tok/day** (2× daily headroom; TPM 12K→8K is the one watch-item — the B-162 payload guard trims history to ~32K chars ≈ ~8K tokens, so a single max-size turn brushes the per-minute cap; the existing 429→cooldown→next-provider machinery absorbs exactly this).

### 2.1 The parser contract, and why gpt-oss-120b returned blank

M8's parser (`generateOpenAICompatible`, llm.js:252-257) requires a **non-empty string at `choices[0].message.content`**, and the JSON callers then brace-slice it loosely (`_looseJson` orchestrator.js:1515, `_extractJson` domain-arbiter.js, intent-router.js) — so content must be **clean final text**: no empty content, no `<think>` preamble (stray braces inside reasoning would corrupt the loose JSON slice).

gpt-oss models are reasoning models. Per Groq's live reasoning docs: by default (`include_reasoning: true`) reasoning is delivered in `message.reasoning`, and reasoning tokens **count against `max_tokens`**. Two failure components follow: (a) M8's Groq-first JSON calls cap output at **60 / 100 / 200 tokens** (arbiter domain-arbiter.js:111, task extractor orchestrator.js:1542, money intent intent-router.js:120) — a reasoning model can burn that whole budget before emitting any `content`; (b) history — the 2026-06-30 swap attempt was actually **deployed and reverted**: it blanked even on the prod chat path at a 2048-token budget, i.e. under default serving the final text did not land in `message.content` at all. **Both components are defused by the same documented params:** `include_reasoning: false` (answer lands complete in `message.content`) + `reasoning_effort: "low"` + a floor on `max_tokens` for reasoning-class models. For qwen3.6-27b the equivalents are `reasoning_format: "hidden"` + `reasoning_effort: "none"` (and Groq requires `reasoning_format` ∈ {parsed, hidden} with JSON mode anyway).

**Nothing is adopted on doc faith — §5's live probe through M8's real parser is the gate.** Docs said things about gpt-oss before and prod said otherwise; the probe is the tiebreaker, run against the real `lib/llm.js`.

## 3. [FABLE] The decision

**Primary: `openai/gpt-oss-120b`** — production tier, Groq's official migration target, top quality among survivors (kills the quality-regression risk that the 8B floor carries), 2× daily token headroom, no new key, free tier. Adopted **only if it passes the §5 probe**; the quirks layer (§4.1) is what makes it parser-safe.

**Decision tree (probe-driven, in order):**
1. `gpt-oss-120b` + quirks passes all probe shapes → adopt. *(expected path)*
2. Else `qwen/qwen3.6-27b` + quirks passes → adopt, and note the preview-tier risk in BUILD_LOG (re-check at each Groq deprecation email).
3. Else `llama-3.1-8b-instant` (no quirks needed) → adopt as floor **and** prepend `gemini,gemini2` to `ROUTING.LOOKUP/LIVE_DATA` (orchestrator.js:471-474) so user-visible chat turns don't eat the 8B quality drop; classification/extraction lanes stay groq-first (8B classifies fine).
4. All three fail a shape → **stop, escalate to [FABLE]** with the probe table. (Would mean Groq changed API semantics; don't improvise.)

**Waterfall order: unchanged** (branch 3 aside). The problem is the model id, not the order — Gemini stays first for main chat, Groq stays first for the quota-sparing lanes. The Cerebras fix (§4.2) restores the intended second free leg, so a Groq wobble once again degrades to Cerebras→Gemini instead of straight to Gemini.

## 4. Design

### 4.1 The quirks layer — one pure function, one kill-switch

New in llm.js, applied **inside `generateGroq` only** (callers untouched, waterfall signature unchanged):

```
groqQuirks(model, payload) → payload'    // PURE — exported for tests, PS-5.1 mirrored
```

- `/gpt-oss/` models → `payload.include_reasoning = false`; `payload.reasoning_effort = env M8_GROQ_REASONING_EFFORT || "low"`; `payload.max_tokens = max(payload.max_tokens || 0, M8_GROQ_MIN_MAXTOKENS default 1024)` — the floor is what protects the 60/100/200-token JSON callers from reasoning burn; free tier, so the cap costs nothing.
- `/qwen/` models → `payload.reasoning_format = "hidden"`; `payload.reasoning_effort = "none"`; same max_tokens floor.
- `/llama/` and anything else → no-op (today's behavior, byte-identical).
- Kill-switch **`M8_GROQ_QUIRKS=0`** → the function returns payload unchanged (if Groq ever changes param semantics, one env flip stops the injection). ⚠ Memory gotcha applies: the flag is inert until this code is merged + deployed.

### 4.2 Cerebras leg revival (best-effort, non-blocking)

Default → `gpt-oss-120b` (their id has no `openai/` prefix). Probe it through `generate()` with `providerOrder:"cerebras"`: try with an `include_reasoning:false` quirk in `generateCerebras`; on HTTP 400 (unknown param) retry bare; if content still blank → leave the new default but **drop `cerebras` from the default intent orders** (domain-arbiter.js:44, intent-router.js:38, orchestrator.js:1541) so no lane pays a dead hop before Gemini. Any outcome ≥ today (the leg is 100% dead now); do not let this step block the Groq swap.

### 4.3 OpenRouter default (small side-fix, non-blocking)

Probe current default via `providerOrder:"openrouter"`. If dead/empty, swap default to a free **non-reasoning** instruct model live-verified that day on openrouter.ai (bias: a Llama-family or DeepSeek-chat `:free` with plain content output; same §5 shape checks). If the current default still works, leave it and note the risk in the header comment.

## 5. The parser-compatibility probe — the GO/NO-GO gate

**`tests/groq_live_probe.js`** (+ thin `tests/groq_live_probe.ps1` wrapper that finds node via PATH→Kimi runtime, the P1-P3 harness pattern — node v24.15.0 confirmed present on this host at `%LOCALAPPDATA%\Programs\kimi-desktop\resources\resources\runtime\node.exe`). **Not** named `*.test.ps1` — it needs network + a key, so it must never enter the offline battery. Requires `$env:GROQ_API_KEY` set locally by Muhammad (never committed, never echoed — the script prints `key: set/missing` only).

The probe calls **the real `lib/llm.js generate()`** with `providerOrder:"groq"` and `GROQ_MODEL` swapped per run — so the exact prod parser path (payload build → fetch → content extraction) is what's being tested, not a lookalike. Three shapes, mirroring the live call sites byte-for-byte:

| Shape | Mirrors | genConfig | Canaries (temp 0, deterministic) | Pass = |
|---|---|---|---|---|
| A chat | orchestrator.js:5713 | `{temperature:0.4→0 for determinism, maxOutputTokens:2048}` | "Reply with exactly one word: the capital of France." (+1 Arabic canary: same ask in Arabic) | non-empty content, contains "Paris", no `<think>` |
| B arbiter | domain-arbiter.js:110-113 | `{temperature:0, maxOutputTokens:60, responseFormat:{type:"json_object"}}` | masked "spent # on fuel for the camry" with an arbiter-style system prompt → `{"domain":"wallet",...}` | valid JSON via loose brace-slice, correct domain |
| C task-extract | orchestrator.js:1542 | `{temperature:0, maxOutputTokens:100, responseFormat:{type:"json_object"}}` | "remind me to check the oil tomorrow at 9am" → `{"op":"add",...}`; +1 Arabic task canary | valid JSON, correct op, non-empty command |

Protocol: run every shape against (1) **baseline `llama-3.3-70b-versatile` — capture this NOW, while it's alive**; (2) `gpt-oss-120b` bare (expected: blanks — this run documents the June-30 trap for the record); (3) `gpt-oss-120b` + quirks; (4) `qwen3.6-27b` + quirks; (5) `llama-3.1-8b-instant`. Print one verdict table (model × shape, ✅/❌ + latency ms). **Adopt per §3's tree. A model passes only if every shape passes and the canary answers match baseline correctness.** Keep the output table in `reports/` — it's the C1 checkpoint evidence and the post-08-16 record of why we chose what we chose.

## 6. Kill-switch / instant rollback

| Lever | Effect | When |
|---|---|---|
| Vercel env `GROQ_MODEL=llama-3.3-70b-versatile` (+redeploy, no code change) | Byte-identical today-behavior (quirks no-op on llama ids) | Any wobble **before 2026-08-16** |
| `GROQ_MODEL=qwen/qwen3.6-27b` or `llama-3.1-8b-instant` | Alternate probed models, one env flip | Quality/latency complaints after 08-16 — both alternates are ALREADY probe-qualified by §5, so the flip is pre-verified, not a gamble |
| `M8_GROQ_QUIRKS=0` | Stop param injection | Groq changes param semantics |
| The waterfall itself (llm.js:455) + circuit breaker (llm.js:417-421) | Total Groq failure degrades to cerebras→gemini automatically — M8 stays alive with zero action | Always on |

## 7. Build plan (Opus executes 0→N)

| # | Step | Files | Owner |
|---|---|---|---|
| 0 | **Vercel env audit** (§1.4): list which override vars exist (names only). If `GROQ_MODEL` is set, the deploy step must change/delete it in the same window. Record findings in the session report. | — (dashboard, with Muhammad) | **[OPUS]** + Muhammad |
| 1 | **Probe first** (§5): write `tests/groq_live_probe.js` + `.ps1` wrapper; Muhammad sets `$env:GROQ_API_KEY` locally; run the full protocol **incl. the llama-3.3 baseline while it exists**; save the verdict table to `reports/`. Pick the model per §3's tree. | M8/tests/, reports/ | **[OPUS]** |
| C1 | **Checkpoint:** if the expected path holds (gpt-oss-120b + quirks ✅ all shapes) → proceed, no escalation. If the tree bottoms out (§3 branch 4) → STOP, send [FABLE] the probe table. | — | **[FABLE]** (skip if clean) |
| 2 | **llm.js change:** `groqQuirks()` pure fn + wire into `generateGroq`; swap the :299 default to the chosen model; Cerebras fix (§4.2); OpenRouter check (§4.3); rewrite header comments (:15-31, :287-298). Nothing outside llm.js except the branch-3 contingency (`ROUTING`, orchestrator.js:471-474) — expected untouched. | lib/llm.js | **[OPUS]** |
| 3 | **Tests:** `tests/build177_groq_migration_test.js` — unit-test `groqQuirks` (param injection per model family, floor logic, kill-switch off ⇒ identity) + parser-contract assertions; **PS-5.1 mirror** `tests/build177_groq_migration.test.ps1` (every pure fn mirrored, per convention; PS-only-fail+JS-pass = fix the mirror). Regression: intent fixture 66/66 + full `tests/*.test.ps1` battery 0-fail. | M8/tests/ | **[OPUS]** |
| 4 | **Ship ritual:** `tests/BUILD177_GROQ_MIGRATION_LIVE_TEST.md` + in-chat phone checks; BUILD_LOG B-177 row; brief + vault + strategy/mind-map E3 updates (§1.5). Then **AskUserQuestion for the explicit deploy OK** (push main auto-deploys prod — the one shared chokepoint; never without it). | tests/, docs, vault | **[OPUS]** + Muhammad's OK |
| 5 | **Prod self-verify** (after READY, against the OPEN prod `m8-alpha.vercel.app`, paste real responses): (a) `/api/health` → all providers ok; (b) send a task-shaped turn ("remind me to check the tyre pressure tomorrow at 9am") → confirmation correct **and** the `m8_tasks` row exists (Supabase, BOLT project `ltqpoupferwituusxwal`); (c) a LOOKUP-shaped turn answers sanely; (d) Vercel runtime logs over the window: **zero `[LLM] provider groq failed`**, ≥1 turn served with `meta.provider=groq`. Verify on his screen/logs, not assumptions. | prod | **[OPUS]** |
| 6 | **Post-08-16 sweep** (calendar note, separate 10-min check): after decommission day, re-run probe shapes on the shipped model + confirm prod logs stay clean; delete the now-dead `llama-3.3-70b-versatile` rollback row from the runbook. | — | **[OPUS]** (next session after 08-16) |

**Timing [FABLE]:** run this build the week of **2026-07-09** (quota renews per the session brief). That leaves ~5 weeks of buffer, and — critically — the baseline probe (step 1) only works while llama-3.3 is still alive. Do not let this slip past July.

## 8. Acceptance criteria

1. Chosen model passes **all three §5 shapes** through the real `lib/llm.js` parser — non-empty clean content, valid loose-JSON on B/C, canaries correct (incl. Arabic), matching the llama-3.3 baseline run.
2. Prod self-verify (step 5) all green: zero groq parse failures in the window, ≥1 groq-served turn, task write landed in `m8_tasks`.
3. Full offline battery 0-fail + intent fixture 66/66 — zero regressions.
4. Rollback documented AND pre-qualified: both alternate `GROQ_MODEL` values carry a passing probe row from step 1; `M8_GROQ_QUIRKS=0` unit-tested as identity.
5. Scope: no new `api/` function (Vercel 12-fn cap is FULL), no new keys, no paid-provider default, diff confined to llm.js + tests + docs (+ the branch-3 contingency only if taken).
6. Free-stack + privacy intact: `groq/compound*` nowhere in the diff; number-masking call sites (domain-arbiter.js:103, intent-router.js:110) untouched.

## 9. Blast radius

- 🎮 **Safe:** the probe is a local script (keys stay in his shell env); all code on a branch until the deploy OK.
- 🔴 **Touches-live at deploy only:** llm.js is under every prod LLM turn — chat, briefs, crons. Bolt sync + the 7am-brief **code** stay HANDS-OFF (zero edits in those files); their behavior shifts only in which Groq model serves them, which is exactly what §5 qualifies. Deploy = the one shared chokepoint; explicit OK required; PWA/prod checks from the production URL only.
- **Cost:** SAR 0. Same key, free tier, better daily token headroom (100K→200K TPD); TPM 12K→8K noted in §2 with the existing 429-cooldown as the absorber.
