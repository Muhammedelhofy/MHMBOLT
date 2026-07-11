/**
 * Build-184 — Travel lane PHASE B (live flight search)  (tests/build184_flight_search.test.js)
 *
 * Run: node tests/build184_flight_search.test.js
 *
 * Offline unit tests (no live network — the SerpApi call is exercised only via a
 * MOCKED fetch that captures the outbound URL, so we assert the PRIVACY WALL and the
 * request shape without touching the wire). Covers:
 *   - flightSearch.js: toISO + normalizeFlights (pure), the request-param allowlist
 *     (route + dates + passenger COUNTS only — no name, no money), source="serpapi".
 *   - travel.js Phase-B helpers: flightsEnabled gate, planFlightSearch params/null cases,
 *     renderFlightsBlock (cheapest-first, empty), buildTravelPacket FLIGHTS-above-LINKS +
 *     flightCount, travelSearchPlan skipFlights.
 *   - ★ D8 payment boundary: the tool is a READ-ONLY GET — no booking/order/payment/
 *     checkout endpoint, no card-shaped field, anywhere in the source.
 * The PS-5.1 mirror (build184_flight_search.test.ps1) asserts the same pure logic on this host.
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const T = require("../lib/travel");
const F = require("../lib/tools/flightSearch");

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) { pass++; } else { fails.push(label); console.log("  FAIL  " + label); } }

console.log("\nBuild-184 Travel PHASE B — live flight search — unit tests");
console.log("=".repeat(72));

// ── toISO (pure) ──────────────────────────────────────────────────────────────
ok("toISO 'YYYY-MM-DD HH:MM' → naive ISO", F.toISO("2026-08-14 02:00") === "2026-08-14T02:00");
ok("toISO already-T passthrough", F.toISO("2026-08-14T09:30") === "2026-08-14T09:30");
ok("toISO garbage → null", F.toISO("Aug 14") === null && F.toISO(null) === null && F.toISO(1234) === null);

// ── normalizeFlights (pure) — the canonical offer shape ───────────────────────
{
  const canned = {
    best_flights: [{
      flights: [{ departure_airport: { id: "RUH", time: "2026-08-14 02:00" }, arrival_airport: { id: "HBE", time: "2026-08-14 04:15" }, airline: "flynas", flight_number: "XY 123" }],
      total_duration: 195, price: 780,
    }],
    other_flights: [{
      flights: [
        { departure_airport: { id: "RUH", time: "2026-08-14 09:00" }, arrival_airport: { id: "CAI", time: "2026-08-14 11:00" }, airline: "Saudia", flight_number: "SV 375" },
        { departure_airport: { id: "CAI", time: "2026-08-14 13:00" }, arrival_airport: { id: "HBE", time: "2026-08-14 14:00" }, airline: "EgyptAir", flight_number: "MS 99" },
      ],
      total_duration: 300, price: 1450,
    }],
  };
  const out = F.normalizeFlights(canned, { currency: "SAR" });
  ok("normalizeFlights source is 'serpapi'", out.source === "serpapi");
  ok("normalizeFlights returns both itineraries, best first", out.offers.length === 2 && out.offers[0].carrier === "flynas");
  const o0 = out.offers[0];
  ok("offer: price/currency", o0.price === 780 && o0.currency === "SAR");
  ok("offer: carrier + flightNumber", o0.carrier === "flynas" && o0.flightNumber === "XY 123");
  ok("offer: depart/arrive ISO", o0.departISO === "2026-08-14T02:00" && o0.arriveISO === "2026-08-14T04:15");
  ok("offer: durationMin + nonstop (stops 0)", o0.durationMin === 195 && o0.stops === 0);
  const o1 = out.offers[1];
  ok("connection: carriers joined across legs", o1.carrier === "Saudia / EgyptAir");
  ok("connection: stops = legs-1 (1), arrive = LAST leg", o1.stops === 1 && o1.arriveISO === "2026-08-14T14:00");

  // cap
  ok("normalizeFlights honours max cap", F.normalizeFlights(canned, { max: 1 }).offers.length === 1);
  // currency default
  ok("normalizeFlights defaults currency to SAR", F.normalizeFlights(canned).offers[0].currency === "SAR");
  // robustness
  ok("normalizeFlights: garbage → empty offers", F.normalizeFlights(null).offers.length === 0 && F.normalizeFlights("x").offers.length === 0);
  ok("normalizeFlights: itinerary with no legs is skipped", F.normalizeFlights({ best_flights: [{ flights: [] }, canned.best_flights[0]] }).offers.length === 1);
  ok("normalizeFlights: missing price → null (kept, honest)", F.normalizeFlights({ best_flights: [{ flights: canned.best_flights[0].flights }] }).offers[0].price === null);
}

// ── flightsEnabled (gate) ─────────────────────────────────────────────────────
{
  const prevKey = process.env.SERPAPI_KEY, prevFlag = process.env.M8_TRAVEL_FLIGHTS;
  delete process.env.SERPAPI_KEY; delete process.env.M8_TRAVEL_FLIGHTS;
  ok("flightsEnabled false with no key (dark == Phase A)", T.flightsEnabled() === false);
  process.env.SERPAPI_KEY = "k";
  ok("flightsEnabled true with key + default flag", T.flightsEnabled() === true);
  process.env.M8_TRAVEL_FLIGHTS = "off";
  ok("flightsEnabled false when flag=off (kill-switch)", T.flightsEnabled() === false);
  process.env.M8_TRAVEL_FLIGHTS = "ON";
  ok("flightsEnabled case-insensitive on", T.flightsEnabled() === true);
  if (prevKey === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = prevKey;
  if (prevFlag === undefined) delete process.env.M8_TRAVEL_FLIGHTS; else process.env.M8_TRAVEL_FLIGHTS = prevFlag;
}

// ── planFlightSearch (pure) — params + the null (fall-through) cases ───────────
{
  const trip = { origin: { city: "Riyadh", iata: "RUH" }, destination: { city: "Alexandria", iata: "HBE" }, dates: { depart: "2026-08-14", return: "2026-08-21" }, party: { adults: 2, children: 2 }, needs: ["flights"] };
  const p = T.planFlightSearch(trip);
  ok("planFlightSearch: route + dates + counts", p && p.departure_id === "RUH" && p.arrival_id === "HBE" && p.outbound_date === "2026-08-14" && p.return_date === "2026-08-21" && p.adults === 2 && p.children === 2 && p.currency === "SAR");
  // resolves IATA from city when the extractor gave none
  const p2 = T.planFlightSearch({ origin: { city: "Riyadh" }, destination: { city: "Cairo" }, dates: { depart: "2026-09-01" }, needs: ["flights"] });
  ok("planFlightSearch resolves IATA from city (keyless)", p2 && p2.departure_id === "RUH" && p2.arrival_id === "CAI");
  ok("planFlightSearch defaults adults=1, children=0", p2.adults === 1 && p2.children === 0 && p2.return_date === undefined);
  // null cases
  ok("planFlightSearch null: flex-only date (no concrete depart) → web search", T.planFlightSearch({ origin: { city: "Riyadh" }, destination: { city: "Cairo" }, dates: { flex: "mid-August" }, needs: ["flights"] }) === null);
  ok("planFlightSearch null: no flights need", T.planFlightSearch({ origin: { city: "Riyadh" }, destination: { city: "Cairo" }, dates: { depart: "2026-09-01" }, needs: ["hotels"] }) === null);
  ok("planFlightSearch null: unresolvable destination code", T.planFlightSearch({ origin: { city: "Riyadh" }, destination: { city: "Atlantis" }, dates: { depart: "2026-09-01" }, needs: ["flights"] }) === null);
  ok("planFlightSearch null: no trip", T.planFlightSearch(null) === null);
}

// ── canonicalizeTripIata — a KNOWN city gets its curated (correct) airport code ─
// (the ALY→HBE lesson from the live self-verify: the LLM emitted Alexandria=ALY, which
// SerpApi has ~no flights for; the curated map's HBE is the real international airport.)
{
  const trip = { origin: { city: "Riyadh", iata: "OLD" }, destination: { city: "Alexandria", iata: "ALY" }, dates: { depart: "2026-08-15" }, needs: ["flights"] };
  T.canonicalizeTripIata(trip);
  ok("canonicalize: Alexandria ALY → curated HBE", trip.destination.iata === "HBE");
  ok("canonicalize: Riyadh OLD → curated RUH", trip.origin.iata === "RUH");
  const unk = { origin: { city: "Riyadh" }, destination: { city: "Nowhereville", iata: "NWH" }, needs: ["flights"] };
  T.canonicalizeTripIata(unk);
  ok("canonicalize: unknown city keeps the extractor's code", unk.destination.iata === "NWH");
  ok("planFlightSearch after canonicalize targets HBE (not ALY)", T.planFlightSearch(trip).arrival_id === "HBE");
}

// ── renderFlightsBlock (pure) ─────────────────────────────────────────────────
{
  const offers = [
    { price: 780, currency: "SAR", carrier: "flynas", flightNumber: "XY 123", departISO: "2026-08-14T02:00", arriveISO: "2026-08-14T04:15", durationMin: 195, stops: 0 },
    { price: 1450, currency: "SAR", carrier: "Saudia / EgyptAir", flightNumber: "SV 375", departISO: "2026-08-14T09:00", arriveISO: "2026-08-14T14:00", durationMin: 300, stops: 1 },
  ];
  const block = T.renderFlightsBlock(offers);
  ok("renderFlightsBlock has the LIVE FLIGHTS header + source", /^LIVE FLIGHTS/.test(block) && /Google Flights via SerpApi/.test(block));
  ok("renderFlightsBlock shows price in SAR + carrier + flight number", /SAR 780/.test(block) && /flynas XY 123/.test(block));
  ok("renderFlightsBlock shows times + nonstop + duration", /2026-08-14 02:00 → arrive 2026-08-14 04:15/.test(block) && /nonstop/.test(block) && /3h15m/.test(block));
  ok("renderFlightsBlock labels a connection '1 stop' + 5h", /1 stop/.test(block) && /\(5h\)/.test(block));
  ok("renderFlightsBlock cheapest first (780 before 1450)", block.indexOf("780") < block.indexOf("1450"));
  ok("renderFlightsBlock empty → ''", T.renderFlightsBlock([]) === "" && T.renderFlightsBlock(null) === "");
  ok("renderFlightsBlock tolerates a missing price/carrier row", /price n\/a/.test(T.renderFlightsBlock([{ stops: 0 }])) && /airline n\/a/.test(T.renderFlightsBlock([{ stops: 0 }])));
}

// ── buildTravelPacket with offers — FLIGHTS above LINKS + flightCount ─────────
{
  const trip = { origin: { city: "Riyadh", iata: "RUH", source: "env" }, destination: { city: "Alexandria", iata: "HBE" }, dates: { depart: "2026-08-14", return: "2026-08-21" }, party: { adults: 2, children: 2 }, needs: ["flights", "hotels"] };
  const offers = [{ price: 780, currency: "SAR", carrier: "flynas", flightNumber: "XY 123", departISO: "2026-08-14T02:00", arriveISO: "2026-08-14T04:15", durationMin: 195, stops: 0 }];
  const pk = T.buildTravelPacket(trip, { offers });
  const HDR = "LIVE FLIGHTS (real current offers";
  ok("packet with offers: flightCount matches", pk.flightCount === 1);
  ok("packet with offers: has a LIVE FLIGHTS data block", pk.block.indexOf(HDR) !== -1);
  ok("packet with offers: FLIGHTS above BOOKING LINKS", pk.block.indexOf(HDR) < pk.block.indexOf("BOOKING LINKS"));
  ok("packet with offers: TRIP CONTEXT still first", pk.block.indexOf("TRIP CONTEXT") < pk.block.indexOf(HDR));
  ok("packet with offers: directive boundary still present", /NEVER book or pay/i.test(pk.block));

  // Phase-A byte-identity: no offers ⇒ no FLIGHTS data block, flightCount 0
  // (the directive still *mentions* a "LIVE FLIGHTS block" — assert on the data-block header).
  const pkNo = T.buildTravelPacket(trip, {});
  ok("packet without offers: flightCount 0, no FLIGHTS data block", pkNo.flightCount === 0 && pkNo.block.indexOf(HDR) === -1);
  ok("packet without offers: linkCount unchanged (Phase-A parity)", pkNo.linkCount === T.buildBookingLinks(trip).length);
  // directive now references the LIVE FLIGHTS block for honesty, WITHOUT losing the fare guard
  const dir = T.buildTravelDirective(trip, {});
  ok("directive references the LIVE FLIGHTS block", /LIVE FLIGHTS block appears below/.test(dir));
  ok("directive still forbids inventing a fare (B-183 guard intact)", /Never invent a fare/i.test(dir));
}

// ── travelSearchPlan skipFlights (waterfall: real offers → skip flights web query) ─
{
  const trip = { origin: { city: "Riyadh" }, destination: { city: "Alexandria" }, dates: { depart: "2026-08-14" }, needs: ["flights", "hotels", "food"] };
  const normal = T.travelSearchPlan(trip, 2);
  ok("plan without skip: flights query present", normal.searchNeeds.indexOf("flights") !== -1);
  const skipped = T.travelSearchPlan(trip, 2, { skipFlights: true });
  ok("plan with skipFlights: flights query dropped", skipped.searchNeeds.indexOf("flights") === -1);
  ok("plan with skipFlights: hotels/food still searched (cap spent elsewhere)", skipped.searchNeeds.indexOf("hotels") !== -1);
  ok("plan with skipFlights: still respects the cap", skipped.queries.length <= 2);
}

// ── ★ D8 payment boundary + privacy: SOURCE greps on flightSearch.js ──────────
{
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "tools", "flightSearch.js"), "utf8");
  ok("D8: no booking/order/payment/checkout endpoint in the tool source",
    !/flight-orders|\/orders\b|\/booking\b|\/payment\b|\/reservation\b|\/checkout\b/i.test(src));
  ok("D8: no card-shaped field in the tool source",
    !/card_number|cardnumber|\bcvv\b|\bcvc\b|card_holder/i.test(src));
  ok("tool is read-only Google Flights SERP (engine=google_flights)", /google_flights/.test(src));
  ok("tool hits only the SerpApi search endpoint", /serpapi\.com\/search\.json/.test(src) && (src.match(/serpapi\.com\/[a-z.]+/gi) || []).every((m) => m === "serpapi.com/search.json"));
}

// ── ★ Privacy wall + request shape: MOCK fetch, capture the outbound URL ───────
async function requestShapeTests() {
  const origFetch = global.fetch;
  const prevKey = process.env.SERPAPI_KEY;
  let capturedRound = null, capturedOneway = null;
  global.fetch = async (url) => {
    if (String(url).indexOf("return_date") !== -1) capturedRound = String(url); else capturedOneway = String(url);
    return { ok: true, json: async () => ({ best_flights: [], other_flights: [] }), text: async () => "" };
  };
  process.env.SERPAPI_KEY = "TEST_DUMMY_KEY_NOT_REAL";
  try {
    await F.searchFlights({ departure_id: "RUH", arrival_id: "HBE", outbound_date: "2026-08-14", return_date: "2026-08-21", adults: 2, children: 2 });
    await F.searchFlights({ departure_id: "RUH", arrival_id: "CAI", outbound_date: "2026-09-01" });
  } finally {
    global.fetch = origFetch;
    if (prevKey === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = prevKey;
  }

  const ur = new URL(capturedRound);
  const keys = Array.from(ur.searchParams.keys()).sort();
  const allowed = ["adults", "api_key", "arrival_id", "children", "currency", "departure_id", "engine", "gl", "hl", "outbound_date", "return_date", "type"].sort();
  ok("privacy: outbound query keys are the allowlist only (route+dates+counts+key)", keys.length === allowed.length && keys.every((k, i) => k === allowed[i]));
  ok("privacy: NO name/email/passenger/money param leaves the process", !keys.some((k) => /name|email|passenger|price|amount|fare|card|money/i.test(k)));
  ok("request: engine=google_flights, currency=SAR", ur.searchParams.get("engine") === "google_flights" && ur.searchParams.get("currency") === "SAR");
  ok("request: return present ⇒ type=1 (round trip)", ur.searchParams.get("type") === "1" && ur.searchParams.get("return_date") === "2026-08-21");
  ok("request: passenger COUNTS carried (adults=2, children=2)", ur.searchParams.get("adults") === "2" && ur.searchParams.get("children") === "2");

  const uo = new URL(capturedOneway);
  ok("request: no return ⇒ type=2 (one way), no return_date", uo.searchParams.get("type") === "2" && uo.searchParams.get("return_date") === null);

  // key-gate: throws (not silent) when SERPAPI_KEY is unset — the orchestrator catches it
  let threw = false;
  const keySave = process.env.SERPAPI_KEY; delete process.env.SERPAPI_KEY;
  try { await F.searchFlights({ departure_id: "RUH", arrival_id: "HBE", outbound_date: "2026-08-14" }); } catch (_) { threw = true; }
  if (keySave === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = keySave;
  ok("key-gate: searchFlights throws with no key (waterfall catches → web search)", threw === true);
}

requestShapeTests().then(() => {
  console.log("=".repeat(72));
  const total = pass + fails.length;
  console.log(`\nResults: ${pass}/${total} passed, ${fails.length} failed\n`);
  if (fails.length) { fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
  else console.log("All Build-184 flight-search unit tests passed.\n");
}).catch((e) => { console.error("FATAL", e); process.exit(1); });
