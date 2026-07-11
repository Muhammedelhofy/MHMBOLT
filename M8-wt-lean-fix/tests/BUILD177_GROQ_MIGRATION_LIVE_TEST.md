# Build-177 — Groq migration (llama-3.3 → gpt-oss-120b) · LIVE TEST

Live URL: https://m8-alpha.vercel.app  ·  Verify on YOUR screen / Vercel logs, not the DB.

**What shipped:** Groq's `llama-3.3-70b-versatile` is decommissioned **2026-08-16**. It was M8's
free-tier workhorse (intent gate, arbiter, task extraction, summaries, fact extraction, LOOKUP/
LIVE_DATA chat). Swapped the single default (`lib/llm.js` GROQ_MODEL) to **`openai/gpt-oss-120b`**
— Groq's official production replacement — with a new `groqQuirks()` layer that makes this
*reasoning* model return clean final text through M8's OpenAI-compat parser (the 2026-06-30
blank-output trap is defused: `include_reasoning:false` + `reasoning_effort:low` + a max_tokens
floor of 1024 so the small-cap JSON callers can't be starved by reasoning burn).

**Why it's safe:** every consumer inherits the model via `providerOrder` — there was exactly ONE
swap point, no caller hardcodes a model. The waterfall order is unchanged. Cerebras's dead 2nd
free leg was also pointed at `gpt-oss-120b` (best-effort revival). The §5 live probe qualified
gpt-oss-120b through the REAL parser on 2026-07-03 (see `reports/build-177-probe.md`).

**Kill-switches / rollback:**
- `GROQ_MODEL=llama-3.3-70b-versatile` in Vercel env → byte-identical old behaviour (quirks no-op
  on llama), no code change. Use for ANY wobble **before 2026-08-16**.
- `GROQ_MODEL=qwen/qwen3.6-27b` or `llama-3.1-8b-instant` → both ALREADY probe-qualified (pre-
  verified alternates, one env flip). Use after 08-16 for quality/latency complaints.
- `M8_GROQ_QUIRKS=0` → stops the param injection if Groq ever changes reasoning-param semantics.
- `M8_GROQ_REASONING_EFFORT` (default `low`), `M8_GROQ_MIN_MAXTOKENS` (default `1024`) → tuning.

**Telemetry (Vercel logs):** watch for `meta.provider=groq` on served turns and — the failure to
watch — `[LLM] provider groq failed:`. Zero of the latter over the window = healthy.

---

## A) Groq still serves (the swap works)

1. Open https://m8-alpha.vercel.app. Send a normal chat: **"give me one line of encouragement"**.
   - Should answer normally. In Vercel logs the turn may show `meta.provider=groq` (LOOKUP/LIVE_DATA
     lanes are groq-first) or gemini (main chat is gemini-first) — either is fine; no error.
2. Send a LOOKUP-shaped turn: **"what's the capital of Japan?"** → "Tokyo". Sane, non-empty.
   - This lane is groq-first → most likely served by gpt-oss-120b. No `<think>` leakage in the reply.

## B) The JSON lanes survive (arbiter + task extractor — the blank-trap targets)

3. **"remind me to check the tyre pressure tomorrow at 9am"**
   - → "Added … 'check the tyre pressure' (tomorrow at 9am)" (or a clarify ASK). NEVER a flat reply
     or a capability-lie. The task extractor uses a groq-first 100-token JSON call — if gpt-oss
     blanked, this would break. It must work.
   - Confirm the row exists: Supabase project `ltqpoupferwituusxwal` → `m8_tasks` → newest row.
4. **"spent 45 on groceries today"** (wallet arbiter, a groq-first 60-token JSON call)
   - → logged as a wallet expense / the wallet flow, NOT mis-routed. (Arbiter returned valid JSON.)
5. **Arabic task:** **"ذكرني أعبّي بنزين بكرة الساعة ٨"**
   - → creates the reminder (Arabic task JSON parsed cleanly). The probe verified AR task JSON.

## C) Logs are clean

6. Vercel → project **m8** → Logs, over the test window:
   - **ZERO** `[LLM] provider groq failed: groq ... no text` lines.
   - At least one turn with `meta.provider=groq`.
   - No `All LLM providers failed`.

## D) Rollback drill (optional, proves the lever)

7. Set `GROQ_MODEL=llama-3.3-70b-versatile` in Vercel → redeploy → repeat step 3. Still works
   (llama path, quirks no-op). Unset again to return to gpt-oss-120b. This is the pre-08-16 safety net.

---

### Offline evidence (already green this build)
- §5 live probe: `reports/build-177-probe.md` — gpt-oss-120b+quirks passes chat + arbiter-JSON +
  task-JSON, EN & AR, matching the llama-3.3 baseline; bare gpt-oss documents the trap; qwen &
  llama-3.1-8b both pass (pre-qualified rollbacks).
- `tests/build177_groq_migration_test.js` — 19/19 (groqQuirks contract + parser-contract).
- `tests/build177_groq_migration.test.ps1` — 29/29 (PS mirror + source wiring).
- Full `tests/*.test.ps1` battery 26/26 0-fail; intent fixture 66/66 — zero regressions.
