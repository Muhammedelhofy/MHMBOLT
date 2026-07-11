# Build-183 — Travel lane PHASE A (travel-core): Step-0 audit

**Date:** 2026-07-03 · **Author:** Opus (high) · from `M8_TRAVEL_LANE_SPEC.md` (Fable)
**Worktree:** off `origin/main` (bd3e56f — "Build-182: mark LIVE-VERIFIED")
**Scope:** Phase A only (travel-core, NO new key). Phase B (Amadeus flight search) is a later build.
**Renumber note:** the spec labels Phase A "B-182"; B-182 was already taken (Sonnet's Arabic-relation build), so per the spec's own "renumber if another build lands first" this ships as **B-183** (Muhammad's instruction confirms).

## Env / doctrine facts confirmed against live code

| Check | Result |
|---|---|
| `M8_TRAVEL_*` env referenced anywhere | **NONE** — clean slate |
| `AMADEUS_*` / `flightSearch` / `lib/travel` referenced | **NONE** — Phase B is unbuilt, as expected |
| Existing `travel` DOMAIN token in registry/semantic | **NONE** — travel vocabulary is scattered (intentClassifier LIVE_DATA, slots.js TOPICS, WEB_PRESENT) exactly per §1.1 |
| `USER_HOME` origin | **hardcoded** `slots.js:19` = `"Riyadh"` → §D3 env-lift to `M8_HOME_CITY` (default Riyadh, behaviour-identical) |
| `api/*.js` function count (Hobby cap 12) | **12/12 FULL** — zero new functions this build (§D7); all travel logic is in-process |
| Free-stack keys (per B-177 audit) | GROQ / GEMINI / SERPER / TAVILY present; **no travel/flight key** — Phase A needs none |

## D3 origin source (2) — home-city PROFILE memory row

No structured "home city" profile field exists in the schema. The step-0 contract (§7 step 0):
> if none, note that source 3 (env) will serve until he states it in chat once.

**Decision:** origin resolution order is (1) **stated/confirmed in conversation** (the LLM extractor reads it) →
(2) **best-effort profile scan** of the injected memory rows (`profileHomeCity()` — a light "lives/based in X"
regex, returns null when absent) → (3) **`M8_HOME_CITY` env, default `Riyadh`**. In practice source 3 serves
until Muhammad states his origin once; when he does, the extractor carries it as `source:"stated"|"confirmed"`
and the confirm line is dropped. Every inferred origin is stated out loud with an invitation to correct (§D3).

## Compose-site / stream check (the two-site drift trap)

Confirmed: a travel turn is **not** `streamable` (orchestrator.js:6590 — travel is neither fleet/finance/state/
notebook/graph/openProblem/buildQuery/tutor/conversational/isPersonal), so `orchestrateStream` **delegates** to
buffered `orchestrate()` with the precomputed route. Travel is therefore composed in **ONE** site (buffered
SLOT-2 region), never re-implemented on the stream path — matching the B-178 single-compose discipline.

## Blast radius (this build)

- 🎮 **Safe / new:** `lib/travel.js` (pure composers + fail-safe LLM extractor), semantic exemplars, fixture cases, unit tests + PS mirrors — all offline-testable, all behind `M8_TRAVEL_LANE` (default on).
- 🔴 **Touches-live at deploy:** `capability-registry.js` DOMAINS/REGISTRY (+ the flag-gated travel score) and the orchestrator SLOT-2 region — under every prod turn. Mitigated by: the kill-switch identity test (`M8_TRAVEL_LANE=off` ⇒ `scoreMessage`/`resolveIntent` byte-identical), the full routing fixture, and the standard drift battery. **Bolt sync, 7am brief, crons, number-masking: zero edits.**
