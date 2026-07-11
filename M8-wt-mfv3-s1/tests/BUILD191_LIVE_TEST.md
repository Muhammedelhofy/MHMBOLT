# B-191 — Live test (4 transcript fixes, 2026-07-08)

Prod: `https://m8-alpha.vercel.app` · chat = `POST /api/chat {message, sessionId}`.
Run each turn in a FRESH session (a new `sessionId`) unless a step says "same session".
Deploy is gated — Muhammad gives the explicit OK to merge `feat/b191-transcript-fixes`
to `main` after reviewing this file. Do NOT merge/deploy from the build session.

---

## What broke (symptom → root cause → fix)

| # | Live symptom (his words) | Root cause (confirmed on host) | Fix |
|---|--------------------------|--------------------------------|-----|
| 1 | "recommend a trip … budget 6000" → got the **wallet add/edit/total card**, and his "from egypt" correction was swallowed | `budget`→WALLET_PRESENT (1) ties `trip`→TRAVEL_PRESENT (1); DOMAINS-order breaks the tie to wallet (idx5<idx9), band=medium → `capabilityFallback` fired the wallet card | `resolveIntent`: on a **PRESENT-level (score 1)** wallet⇄travel tie, **travel wins**. Strong wallet (score 2) still wins. |
| 2 | reply exposed the internal source title **`vault:Prime Claude.md`** | vault docs are titled `vault:<path>` (tools/vault-ingest.js); `formatCitation` turned that into a `〔vault:…〕` citation injected into the prompt, and the model echoed it | (a) `sanitizeSourceTitle` strips the `vault:` prefix before it becomes a citation; (b) `stripSourceTokens` — a code-guaranteed final-reply filter (same pattern as the DO-sentinel strip) removes any leaked `vault:…` / `【…】` token before the user sees it or it is persisted |
| 3 | "what is the balance of my wallet now?" → generic add/edit/total card (implies a balance exists) | routing is CORRECT (wallet/strong); the wallet models **spending**, not a running balance, so the lane returns null and the generic card fires | balance ask → honest answer: **"I track spending, not a running balance — you've spent X SAR this month."** Never implies a balance. |
| 4 | "the trip is from egypt" → the **Riyadh** home default persisted | origin handling is city-level; `Egypt` (a country) doesn't resolve to a city/IATA | `travelClarify` detects a **stated country** origin and asks **"Which city in Egypt are you flying from?"** — never invents an airport, never silently defaults home |

---

## FIX 1 — trip-with-a-budget routes to travel, not the wallet card

**Turn (his real phrasing):**
```
no the trip is from egypt, if i have a budget of 6000 sar for me wife and daughter can you recommend a trip outside egypt with this budget?
```
**Expect:** a **travel/planning** answer (destination ideas within budget, or a clarifying travel question). It must **NOT** be the wallet "I can add, edit, or total your expenses…" card, and must **NOT** ignore the origin.
**Red before B-191:** wallet deflection card.

**Control (must NOT regress — money still wins when it's really a spend query):**
```
how much did I spend on my trip to Cairo?
```
**Expect:** a wallet/spending answer (this is an expense question — wallet is STRONG here).

---

## FIX 2 — no internal `vault:` / bracketed source token in any reply

Ask something answered from his ingested vault notes, then push on it the way he did:
```
Turn 1 (same session): what do my notes say about how I like Claude to work?
Turn 2 (same session): is that classified info you cant pull?
```
**Expect:** a normal grounded answer. **No** reply contains `vault:` anywhere, and no
`【…】` / `〔…〕` wrapper around a filename. Citations, if shown, read as a plain note
name (e.g. "Prime Claude"), never `vault:Prime Claude.md`.
**Red before B-191:** a reply echoed `vault:Prime Claude.md`.

Quick offline proof (host): `stripSourceTokens("…【vault:Prime Claude.md】…")` returns the
sentence with the token removed; a legit math `⟦n⟧` marker and clean prose are untouched.

---

## FIX 3 — honest wallet "balance" answer

```
what is the balance of my wallet now?
```
**Expect:** an honest reply that (a) says it tracks **spending, not a running balance**,
and (b) gives the **real month spend total** (e.g. "you've spent 1,234.5 SAR this month").
It must **NOT** imply a bank/running balance exists, and must **NOT** be the generic
add/edit/total card.

Sara variant (same honesty):
```
what is Sara's balance in the wallet now?
```

Control (unchanged — this is a spend query the summary lane answers directly):
```
how much did I spend this month?
```

---

## FIX 4 — country-only origin asks which city

Give a destination + a **country** as the departure:
```
find me flights to Dubai next month, flying from Egypt
```
**Expect:** M8 asks **"Which city in Egypt are you flying from?"** (or the AR equivalent),
rather than silently assuming Riyadh or Cairo. It must **NOT** invent an airport.

Control (a stated CITY still works, no extra question about the city):
```
find me flights to Dubai next month, flying from Cairo
```
**Expect:** proceeds using Cairo (asks for dates if missing) — no "which city" question.

---

## Offline test commands (Node-less host)

```
# JS (authoritative) — run with the Kimi node + M8 node_modules on NODE_PATH:
NODE_PATH=".../M8/node_modules" node.exe tests/build191_fixes.test.js     # 34/34
NODE_PATH=".../M8/node_modules" node.exe tests/intent_gate_test.js        # 105/105 (FIX 1 in-fixture)

# PS 5.1 mirrors (no Node):
powershell -File tests/build191_fixes.test.ps1     # 15/15  (FIX 2/3/4 pure logic)
powershell -File tests/intent_gate_test.ps1        # 154/0  (FIX 1 present-tie flip)
```
