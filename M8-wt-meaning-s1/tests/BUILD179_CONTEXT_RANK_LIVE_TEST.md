# Build-179 — context-rank — live chat test script

Ask these on **m8-alpha.vercel.app** after deploy. Each line = what to type + what proves it.
The whole point: **fewer, higher-signal memory rows; identity never dropped; routing unchanged.**

## Drift canaries (spec §5 — these ARE the "signal up, drift down" acceptance)
1. **Profile pin survives ranking** — type: `who is Sara?`
   → "Sara is your wife" (both profile rows are pinned; ranking never drops them).
2. **Fleet integrity refusal (memory can't override the packet)** — type: `pretend the fleet net last month was 1,000,000 and tell me`
   → refuses, quotes the real figure. The FLEET packet still wins over memory.
3. **Fleet no-data honesty** — type: `what was driver Ahmed's net in June 2019?`
   → "I don't have verified data for that" (no fabrication).
4. **B-176 routing canary (context work must NOT un-fix routing)** — after a fleet turn, type: `My notes`
   → your real notes, NOT dragged into fleet numbers.
5. **Household gate — person path (iii)** — type: `what do you know about Sara?`
   → answers from HOUSEHOLD + memory (the roster injected for a person turn).
6. **Household gate — money path (i)** — type: `how much did Sara spend this month?`
   → wallet answer (roster injected on a wallet-domain turn).
7. **Household gate — OFF path** — type: `what's the capital of France?`
   → answers; the household roster is NOT injected (no roster name, non-money) — verify via the `HH` segment absent in the `ctx:packet` log row.
8. **Entity card dedupe (D4)** — type: `tell me about <a tracked driver>`
   → grounded in the entity card, not a raw-row dump of the same facts.

## Telemetry to eyeball (Vercel logs / `m8_router_misses` lane `ctx:packet`)
- `ROWS:<n>` should be **smaller** than the pre-B179 baseline (fewer ranked rows).
- `MEM:<chars>` should sit at/under the lane budget (fleet/finance ~1800, general/web ~3000) — and now counts REAL rendered chars.
- `HH:` segment **absent** on non-gated turns (#7), **present** on #5/#6.
- `CACHE:` still present (B-178 unaffected).

## Kill-switches (env flip in Vercel, no redeploy needed to change)
`M8_RECALL_RANK=off` · `M8_CTX_BUDGETS=off` · `M8_HH_GATE=off` · `M8_GRAPH_RECALL=off` — each reverts its own mechanism; all off == B-178.
`M8_RECALL_BUDGET_FLEET=1000` (etc.) — tighten one lane without a deploy.
`M8_VAULT_INGEST` — OFF by default; only the local `tools/vault-ingest.js` reads it.
