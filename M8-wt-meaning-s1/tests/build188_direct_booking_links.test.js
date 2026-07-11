/**
 * Build-188 (Amendment B3) — Direct booking links: per-hotel links + fetch-on-pick
 * flight links  (tests/build188_direct_booking_links.test.js)
 *
 * Run: node tests/build188_direct_booking_links.test.js
 *
 * Motivated by Muhammad asking "why doesn't M8 give me a direct link to click for
 * the recommended flight/hotel, instead of a generic search page?" Two different
 * fixes, one per lane (his explicit scope choice):
 *   - HOTELS: SerpApi already returns a per-property link (and per-OTA links in
 *     prices[]) — hotelSearch.js just wasn't capturing it. No extra cost.
 *   - FLIGHTS: SerpApi's base search has NO bookable link, only a booking_token —
 *     getting a real link needs a SECOND API call per flight. His choice: only
 *     redeem it when he picks a specific offer ("book the first one"), never
 *     upfront for all 5 shown (would burn quota 5x/search).
 *
 * Offline unit tests (no live network — the SerpApi redemption call is exercised
 * only via a MOCKED fetch). Covers:
 *   - hotelSearch.js: normalizeHotels captures a link (prices[] site-link preferred
 *     over the generic property.link).
 *   - travel.js: renderHotelsBlock includes the link; wantsFlightBookingLink signal
 *     detection; resolveFlightSelection (ordinal/cheapest/carrier, ambiguous→null);
 *     renderDirectBookingLinkBlock; buildTravelPacket wires directBookingLink above
 *     the generic BOOKING LINKS block; the directive's updated LINKS rule.
 *   - flightSearch.js: normalizeFlights captures bookingToken; extractBookingLink
 *     (pure) only returns a plain-GET link, rejects a POST-only booking_request;
 *     getBookingLink's request shape (mocked fetch) — privacy wall unchanged.
 * The PS-5.1 mirror (build188_direct_booking_links.test.ps1) asserts the same pure
 * logic on this host. Live schema verification: tests/travel_booking_link_probe.js
 * (requires a real SERPAPI_KEY — this build ships 🟡 offline-tested; see BUILD_LOG).
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const T = require("../lib/travel");
const F = require("../lib/tools/flightSearch");
const H = require("../lib/tools/hotelSearch");

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) { pass++; } else { fails.push(label); console.log("  FAIL  " + label); } }

console.log("\nBuild-188 (Amendment B3) direct booking links — unit tests");
console.log("=".repeat(72));

// ── hotelSearch.js: normalizeHotels captures a link ────────────────────────────
{
  const withOtaLink = H.normalizeHotels({ properties: [
    { name: "Sunrise Azalea", link: "https://www.google.com/travel/hotels/sunrise", prices: [{ source: "Booking.com", link: "https://www.booking.com/hotel/eg/sunrise-azalea.html" }], rate_per_night: { extracted_lowest: 420 } },
  ] }, { currency: "SAR" });
  ok("normalizeHotels prefers the OTA (prices[]) link over property.link", withOtaLink.offers[0].link === "https://www.booking.com/hotel/eg/sunrise-azalea.html");

  const propertyLinkOnly = H.normalizeHotels({ properties: [
    { name: "No OTA Listed", link: "https://www.google.com/travel/hotels/no-ota", rate_per_night: { extracted_lowest: 300 } },
  ] }, { currency: "SAR" });
  ok("normalizeHotels falls back to property.link when prices[] has none", propertyLinkOnly.offers[0].link === "https://www.google.com/travel/hotels/no-ota");

  const noLink = H.normalizeHotels({ properties: [{ name: "No Link Hotel", rate_per_night: { extracted_lowest: 200 } }] });
  ok("normalizeHotels: link is null (not fabricated) when absent", noLink.offers[0].link === null);
}

// ── travel.js: renderHotelsBlock includes the link ─────────────────────────────
{
  const block = T.renderHotelsBlock([{ name: "Sunrise Azalea", pricePerNight: 420, currency: "SAR", rating: 9.2, reviews: 100, hotelClass: "5-star hotel", link: "https://www.booking.com/hotel/eg/sunrise-azalea.html" }]);
  ok("renderHotelsBlock includes the row's link", block.indexOf("https://www.booking.com/hotel/eg/sunrise-azalea.html") !== -1);
  const blockNoLink = T.renderHotelsBlock([{ name: "No Link Hotel", pricePerNight: 200 }]);
  ok("renderHotelsBlock omits a link segment when absent (no dangling dash)", !/—\s*$/.test(blockNoLink.split("\n")[1]));
}

// ── flightSearch.js: normalizeFlights captures bookingToken ────────────────────
{
  const canned = { best_flights: [{
    flights: [{ departure_airport: { id: "RUH", time: "2026-08-14 02:00" }, arrival_airport: { id: "HBE", time: "2026-08-14 04:15" }, airline: "flynas", flight_number: "XY 123" }],
    total_duration: 195, price: 780, booking_token: "TOKEN_ABC123",
  }] };
  const out = F.normalizeFlights(canned, { currency: "SAR" });
  ok("normalizeFlights captures bookingToken", out.offers[0].bookingToken === "TOKEN_ABC123");
  const noToken = F.normalizeFlights({ best_flights: [{ flights: canned.best_flights[0].flights, price: 780 }] });
  ok("normalizeFlights: bookingToken null (not fabricated) when absent", noToken.offers[0].bookingToken === null);
}

// ── flightSearch.js: extractBookingLink (pure) — only a plain-GET link ─────────
{
  const goodGet = { booking_options: [{ together: { book_with: "flynas", booking_request: { url: "https://www.flynas.com/book?ref=abc" } } }] };
  const r1 = F.extractBookingLink(goodGet);
  ok("extractBookingLink: plain GET url accepted", r1 && r1.url === "https://www.flynas.com/book?ref=abc" && r1.bookWith === "flynas");

  const postOnly = { booking_options: [{ together: { book_with: "flynas", booking_request: { url: "https://www.google.com/travel/clk/f", post_data: "abc=123" } } }] };
  ok("extractBookingLink: rejects a POST-only link (unusable, never 'clickable')", F.extractBookingLink(postOnly) === null);

  const departingShape = { booking_options: [{ departing: { book_with: "Saudia", booking_request: { url: "https://www.saudia.com/book/xyz" } } }] };
  ok("extractBookingLink: checks the departing/arriving leg shapes too", F.extractBookingLink(departingShape).url === "https://www.saudia.com/book/xyz");

  ok("extractBookingLink: empty/garbage -> null", F.extractBookingLink(null) === null && F.extractBookingLink({}) === null && F.extractBookingLink({ booking_options: [] }) === null);

  // first qualifying option wins when several are present
  const multi = { booking_options: [
    { together: { book_with: "Bad", booking_request: { url: "https://bad.example", post_data: "x" } } },
    { together: { book_with: "Good", booking_request: { url: "https://good.example" } } },
  ] };
  ok("extractBookingLink: skips a non-qualifying option, takes the next", F.extractBookingLink(multi).bookWith === "Good");
}

// ── travel.js: wantsFlightBookingLink (signal detection) ───────────────────────
{
  ok("wants: 'book the first one'", T.wantsFlightBookingLink("book the first one"));
  ok("wants: 'get me a link for the cheapest'", T.wantsFlightBookingLink("get me a link for the cheapest"));
  ok("wants: 'reserve that flight'", T.wantsFlightBookingLink("reserve that flight"));
  ok("wants: 'book #2'", T.wantsFlightBookingLink("book #2"));
  ok("not: a plain destination ask", !T.wantsFlightBookingLink("what are the best hotels in hurghada"));
  ok("not: 'book it for me' original trip-planning ask with no offers shown yet is STILL a signal (caller gates on offers existing)", T.wantsFlightBookingLink("book it for me"));
}

// ── travel.js: resolveFlightSelection (ordinal / cheapest / carrier / ambiguous) ─
{
  const offers = [
    { price: 780, carrier: "flynas", bookingToken: "T1" },
    { price: 1450, carrier: "Saudia / EgyptAir", bookingToken: "T2" },
    { price: 600, carrier: "Air Arabia", bookingToken: "T3" },
  ];
  ok("select: 'book the first one' -> offers[0]", T.resolveFlightSelection("book the first one", offers).bookingToken === "T1");
  ok("select: 'book the second one' -> offers[1]", T.resolveFlightSelection("book the second one", offers).bookingToken === "T2");
  ok("select: 'book #3' -> offers[2]", T.resolveFlightSelection("book #3", offers).bookingToken === "T3");
  ok("select: 'the cheapest one' -> lowest price (T3, 600)", T.resolveFlightSelection("book the cheapest one", offers).bookingToken === "T3");
  ok("select: carrier-name match (unique) -> flynas", T.resolveFlightSelection("book the flynas flight", offers).bookingToken === "T1");
  ok("select: no signal in message -> null (never guesses)", T.resolveFlightSelection("what's the weather like there", offers) === null);
  ok("select: out-of-range ordinal -> null", T.resolveFlightSelection("book the 9th one", offers) === null);
  ok("select: empty offers -> null", T.resolveFlightSelection("book the first one", []) === null && T.resolveFlightSelection("book the first one", null) === null);
}

// ── travel.js: renderDirectBookingLinkBlock + buildTravelPacket wiring ─────────
{
  const block = T.renderDirectBookingLinkBlock({ url: "https://www.flynas.com/book?ref=abc", bookWith: "flynas" });
  ok("renderDirectBookingLinkBlock has header + url + bookWith", /^DIRECT BOOKING LINK/.test(block) && block.indexOf("https://www.flynas.com/book?ref=abc") !== -1 && /via flynas/.test(block));
  ok("renderDirectBookingLinkBlock: absent -> ''", T.renderDirectBookingLinkBlock(null) === "" && T.renderDirectBookingLinkBlock({}) === "");

  const trip = { origin: { city: "Riyadh", iata: "RUH", source: "env" }, destination: { city: "Alexandria", iata: "HBE" }, dates: { depart: "2026-08-14" }, needs: ["flights"] };
  const offers = [{ price: 780, currency: "SAR", carrier: "flynas", flightNumber: "XY 123", departISO: "2026-08-14T02:00", arriveISO: "2026-08-14T04:15", durationMin: 195, stops: 0, bookingToken: "T1" }];
  const pk = T.buildTravelPacket(trip, { offers, directBookingLink: { url: "https://www.flynas.com/book?ref=abc", bookWith: "flynas" } });
  const HDR = "DIRECT BOOKING LINK (composed in code";
  ok("packet with directBookingLink: block present", pk.block.indexOf(HDR) !== -1);
  ok("packet: DIRECT BOOKING LINK sits above the generic BOOKING LINKS block", pk.block.indexOf(HDR) < pk.block.indexOf("BOOKING LINKS"));
  ok("packet: LIVE FLIGHTS still above DIRECT BOOKING LINK", pk.block.indexOf("LIVE FLIGHTS") < pk.block.indexOf(HDR));

  const pkNo = T.buildTravelPacket(trip, { offers });
  ok("packet without directBookingLink: no DIRECT BOOKING LINK data block (byte-identical to before this feature)", pkNo.block.indexOf(HDR) === -1);

  const dir = T.buildTravelDirective(trip, {});
  ok("directive: LINKS rule now permits a LIVE HOTELS row link + a DIRECT BOOKING LINK block", /LIVE HOTELS row/.test(dir) && /DIRECT BOOKING LINK block/.test(dir));
  ok("directive: still forbids inventing/altering a URL", /NEVER write, construct, shorten, or invent a URL/.test(dir));
}

// ── ★ D8 payment boundary + privacy: SOURCE greps on flightSearch.js (post-B3) ──
{
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "tools", "flightSearch.js"), "utf8");
  ok("D8: still no real booking/order/payment/checkout ENDPOINT (only the word 'booking_token'/'booking_options'/'booking_request', which are SerpApi field names, not our endpoint)",
    !/\/orders\b|\/payment\b|\/reservation\b|\/checkout\b/i.test(src));
  ok("D8: no card-shaped field", !/card_number|cardnumber|\bcvv\b|\bcvc\b|card_holder/i.test(src));
  ok("tool hits only the SerpApi search endpoint (getBookingLink included)", (src.match(/serpapi\.com\/[a-z.]+/gi) || []).every((m) => m === "serpapi.com/search.json"));
}

// ── ★ Privacy wall: MOCK fetch, getBookingLink request shape ───────────────────
async function requestShapeTests() {
  const origFetch = global.fetch;
  const prevKey = process.env.SERPAPI_KEY;
  let captured = null;
  global.fetch = async (url) => {
    captured = String(url);
    return { ok: true, json: async () => ({ booking_options: [{ together: { book_with: "flynas", booking_request: { url: "https://www.flynas.com/book?ref=abc" } } }] }), text: async () => "" };
  };
  process.env.SERPAPI_KEY = "TEST_DUMMY_KEY_NOT_REAL";
  let result;
  try {
    result = await F.getBookingLink({ booking_token: "TOKEN_ABC123", departure_id: "RUH", arrival_id: "HBE", outbound_date: "2026-08-14", currency: "SAR" });
  } finally {
    global.fetch = origFetch;
    if (prevKey === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = prevKey;
  }
  ok("getBookingLink: returns the redeemed link end-to-end (mocked)", result && result.url === "https://www.flynas.com/book?ref=abc" && result.bookWith === "flynas");

  const u = new URL(captured);
  const keys = Array.from(u.searchParams.keys()).sort();
  const allowed = ["api_key", "arrival_id", "booking_token", "currency", "departure_id", "engine", "gl", "hl", "outbound_date", "type"].sort();
  ok("privacy: outbound query keys are the allowlist only (route+token+key, no name/money)", keys.length === allowed.length && keys.every((k, i) => k === allowed[i]));
  ok("privacy: NO name/email/passenger/money param leaves the process", !keys.some((k) => /name|email|passenger|price|amount|fare|card|money/i.test(k)));
  ok("request: engine=google_flights, one-way (no return_date passed)", u.searchParams.get("engine") === "google_flights" && u.searchParams.get("type") === "2");

  // key-gate + param-gate
  let threw = false;
  const keySave = process.env.SERPAPI_KEY; delete process.env.SERPAPI_KEY;
  try { await F.getBookingLink({ booking_token: "T", departure_id: "RUH", arrival_id: "HBE", outbound_date: "2026-08-14" }); } catch (_) { threw = true; }
  if (keySave === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = keySave;
  ok("key-gate: getBookingLink throws with no key", threw === true);

  let threw2 = false;
  process.env.SERPAPI_KEY = "TEST_DUMMY_KEY_NOT_REAL";
  try { await F.getBookingLink({ departure_id: "RUH", arrival_id: "HBE", outbound_date: "2026-08-14" }); } catch (_) { threw2 = true; }
  if (prevKey === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = prevKey;
  ok("param-gate: getBookingLink throws with no booking_token", threw2 === true);
}

requestShapeTests().then(() => {
  console.log("=".repeat(72));
  const total = pass + fails.length;
  console.log(`\nResults: ${pass}/${total} passed, ${fails.length} failed\n`);
  if (fails.length) { fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
  else console.log("All Build-188 direct-booking-links unit tests passed.\n");
}).catch((e) => { console.error("FATAL", e); process.exit(1); });
