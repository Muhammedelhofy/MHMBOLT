# Build-184 — Travel lane PHASE B (live flight search): build + probe report

**Date:** 2026-07-04 · **Author:** Opus (high) · from `M8_TRAVEL_LANE_SPEC.md` §D6 + **Amendment B1**
**Worktree:** off `origin/main` (8649db7 — "Travel spec Amendment B1"), branch `build/b184-flights`
**Provider:** SerpApi `engine=google_flights` (Amadeus Self-Service decommissioned 2026-07-17 → Amendment B1)
**Scope:** Phase B only — the live-flight tier. No new `api/` fn, one new key (`SERPAPI_KEY`, Muhammad-set in Vercel).

## What was built

| Piece | File | Notes |
|---|---|---|
| SerpApi Google-Flights tool | `lib/tools/flightSearch.js` (new) | `engine=google_flights`, 7s AbortController timeout, round-trip (`type=1`+`return_date`) or one-way (`type=2`); `normalizeFlights`/`toISO` pure+exported |
| Gate + params + render (pure) | `lib/travel.js` | `flightsEnabled()` (M8_TRAVEL_FLIGHTS + SERPAPI_KEY), `planFlightSearch()` (null unless flights-need + both IATA + concrete depart date), `renderFlightsBlock()` (FLIGHTS block, cheapest-first) |
| Packet + directive + plan | `lib/travel.js` | `buildTravelPacket` renders **LIVE FLIGHTS above BOOKING LINKS** + `flightCount`; directive rule 3 references the block (keeps "Never invent a fare"); `travelSearchPlan(..,{skipFlights})` drops the flights web query when real offers exist |
| Waterfall wiring | `lib/orchestrator.js` | tier-0 in the B-183 travel block: `planFlightSearch → flightsEnabled → searchFlights` (≤1 call) → offers into the packet → `skipFlights` on the plan. ANY failure/empty ⇒ web `search()` ⇒ links-only. Telemetry `travel_flights{,_empty,_failed}` = counts only |

## Fail-safe waterfall (spec D6 / Amendment B1)

`flightSearch()` → (fail / empty / key unset / flag off) → web `search()` (Phase A) → (empty) → links-only + honesty guard.
**Dark == Phase A, byte-identical:** with `SERPAPI_KEY` unset or `M8_TRAVEL_FLIGHTS=off`, `flightsEnabled()` is false ⇒ no flight call ⇒ `offers=null` ⇒ no FLIGHTS block, `skipFlights=false` ⇒ the flights web query runs exactly as B-183 (proven by unit test + kill-switch).

## Payment boundary (D8) + privacy — structural, unchanged

- Read-only search: **no booking/order/checkout endpoint, no card field** anywhere in `flightSearch.js` (JS + PS source greps).
- SerpApi receives **only** route (IATA) + dates + passenger **counts** — asserted by a mocked-fetch capture of the exact outbound query-string allowlist (`engine, departure_id, arrival_id, outbound_date, return_date, currency, hl, gl, type, adults, children, api_key`); **no name, no money**.
- "book it" still returns a link + the boundary sentence (B-183 D8 directive intact).

## Offline test results (all green)

| Suite | Result |
|---|---|
| `tests/build184_flight_search.test.js` | **58/58** (toISO, normalizeFlights shape/carrier-join/stops/cap, flightsEnabled gate, planFlightSearch params+null cases, renderFlightsBlock cheapest-first, packet FLIGHTS-above-LINKS, skipFlights, D8 greps, mocked-fetch privacy allowlist) |
| `tests/build184_flight_search.test.ps1` (PS-5.1 mirror) | **50/50** (pure fns re-implemented ASCII-only; Unicode separators via `[char]`; exact-line render mirror; D8/privacy + wiring greps) |
| `tests/build183_travel.test.js` (regression) | **68/68** |
| `tests/build183_travel.test.ps1` (regression) | **32/32** |
| `tests/intent_gate_test.js` (routing fixture) | **100/100** (registry/semantic untouched this build) |
| full `tests/*.test.ps1` | **31/32** — only the PRE-EXISTING, unrelated `build169a_lean_gate` **b7** fails (verified identical on pristine `origin/main`: 26 pass / 1 fail) |

## Local live probe (`tests/travel_flight_probe.js` + `.ps1`)

**Key-gated, SKIPPED locally** — `M8/.env.local` holds only `GROQ_API_KEY`; no `SERPAPI_KEY` on this host
(Muhammad set it in **Vercel**, never pasted locally — the never-paste-secrets rule). The probe exits 0
with guidance when the key is absent (no live claim). To run it locally: put `SERPAPI_KEY=...` in
`M8/.env.local` and `powershell tests/travel_flight_probe.ps1`. **The live proof for this build is the
prod self-verify below** (m8-alpha.vercel.app has the key — the fuller end-to-end test).

## PROD self-verify (m8-alpha.vercel.app) — DONE ✅ (sha 78b928a → 33438ae)

**Live tier confirmed firing.** SerpApi returns **SAR** offers (web fallback would be USD) in the exact
`renderFlightsBlock` shape. Real pasted replies (test sessions `b184v-*`, purged after):

1. **RUH→Cairo discriminator** ("cheapest flight from Riyadh to Cairo on 15 August 2026"):
   → *"flyadeal F3 613 — **SAR 359** — depart 08:30 → arrive 11:10 (2h40m) nonstop"* + deep-links. Proves
   the key + tier work; **flyadeal (LCC)** present.

2. **★ Headline — RUH→Alexandria "mid-August"** (post-fix, sha 33438ae):
   → real table, cheapest first, both airports named, Skyscanner link `ruh/**hbe**/260815/`:
   | Airline/Flight | SAR | Times (15 Aug 2026) | Stops |
   |---|---|---|---|
   | **Air Arabia Egypt E5 336** | **607** | 05:15→08:15 (3h) | nonstop |
   | Air Cairo SM 474 | 673 | 18:40→21:40 (3h) | nonstop |
   | Saudia SV 333 | 891 | 18:45→21:40 | nonstop |
   | Qatar Airways QR 1173 | 695 | 20:05→13:00+1 | 1 stop |

3. **★ Budget-carrier coverage** (Amendment B1's GDS-gap closure): **Air Arabia Egypt / Air Cairo /
   flyadeal** all surface — confirmed live, the exact thing Muhammad asked about.

4. **★ ALY→HBE fix (canonicalizeTripIata)**: the FIRST Alexandria run (sha 78b928a) degraded to the
   web path because the LLM extractor emitted **ALY** (El Nozha, ~no flights) → SerpApi empty. The fix
   canonicalizes Alexandria→**HBE**; the re-run returned real HBE offers (above). **This degrade was
   itself a live proof of the fail-safe waterfall**: empty tier → web+links, **no error shown** to the user.

5. **D8 "book it for me"** (chained session): → *"I can't directly book the flight for you, Boss. My
   capabilities don't extend to completing purchases or payments… use those links to complete the booking
   yourself."* — boundary held, points to the composed links, no invented URL, never claims it booked.

6. **Collision** "how much did I spend on my trip to Cairo?" → **wallet** ("Muhammad's spending this
   month: 0 SAR") — NOT stolen by the travel lane.

**Failure degrade (throw path):** the live **empty→web** degrade was observed (item 4). A hard throw
(invalid key / quota 429) is caught by the same `catch` → web fallback; proven by the offline
`key-gate: searchFlights throws → web search` test. His prod key was **not** sabotaged to force it live.
