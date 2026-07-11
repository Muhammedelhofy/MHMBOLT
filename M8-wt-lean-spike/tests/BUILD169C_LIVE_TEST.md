# Build-169c — Live Test Script (telemetry label truth-up + reflector note gate)

🟢 FYI-only build for the packet MAP; one user-visible fix (the phantom note).

## What changed
1. `ctx:packet` telemetry now labels the packet truthfully:
   - the static system prompt's own "FLEET DATA INTEGRITY…" / "FLEET NO-DATA RULE…"
     paragraphs count as **SYS** (they were the phantom "FLEET 9.6k on every turn");
   - the fleet report's "COMPANY P&L" paragraphs count as **FLEET**
     (they were the phantom "COMPANY 11.5k on fleet turns");
   - the finance packet ("FLEET P&L — …") gets its own **FIN** label.
2. The reflector's user-visible note "Note: additional context may exist in
   knowledge base" only appends when the turn ACTUALLY had knowledge-graph
   context. It can no longer appear on a web/general answer (the World-Cup leak).

## Live checks (m8-alpha, after deploy)

### 1. Telemetry labels (Supabase)
Ask anything general (e.g. "how far is Jeddah from Riyadh?"), then run:

```sql
select created_at, message_redacted from m8_router_misses
where lane = 'ctx:packet' order by created_at desc limit 5;
```

**PASS:** the new row shows `SYS:~18000+` and NO `FLEET:` section (unless you
actually asked a fleet question). Before the fix every row carried `FLEET:9603`.

### 2. Fleet report labels
Ask: **"fleet report"** — the new `ctx:packet` row should show a real `FLEET:`
section and NO `COMPANY:` section (unless you asked about your companies).

### 3. Reflector note leak (chat)
Ask a live-web question the KG knows nothing about, e.g.
**"who won the last World Cup final?"**

**PASS:** the answer does NOT end with
"Note: additional context may exist in knowledge base".

### 4. Note still fires where it's true (optional)
Ask something your ingested docs DO cover but phrase it so the model answers
generically (hard to force — skip if it doesn't trigger; the flag still lands
in `m8_reflections` either way).

## Rollback
- Telemetry: `M8_CTX_TELEMETRY=off` (whole module, unchanged kill switch).
- Reflector note: no flag — revert commit if needed (behavior is strictly
  "note appears less often"; nothing else touched).
