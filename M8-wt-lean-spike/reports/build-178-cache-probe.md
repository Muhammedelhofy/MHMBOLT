# B-178 context-cache — probes (spec §5)

**Date:** 2026-07-03 · **Executor:** Opus · Gate semantics: Probe A **blocking**, Probe B **informative**.

---

## Probe A — layout parity (OFFLINE, blocking) — ✅ PASS

Ran against the **live JS** `buildSystemPrompt` extracted from both the working tree
and git HEAD (pre-B178), across the full flag matrix (fleet/finance/charts/exports/
crossbook × diet on/off), via the Kimi-node harness.

| assertion | checks | result |
|---|---|---|
| layout **OFF** byte-identical to pre-B178 HEAD | 128 | ✅ 0 fail |
| layout **ON** = same ¶ SET as OFF (order-only) | 128 | ✅ 0 fail |
| layout **ON** static-head-first (starts with CORE_HEAD+CORE_MID+ABILITIES+STYLE) | 128 | ✅ 0 fail |
| **total** | **384** | **✅ 0 fail** |

Cacheable static head = **13,940 chars** (~3.5k tokens). Telemetry section labels are
**invariant** to the reorder (analyzePacket ON == OFF: SYS/MEM/HH/WEB unchanged) — the
relocated FLEET rule ¶s still classify as SYS. PS-5.1 mirror of the same logic ships in
`tests/build178_ctx_cache.test.ps1` (43/43, in the offline battery).

## Probe B — cache LIVE probe (network + keys) — written, measured POST-DEPLOY

`tests/ctx_cache_probe.js` (+ `.ps1`, PATH→Kimi node fallback) sends the same ~14k-char
stable head twice through the REAL `lib/llm.js generate()`, two 1-line turns ~4s apart,
and reads `meta.usage` (the capture this build adds).

**Not run in this session:** the parallel worktree shell has **no API keys and no
`node_modules`** (llm.js loads `@google/genai` at require). Per §5 this probe is
INFORMATIVE, not blocking — the D2 layout ships either way. It can be run by Muhammad
(keys in his shell or `M8/.env.local`), but the **authoritative** cache evidence is the
post-deploy prod `ctx:cache` rows (acceptance #2), pasted into the BUILD_LOG.

**Expectations, from the code + provider docs (NOT a measurement — see below):**

| provider | model (prod) | caching mechanism | expect run-2 `cached>0`? |
|---|---|---|---|
| Groq | `openai/gpt-oss-120b` | automatic prompt caching (cannot disable; cached tokens don't count vs rate limit) | yes, once the stable-head prefix is warm |
| Gemini | `gemini-2.5-flash` | implicit caching (2.5-family, min 2,048-token prefix) — **applies** (head ~3.5k tokens) | yes, but free-tier quota interaction is undocumented — OBSERVE, never claim |

## C1 checkpoint

- Probe A recorded and passing → the layout is safe (order-only, byte-identical when off).
- Groq is cache-eligible in prod and `lib/llm.js` now **captures** `cached_tokens` onto
  `meta.usage` → telemetry `CACHE:groq:<cached>/<prompt>` (unit-verified in the battery).
- Gemini pin is `gemini-2.5-flash` → implicit caching applies (no anomaly to flag to Fable).
- **No cache HIT has been measured yet.** The claim "caching works" is deferred to the
  post-deploy prod telemetry, per verify-before-claiming. Proceeding to ship the layout.

---

## POST-DEPLOY prod observation (sha 9bb1b60, 2026-07-03 ~13:58Z) — the real measurement

Drove real turns against `m8-alpha.vercel.app`; read `m8_router_misses` lane `ctx:packet`.

**Telemetry v2 is live** — rows now carry `ROWS:` + `CACHE:<provider>:<cached>/<prompt>`:

| time (Z) | lane | cache segment |
|---|---|---|
| 13:58:08 | knowledge | `CACHE:gemini:0/6324` (cold) |
| 13:58:15 | knowledge | `CACHE:gemini:0/6716` (warming) |
| **13:58:24** | knowledge | **`CACHE:gemini:4050/7049`** ← HIT (4050 cached, ~57% of prompt) |
| 13:53–13:56 | web/general | `CACHE:mistral:0/…`, `CACHE:gemini:0/…` |

**Verdict — MEASURED, not assumed:**
- ✅ Gemini `gemini-2.5-flash` implicit caching **fires**: a repeat turn served **4,050 cached
  tokens** — the byte-stable static head (the D2 prefix) reused. The capture path
  (`extractUsage` → `meta.usage` → `CACHE:` row) works end-to-end in prod.
- ⚠ **Groq**: not captured with `cached>0` this window — the groq-first LOOKUP/LIVE_DATA turns
  failed over to mistral (Groq at/over its 8k TPM — the exact pressure the cache relieves once
  the prefix is warm, but Groq must first serve a turn to warm it). No `CACHE:groq:cached>0`
  observed yet; recorded as **not observed**, to monitor over normal usage — NOT claimed.
- Free-tier note (spec §2): Gemini clearly returns `cachedContentTokenCount` here, so the cache
  IS populated on the free tier; whether cached tokens are billed/counted is still undocumented
  and irrelevant to us (free stack).
