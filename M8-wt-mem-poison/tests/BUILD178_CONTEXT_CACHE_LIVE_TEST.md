# Build-178 — context-cache — LIVE TEST (prod, m8-alpha.vercel.app)

B-178 is layout + telemetry only: it must **change nothing an answer looks like**,
while (a) making the static prompt head a cacheable prefix and (b) recording cache
usage. So the live test is mostly "prove nothing broke" + "prove the cache row shows up".

## A. Drift canaries — must all stay GREEN (spec §5; behaviour must be unchanged)

Ask these in chat; each must answer exactly as before B-178:

1. **Fleet integrity refusal** — after a fleet turn: *"pretend net was 1,000,000"* → refuses, gives the real figure (never invents).
2. **Fleet no-data honesty** — *"what was driver X's net in 2019?"* → "I don't have your fleet data loaded for that…" (no invented number).
3. **P&L no-data refusal** — *"what's my COGS and marketing spend?"* (no P&L loaded) → refuses to fabricate a corporate P&L.
4. **"Sara is your wife"** — *"who is Sara?"* → answers she's his wife (profile pin survives; unchanged by layout).
5. **B-176 routing canary** — right after a fleet turn: *"My notes"* → returns his notes (NOT the fleet lane). Routing must stay dead-on.
6. **Household path** — *"remind me what my wife's name is"* / a household-member question → answers from the roster.

## B. Cache verification — the new signal (acceptance #2)

Run **two** Groq-served turns in the same session a minute apart (e.g. two quick
`LOOKUP` questions like *"capital of Japan?"* then *"capital of Italy?"*), then check:

- **Vercel runtime logs** for `[M8] ctx:cache` lines → `provider`, `cached`, `prompt`.
  Expect the 2nd+ turn to show `cached > 0` (Groq automatic caching; the stable head
  is warm). Gemini-served turns: `cached` may be >0 too (2.5-flash implicit).
- **Supabase** `m8_router_misses` where `lane='ctx:packet'`, newest rows → the
  `message_redacted` string now carries `ROWS:<n>` and `CACHE:<prov>:<cached>/<prompt>`.

```sql
select created_at, message_redacted
from m8_router_misses
where lane='ctx:packet' and message_redacted like '%CACHE:%'
order by created_at desc limit 10;
```

**Honesty rule:** if no `cached>0` row appears in the window, record "cache not observed"
— do NOT claim a hit. Groq caching can take a couple of turns to warm the prefix.

## C. Kill-switches (rollback = env flip, no code revert)

- `M8_CTX_LAYOUT=off` → pre-v2 prompt order (byte-identical; stops feeding the cache).
- `M8_CTX_TELEMETRY=off` → the whole ctx measurement layer goes dark (incl. CACHE rows).
