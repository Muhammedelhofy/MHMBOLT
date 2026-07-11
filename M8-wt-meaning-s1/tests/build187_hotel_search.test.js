/**
 * Build-187 — Travel lane hotels extension (live hotel search)  (tests/build187_hotel_search.test.js)
 *
 * Run: node tests/build187_hotel_search.test.js
 *
 * Real incident that motivated this build: a live hotel-search turn ("check for me
 * best hotels in Hurghada... accommodation from the 15th to the 20th of August") had
 * NO live hotel integration wired in — only flights had one (B-184) — so the LLM
 * fabricated a price table explicitly labeled "based on 2024 Booking.com data" instead
 * of admitting it had no live prices. This build adds lib/tools/hotelSearch.js
 * (SerpApi engine=google_hotels, mirroring flightSearch.js exactly) and wires it into
 * the SAME fail-safe waterfall flights use.
 *
 * Offline unit tests (no live network — the SerpApi call is exercised only via a
 * MOCKED fetch that captures the outbound URL, so we assert the PRIVACY WALL and the
 * request shape without touching the wire). Covers:
 *   - hotelSearch.js: normalizeHotels (pure), the request-param allowlist (destination
 *     text + dates + guest COUNTS only — no name, no money), source="serpapi".
 *   - travel.js hotels helpers: hotelsEnabled gate, planHotelSearch params/null cases,
 *     renderHotelsBlock (best-value-first, empty), buildTravelPacket HOTELS-above-LINKS
 *     + hotelCount, travelSearchPlan skipHotels.
 *   - ★ D8 payment boundary: the tool is a READ-ONLY GET — no booking/order/payment/
 *     checkout endpoint, no card-shaped field, anywhere in the source.
 * The PS-5.1 mirror (build187_hotel_search.test.ps1) asserts the same pure logic on this host.
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const T = require("../lib/travel");
const H = require("../lib/tools/hotelSearch");

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) { pass++; } else { fails.push(label); console.log("  FAIL  " + label); } }

console.log("\nBuild-187 Travel lane hotels extension — live hotel search — unit tests");
console.log("=".repeat(72));

// ── normalizeHotels (pure) — the canonical offer shape ────────────────────────
{
  const canned = {
    properties: [
      { name: "Steigenberger Pure Lifestyle", rate_per_night: { lowest: "SAR 560", extracted_lowest: 560 }, overall_rating: 8.7, reviews: 3200, hotel_class: "5-star hotel" },
      { name: "Sunrise Azalea Aqua Park Resort", rate_per_night: { lowest: "SAR 420", extracted_lowest: 420 }, overall_rating: 9.2, reviews: 5100, hotel_class: "5-star hotel" },
      { name: "No Price Listed Inn", overall_rating: 7.1 },
    ],
  };
  const out = H.normalizeHotels(canned, { currency: "SAR" });
  ok("normalizeHotels source is 'serpapi'", out.source === "serpapi");
  ok("normalizeHotels returns all 3 properties", out.offers.length === 3);
  ok("normalizeHotels sorts cheapest-known-price first", out.offers[0].name === "Sunrise Azalea Aqua Park Resort" && out.offers[1].name === "Steigenberger Pure Lifestyle");
  ok("normalizeHotels sinks unpriced entries to the end", out.offers[2].name === "No Price Listed Inn" && out.offers[2].pricePerNight === null);
  const o0 = out.offers[0];
  ok("offer: price/currency", o0.pricePerNight === 420 && o0.currency === "SAR");
  ok("offer: rating + reviews + class", o0.rating === 9.2 && o0.reviews === 5100 && o0.hotelClass === "5-star hotel");

  // cap
  ok("normalizeHotels honours max cap", H.normalizeHotels(canned, { max: 1 }).offers.length === 1);
  // currency default
  ok("normalizeHotels defaults currency to SAR", H.normalizeHotels(canned).offers[0].currency === "SAR");
  // robustness
  ok("normalizeHotels: garbage → empty offers", H.normalizeHotels(null).offers.length === 0 && H.normalizeHotels("x").offers.length === 0);
  ok("normalizeHotels: entry with no name is skipped", H.normalizeHotels({ properties: [{ rate_per_night: { extracted_lowest: 100 } }, canned.properties[0]] }).offers.length === 1);
  ok("normalizeHotels: missing rating → null (kept, honest)", H.normalizeHotels({ properties: [{ name: "X" }] }).offers[0].rating === null);
}

// ── hotelsEnabled (gate) ────────────────────────────────────────────────────────
{
  const prevKey = process.env.SERPAPI_KEY, prevFlag = process.env.M8_TRAVEL_HOTELS;
  delete process.env.SERPAPI_KEY; delete process.env.M8_TRAVEL_HOTELS;
  ok("hotelsEnabled false with no key (dark == Phase A)", T.hotelsEnabled() === false);
  process.env.SERPAPI_KEY = "k";
  ok("hotelsEnabled true with key + default flag", T.hotelsEnabled() === true);
  process.env.M8_TRAVEL_HOTELS = "off";
  ok("hotelsEnabled false when flag=off (kill-switch)", T.hotelsEnabled() === false);
  process.env.M8_TRAVEL_HOTELS = "ON";
  ok("hotelsEnabled case-insensitive on", T.hotelsEnabled() === true);
  if (prevKey === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = prevKey;
  if (prevFlag === undefined) delete process.env.M8_TRAVEL_HOTELS; else process.env.M8_TRAVEL_HOTELS = prevFlag;
}

// ── planHotelSearch (pure) — params + the null (fall-through) cases ────────────
{
  const trip = { destination: { city: "Hurghada" }, dates: { depart: "2026-08-15", return: "2026-08-20" }, party: { adults: 2, children: 1 }, needs: ["hotels"] };
  const p = T.planHotelSearch(trip);
  ok("planHotelSearch: dest+country query, dates, counts", p && p.q === "Hurghada, Egypt" && p.check_in_date === "2026-08-15" && p.check_out_date === "2026-08-20" && p.adults === 2 && p.children === 1 && p.currency === "SAR");
  // unknown-country city just omits the hint
  const p2 = T.planHotelSearch({ destination: { city: "Atlantis" }, dates: { depart: "2026-09-01", return: "2026-09-05" }, needs: ["hotels"] });
  ok("planHotelSearch: unresolvable country omits the hint (still runs)", p2 && p2.q === "Atlantis");
  ok("planHotelSearch defaults adults=1, no children key when 0", p2.adults === 1 && p2.children === undefined);
  // null cases
  ok("planHotelSearch null: no hotels need", T.planHotelSearch({ destination: { city: "Cairo" }, dates: { depart: "2026-09-01", return: "2026-09-05" }, needs: ["flights"] }) === null);
  ok("planHotelSearch null: no destination", T.planHotelSearch({ dates: { depart: "2026-09-01", return: "2026-09-05" }, needs: ["hotels"] }) === null);
  ok("planHotelSearch null: flex-only date (no concrete check-in) → web search", T.planHotelSearch({ destination: { city: "Cairo" }, dates: { flex: "mid-August" }, needs: ["hotels"] }) === null);
  ok("planHotelSearch null: check-in but no check-out (google_hotels needs both)", T.planHotelSearch({ destination: { city: "Cairo" }, dates: { depart: "2026-09-01" }, needs: ["hotels"] }) === null);
  ok("planHotelSearch null: no trip", T.planHotelSearch(null) === null);
}

// ── renderHotelsBlock (pure) ─────────────────────────────────────────────────
{
  const offers = [
    { name: "Sunrise Azalea Aqua Park Resort", pricePerNight: 420, currency: "SAR", rating: 9.2, reviews: 5100, hotelClass: "5-star hotel" },
    { name: "Steigenberger Pure Lifestyle", pricePerNight: 560, currency: "SAR", rating: 8.7, reviews: 3200, hotelClass: "5-star hotel" },
  ];
  const block = T.renderHotelsBlock(offers);
  ok("renderHotelsBlock has the LIVE HOTELS header + source", /^LIVE HOTELS/.test(block) && /Google Hotels via SerpApi/.test(block));
  ok("renderHotelsBlock shows name + price + rating", /Sunrise Azalea Aqua Park Resort/.test(block) && /SAR 420\/night/.test(block) && /9\.2★/.test(block));
  ok("renderHotelsBlock best-value (input) order preserved when already sorted", block.indexOf("420") < block.indexOf("560"));
  ok("renderHotelsBlock empty → ''", T.renderHotelsBlock([]) === "" && T.renderHotelsBlock(null) === "");
  ok("renderHotelsBlock tolerates a missing price/rating row", /price n\/a/.test(T.renderHotelsBlock([{ name: "Bare Hotel" }])));
  ok("renderHotelsBlock skips a row with no name", T.renderHotelsBlock([{ pricePerNight: 100 }]) === "");
}

// ── buildTravelPacket with hotelOffers — HOTELS above LINKS + hotelCount ──────
{
  const trip = { destination: { city: "Hurghada" }, dates: { depart: "2026-08-15", return: "2026-08-20" }, party: { adults: 2 }, needs: ["hotels"] };
  const hotelOffers = [{ name: "Sunrise Azalea Aqua Park Resort", pricePerNight: 420, currency: "SAR", rating: 9.2, reviews: 5100, hotelClass: "5-star hotel" }];
  const pk = T.buildTravelPacket(trip, { hotelOffers });
  const HDR = "LIVE HOTELS (real current listings";
  ok("packet with hotelOffers: hotelCount matches", pk.hotelCount === 1);
  ok("packet with hotelOffers: has a LIVE HOTELS data block", pk.block.indexOf(HDR) !== -1);
  ok("packet with hotelOffers: HOTELS above BOOKING LINKS", pk.block.indexOf(HDR) < pk.block.indexOf("BOOKING LINKS"));
  ok("packet with hotelOffers: TRIP CONTEXT still first", pk.block.indexOf("TRIP CONTEXT") < pk.block.indexOf(HDR));
  ok("packet with hotelOffers: directive boundary still present", /NEVER book or pay/i.test(pk.block));
  ok("packet with hotelOffers: directive references LIVE HOTELS honesty", /LIVE HOTELS block appears below/.test(pk.block));

  // Phase-A byte-identity: no hotelOffers ⇒ no HOTELS data block, hotelCount 0
  const pkNo = T.buildTravelPacket(trip, {});
  ok("packet without hotelOffers: hotelCount 0, no HOTELS data block", pkNo.hotelCount === 0 && pkNo.block.indexOf(HDR) === -1);
  ok("packet without hotelOffers: linkCount unchanged (Phase-A parity)", pkNo.linkCount === T.buildBookingLinks(trip).length);
  // directive still forbids fabricating a fare/price + now tells the model to admit no live data
  const dir = T.buildTravelDirective(trip, {});
  ok("directive still forbids inventing a fare/price (guard intact)", /Never invent a fare, flight time, hotel price/i.test(dir));
  ok("directive tells the model to admit missing live prices instead of a remembered figure", /say plainly you don't have live prices/i.test(dir));
}

// ── travelSearchPlan skipHotels (waterfall: real offers → skip hotels web query) ─
{
  const trip = { origin: { city: "Riyadh" }, destination: { city: "Hurghada" }, dates: { depart: "2026-08-15" }, needs: ["flights", "hotels", "food"] };
  const normal = T.travelSearchPlan(trip, 3);
  ok("plan without skip: hotels query present", normal.searchNeeds.indexOf("hotels") !== -1);
  const skipped = T.travelSearchPlan(trip, 3, { skipHotels: true });
  ok("plan with skipHotels: hotels query dropped", skipped.searchNeeds.indexOf("hotels") === -1);
  ok("plan with skipHotels: flights/food still searched (cap spent elsewhere)", skipped.searchNeeds.indexOf("flights") !== -1 && skipped.searchNeeds.indexOf("food") !== -1);
  const both = T.travelSearchPlan(trip, 3, { skipFlights: true, skipHotels: true });
  ok("plan with both skips: neither flights nor hotels queried", both.searchNeeds.indexOf("flights") === -1 && both.searchNeeds.indexOf("hotels") === -1);
  ok("plan with both skips: still respects the cap", both.queries.length <= 3);
}

// ── ★ D8 payment boundary + privacy: SOURCE greps on hotelSearch.js ───────────
{
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "tools", "hotelSearch.js"), "utf8");
  ok("D8: no booking/order/payment/checkout endpoint in the tool source",
    !/hotel-orders|\/orders\b|\/booking\b|\/payment\b|\/reservation\b|\/checkout\b/i.test(src));
  ok("D8: no card-shaped field in the tool source",
    !/card_number|cardnumber|\bcvv\b|\bcvc\b|card_holder/i.test(src));
  ok("tool is read-only Google Hotels SERP (engine=google_hotels)", /google_hotels/.test(src));
  ok("tool hits only the SerpApi search endpoint", /serpapi\.com\/search\.json/.test(src) && (src.match(/serpapi\.com\/[a-z.]+/gi) || []).every((m) => m === "serpapi.com/search.json"));
  ok("tool has a hard timeout (7s discipline)", /HOTEL_TIMEOUT_MS\s*=\s*7000/.test(src) && /AbortController/.test(src));
}

// ── ★ Privacy wall + request shape: MOCK fetch, capture the outbound URL ───────
async function requestShapeTests() {
  const origFetch = global.fetch;
  const prevKey = process.env.SERPAPI_KEY;
  let captured = null;
  global.fetch = async (url) => {
    captured = String(url);
    return { ok: true, json: async () => ({ properties: [] }), text: async () => "" };
  };
  process.env.SERPAPI_KEY = "TEST_DUMMY_KEY_NOT_REAL";
  try {
    await H.searchHotels({ q: "Hurghada, Egypt", check_in_date: "2026-08-15", check_out_date: "2026-08-20", adults: 2, children: 1 });
  } finally {
    global.fetch = origFetch;
    if (prevKey === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = prevKey;
  }

  const u = new URL(captured);
  const keys = Array.from(u.searchParams.keys()).sort();
  const allowed = ["adults", "api_key", "check_in_date", "check_out_date", "children", "currency", "engine", "gl", "hl", "q"].sort();
  ok("privacy: outbound query keys are the allowlist only (destination+dates+counts+key)", keys.length === allowed.length && keys.every((k, i) => k === allowed[i]));
  ok("privacy: NO name/email/passenger/money param leaves the process", !keys.some((k) => /name|email|passenger|price|amount|fare|card|money/i.test(k)));
  ok("request: engine=google_hotels, currency=SAR", u.searchParams.get("engine") === "google_hotels" && u.searchParams.get("currency") === "SAR");
  ok("request: dates carried exactly", u.searchParams.get("check_in_date") === "2026-08-15" && u.searchParams.get("check_out_date") === "2026-08-20");
  ok("request: guest COUNTS carried (adults=2, children=1)", u.searchParams.get("adults") === "2" && u.searchParams.get("children") === "1");

  // key-gate: throws (not silent) when SERPAPI_KEY is unset — the orchestrator catches it
  let threw = false;
  const keySave = process.env.SERPAPI_KEY; delete process.env.SERPAPI_KEY;
  try { await H.searchHotels({ q: "Cairo", check_in_date: "2026-08-15", check_out_date: "2026-08-20" }); } catch (_) { threw = true; }
  if (keySave === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = keySave;
  ok("key-gate: searchHotels throws with no key (waterfall catches → web search)", threw === true);

  // missing-dates-gate: throws when check_out_date is absent (google_hotels requires both)
  let threw2 = false;
  process.env.SERPAPI_KEY = "TEST_DUMMY_KEY_NOT_REAL";
  try { await H.searchHotels({ q: "Cairo", check_in_date: "2026-08-15" }); } catch (_) { threw2 = true; }
  if (prevKey === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = prevKey;
  ok("param-gate: searchHotels throws with no check_out_date", threw2 === true);
}

requestShapeTests().then(() => {
  console.log("=".repeat(72));
  const total = pass + fails.length;
  console.log(`\nResults: ${pass}/${total} passed, ${fails.length} failed\n`);
  if (fails.length) { fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
  else console.log("All Build-187 hotel-search unit tests passed.\n");
}).catch((e) => { console.error("FATAL", e); process.exit(1); });
