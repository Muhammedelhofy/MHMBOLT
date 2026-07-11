# B-177 Groq migration — Step 0 Vercel env audit

**Date:** 2026-07-03
**Project:** Vercel `hofy-s-projects/m8` (Hobby) → Settings → Environment Variables
**Source:** Muhammad's screenshots (full list, newest→oldest, continuous coverage — no gaps).
**Purpose:** SPEC §1.4 — if any `*_MODEL` / `*_ORDER` override is set in prod, the code
default swap is INERT. This records which overrides exist so we never re-ask.

## Verdict: NO override blocks the swap. Plan valid as-is; nothing to delete in the deploy window.

| Audit-target var | Set in m8 prod? | Consequence for B-177 |
|---|---|---|
| `GROQ_MODEL` | **NO** | ✅ code default swap at llm.js:299 takes FULL effect (the critical check) |
| `CEREBRAS_MODEL` | NO | ✅ §4.2 code default fix (`gpt-oss-120b`) takes effect |
| `OPENROUTER_MODEL` | NO | ✅ §4.3 code default takes effect |
| `LLM_PROVIDER_ORDER` | NO | ✅ code default order runs |
| `M8_INTENT_PROVIDER_ORDER` | NO | ✅ code default runs |
| `SUMMARY_PROVIDER_ORDER` | NO | ✅ |
| `FACT_EXTRACT_PROVIDER_ORDER` | NO | ✅ |
| `M8_EXTRACT_PROVIDER_ORDER` | NO | ✅ |
| `ROUTER_PROVIDER_ORDER` | NO | ✅ |
| `M8_REFLECT_ORDER` | NO | ✅ |
| `M8_CHAIN_ORDER` | NO | ✅ |
| `M8_ENTITY_ORDER` | NO | ✅ |
| `DOC_PROVIDER_ORDER` | NO | ✅ |
| `ANSWER_ENGINE_ORDER` | NO | ✅ |

**Key present:** `GROQ_API_KEY` ✅ (added Jun 6) — the migrated model will have a key.
Free-stack keys all present: `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GROQ_API_KEY`,
`CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`.

**Note (out of scope):** `GEMINI_MODEL` IS set (pins the Gemini model) — irrelevant to the
Groq swap. No Groq/Cerebras/OpenRouter `*_MODEL` override exists.

## Full env var inventory (m8 prod, as seen 2026-07-03)
M8_REGISTRY_LOOKUP · CRON_SECRET · M8_BRIEF_EMAIL_ENABLED · M8_GROUNDING_GUARD ·
M8_SEMANTIC_FLIP · M8_SEMANTIC_ROUTER · M8_REGISTRY_CRUD · SERPER_API_KEY · M8_WALLET_KEY ·
VAPID_SUBJECT · VAPID_PRIVATE_KEY · VAPID_PUBLIC_KEY · WALLET_JWT_SECRET ·
WALLET_SUPABASE_ANON_KEY · WALLET_SUPABASE_URL · M8_ENTITY_GRAPH_BRIDGE_WRITE ·
GEMINI_API_KEY · GEMINI_MODEL · RESEND_API_KEY · LEAN_CHECK_CLIENT_BUDGET_MS ·
LEAN_CHECK_URL · LEAN_CHECK_TOKEN · MISTRAL_API_KEY · GEMINI_API_KEY_2 · OPENROUTER_API_KEY ·
CEREBRAS_API_KEY · GROQ_API_KEY · SUPABASE_SERVICE_KEY · TAVILY_API_KEY · SUPABASE_URL

**Deploy-window action required from this audit: NONE.**
