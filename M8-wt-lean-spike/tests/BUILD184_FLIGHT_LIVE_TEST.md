# Build-184 — Travel lane PHASE B (live flight search) · live test (prod: m8-alpha.vercel.app)

Ask these in the M8 chat after deploy. Phase B is behind **`M8_TRAVEL_FLIGHTS`** (default on)
**and** the presence of **`SERPAPI_KEY`** in Vercel env (Muhammad set it). With the key unset or
the flag `off`, the lane is **byte-identical to Phase A** (web-snippet prices + links). Rollback =
set `M8_TRAVEL_FLIGHTS=off` (or remove the key) and redeploy — no code revert.

Provider: **SerpApi `engine=google_flights`** (Amendment B1 — Amadeus was decommissioned 2026-07-17).
Google Flights data **includes low-cost carriers** (Air Arabia, flynas, flyadeal…). Read-only search:
**no booking, no payment** anywhere in the integration (D8). SerpApi receives ONLY route + dates +
passenger counts — no name, no money.

## Phase-B acceptance canaries (these ARE the new acceptance)

1. **"cheapest flight Riyadh to Alexandria mid-August"** (fresh session)
   → EXPECT: a **LIVE FLIGHTS** answer with **real airline + flight number + depart/arrive times +
   price in SAR**, cheapest first, and it **names both airports** (Riyadh RUH → Alexandria Borg
   El Arab HBE). Not web-snippet prose — actual offers.

2. **Budget-carrier coverage** — in that answer (or "any Air Arabia / flynas flights on that route?")
   → EXPECT: if an LCC flies RUH→HBE/CAI it **appears by name** (the GDS gap Amendment B1 closed).
   Honest "none on this route" is fine if the route genuinely has none.

3. **(same session) "mid-August, with my wife and the kids"** / follow-up with dates
   → EXPECT: slots carried; the flight offers reflect the party; booking links still present below the
   offers; both airports named. No re-asking.

4. **★ Failure / quota degrade — force it**: temporarily set an INVALID `SERPAPI_KEY` (or exhaust the
   250/mo quota) and redeploy, then ask canary 1 again.
   → EXPECT: **NO error to the user** — it silently degrades to the Phase-A path (web-snippet prices +
   booking links) and the empty-search honesty guard governs. Restore the real key + redeploy after.

5. **★ D8 canary — "book it for me"** (after a flight answer)
   → EXPECT: a **booking link** + the boundary sentence (*"you confirm and pay on the airline site;
   I can't book or pay for you"*). NEVER a claim that it booked or a request for card details.

## Regression — Phase A must still hold (carry-over from B-183)

6. **"I'm travelling to Alexandria"** → confirms origin **Riyadh** + asks **one** question (dates).
7. **"find me a hotel there"** → destination carried; well-formed **Booking.com** link (hotels stay
   links-only — §10 ④, unchanged).
8. **Arabic: "عايز أسافر إسكندرية الشهر الجاي"** → same flow in Arabic; flight offers when a concrete date is given.
9. **Collision battery** (each its own session) — the lane must NOT steal these:
   - "how much did I spend on my trip to Cairo?" → **wallet**
   - "how are my drivers doing today" / "morning brief" → **fleet**
   - "is Sara my wife?" → **memory** ("Yes, Boss — Sara is your wife.")

## Notes for the tester
- A **flex-only** date ("mid-August" with no concrete day) may fall to the Phase-A web path — that's by
  design (SerpApi needs a concrete `outbound_date`; the extractor usually resolves flex → a date).
- Telemetry breadcrumbs: `travel_flights` (offer count), `travel_flights_empty`, `travel_flights_failed`
  — **counts only**, never a route/airline/price (B-168 privacy contract).
- Local probe (needs your key): `powershell tests/travel_flight_probe.ps1` after putting
  `SERPAPI_KEY=...` in `M8/.env.local` (gitignored). It prints RUH→CAI and RUH→HBE offer tables.
