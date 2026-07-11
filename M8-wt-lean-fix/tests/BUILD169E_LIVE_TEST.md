# Build-169e — Live Test Script (memory recall char budget)

🟢 Mostly invisible; one thing to watch for a few days.

## What changed
`recallMemory` now caps the recalled-memory payload at **4500 chars** (env
`M8_RECALL_CHAR_BUDGET`; `0`/`off` = no cap). Priority under the cap:
1. PROFILE facts — never trimmed ("Sara is your wife" survives any budget).
2. OPERATIONAL facts, newest first.
3. Tier-2 scored rows, in ranked order (first-fit: an oversized row is skipped,
   smaller later rows still get in).

Telemetry before: MEM floor ~5-6k on trivial asks, spikes 9-12k.

## Live checks (m8-alpha, after deploy)

1. **Identity intact** — ask: *"who is Sara?"*
   **PASS:** "your wife" (profile facts untouched by the cap).

2. **Telemetry** — after a few turns:
   ```sql
   select created_at, message_redacted from m8_router_misses
   where lane = 'ctx:packet' order by created_at desc limit 10;
   ```
   **PASS:** `MEM:` ≤ ~4700 on every row (4500 content + row labels/provenance
   tags overhead). The 9-12k spikes should be gone.

3. **Watch for a few days:** if M8 starts forgetting a RECENT business fact it
   used to recall (an operational fact aged past the cap), raise the budget:
   `M8_RECALL_CHAR_BUDGET=6000` — no redeploy of code needed.

## Rollback
`M8_RECALL_CHAR_BUDGET=0` (or `off`) → exact pre-build behavior.
