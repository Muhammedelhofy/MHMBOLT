# Build-169f — Live Test Script (double-routing fix on delegated turns)

🟢 Latency + log-hygiene fix; answers should not change.

## What changed
A non-streamable turn (web search, doc-gen, research, image, ask-my-docs…)
runs the router in `orchestrateStream`, then delegates to `orchestrate()` —
which used to run the WHOLE router again (arbiter + registry + the B-166
semantic LLM tie-break on a contest). That was the "double routing per turn
(~2s apart)" in the logs. The stream now passes its route through; the
buffered path reuses it and skips the duplicate `logRoute`.

Bonus consistency fix: the second run used to re-decide on the money-STRIPPED
history, so it could diverge from the front-door's decision. No longer possible.

## Live checks (m8-alpha, after deploy)

1. **Latency feel** — ask a web question mid-chat (e.g. *"weather in Riyadh
   tomorrow?"*). It should feel ~1-2s snappier than before on delegated turns.

2. **Single route row (Supabase)** — after ONE delegated turn:
   ```sql
   select created_at, lane, reason from m8_router_misses
   where lane like 'arbiter:%' order by created_at desc limit 5;
   ```
   **PASS:** ONE arbiter row per message (it used to double-log ~2s apart).

3. **Vercel logs** — one `arbiter:*`/route evaluation per message, not two.

4. **Money lanes untouched** — *"how much did Sara spend this month?"* still
   answers from the wallet; *"fleet net yesterday"* still fleet. (Wallet/fleet
   turns never delegated — this build doesn't touch their path.)

## Rollback
No flag (pure plumbing). Revert the commit if any delegated lane misbehaves;
the old double-run behavior returns.
