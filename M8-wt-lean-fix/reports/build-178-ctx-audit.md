# B-178 (context-cache) — Step 0 read-only audit

**Date:** 2026-07-03 · **Executor:** Opus (from `M8_CONTEXT_SIGNAL_V2_SPEC.md`, spec §7 step 0)
**Scope:** the BEFORE snapshot for B-178/B-179. Read-only. No code, no schema change.

---

## (a) Vercel env — model pins (from Muhammad's screen, 2026-07-03)

| Var | Value | Consequence |
|---|---|---|
| `GEMINI_MODEL` | **`gemini-2.5-flash`** | ✅ 2.5 family → Gemini **implicit caching APPLIES** (min 2,048-token prefix). Our static head ≈ 14k chars ≈ 3.5k tokens clears it. |
| `GEMINI_MODEL_2` | unset | gemini2 leg inherits `GEMINI_MODEL` = `gemini-2.5-flash` → caching applies on the 2nd Gemini account too. |
| `GROQ_MODEL` | unset (default `openai/gpt-oss-120b`, B-177) | ✅ Groq **automatic prompt caching** applies (model-independent; gpt-oss-120b is on Groq's cache-eligible list). |
| `M8_CTX_LAYOUT` / `M8_RECALL_*` / `M8_CTX_*` | none set | ✅ No override — B-178 flags take effect on deploy (all default ON). Rollback = env flip. |

**Verdict:** BOTH providers are cache-eligible in prod. The D2 layout feeds both. (Cross-ref `reports/build-177-env-audit.md` — the full env inventory; `GEMINI_MODEL` was SET there, value now recorded.)

## (b) Supabase sizing — `m8_conversations` recall store + graph surface (BOLT project `ltqpoupferwituusxwal`)

Recall runs over `m8_conversations` (memory_type/is_current/trust_level/contradiction_flag columns). Rows with `is_current=true AND trust_level>=3`:

| memory_type | rows | avg content chars | contradiction rows |
|---|---|---|---|
| session (raw turns) | 3,853 | 535 | 0 |
| operational | 470 | 121 | 0 |
| (untyped) | 120 | 104 | 0 |
| **profile** (pinned, Build-140) | **15** | 92 | 0 |

Graph/entity surface (D4 raw material for B-179): **entities 6 · mentions 47 · graph nodes 226 · graph edges 188.**

Notes for B-179: profile pinning is cheap (15 rows). No contradiction-flagged current rows today (the CONFLICT-note pin is a no-op right now but must stay — it's a correctness invariant, not a size line). The dominant mass is 3,853 `session` raw turns at ~535c each — the ranking/budget lever (D3/D5) acts here.

## (c) `ctx:packet` telemetry — 3-day BEFORE baseline (per-lane medians, pre-B178)

From `m8_router_misses` lane `ctx:packet`, last 3 days. Sizes in chars.

| lane | n | TOT med | SYS med | MEM med | HH med |
|---|---|---|---|---|---|
| general | 45 | 28,193 | 8,581 | 5,174 | 219 |
| web | 24 | 27,917 | 8,581 | 5,153 | 883 |
| knowledge | 9 | 22,558 | 8,581 | 5,558 | 219 |
| fleet | 8 | 25,644 | 8,581 | 6,074 | 777 |
| stream:fleet | 8 | 27,816 | 11,868 | 5,070 | 1,335 |
| stream:finance | 1 | 21,522 | 13,781 | 4,527 | 1,989 |

This is the baseline B-179's acceptance #3 compares against (dynamic tail TOT−SYS ↓ ≥25%; MEM ≤ lane budget). **B-178 itself does not aim to move these** — it is layout + telemetry only; the numbers here should stay ~flat after B-178 (layout is order-only + label-invariant, verified) and gain a new `CACHE:`/`ROWS:` segment.

---

### Layout facts measured against the LIVE code (Kimi node, this session)
- Cacheable static head (CORE_HEAD+CORE_MID+ABILITIES+STYLE) = **13,940 chars** (~3.5k tokens) — clears Gemini 2.5's 2,048-token floor and Groq's minimum. With the compose-site date ¶ prepended the stable prefix is larger.
- **Probe A (real JS, full flag matrix):** layout OFF byte-identical to pre-B178 HEAD (128/128); layout ON = same ¶ SET, order-only (128/128); ON is static-head-first (128/128). → `reports/build-178-cache-probe.md`.
- **Telemetry label-invariance:** analyzePacket() returns identical labels+sizes for ON vs OFF (SYS/MEM/HH/WEB unchanged) — the relocated FLEET rule ¶s still classify as SYS. So this baseline stays comparable after deploy.
