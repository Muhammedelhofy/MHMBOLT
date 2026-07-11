/**
 * M8 Flight Search Tool — lib/tools/flightSearch.js  (Build-184, Travel PHASE B)
 *
 * SerpApi Google Flights wrapper (spec M8_TRAVEL_LANE_SPEC.md §D6, Amendment B1).
 * Amadeus Self-Service was decommissioned 2026-07-17, so Phase B uses SerpApi's
 *   engine=google_flights — Google Flights quality, and (the point Muhammad asked
 *   about) it INCLUDES low-cost carriers (Air Arabia, flynas, …) that a GDS misses.
 *
 * It is tier-0 of a FAIL-SAFE waterfall driven from the travel packet:
 *   flightSearch()  →  web search()  →  links-only + honesty guard
 * so if the key is unset, the flag is off, the call times out, the quota is
 * exhausted, or the route has no data, the caller simply falls through to the
 * Phase-A web-search path — the user NEVER sees an error (see the orchestrator's
 * travel block + lib/travel.js flightsEnabled/planFlightSearch).
 *
 * ★ PAYMENT BOUNDARY (§D8, structural): this is a READ-ONLY search. There is no
 *   booking, order, or checkout endpoint anywhere in the integration — SerpApi
 *   returns Google Flights listings, nothing bookable. M8 finds and hands a LINK;
 *   Muhammad confirms and pays on the airline site.
 *
 * ★ PRIVACY WALL (§2.1): the only data sent to SerpApi is ROUTE (IATA codes) +
 *   DATES + passenger COUNTS. Never a name, never a money figure, never a DB row.
 *
 * DISCIPLINE: a 7s hard timeout (AbortController — mirrors serperSearch.js) leaves
 *   room for the Gemini answer call inside Vercel's window; ≤1 flight call/turn.
 *   normalizeFlights() is PURE + exported so the PS-5.1 mirror asserts the mapping
 *   with no network. The final answer is composed by the LLM from the normalized
 *   offers exactly as it is for web snippets — no reasoning happens here.
 *
 * ★ AMENDMENT B3 (direct booking links, fetch-on-pick): the base search above
 *   never returns a bookable link — only a `booking_token` per offer. getBookingLink()
 *   redeems ONE token via a second SerpApi call, made ONLY when the user picks a
 *   specific offer in a follow-up (orchestrator.js: wantsFlightBookingLink +
 *   resolveFlightSelection in lib/travel.js) — never upfront for every offer shown,
 *   to avoid burning the 250/mo free quota 5x per search. extractBookingLink() only
 *   surfaces a plain clickable GET link (rejects a POST-only redirect as unusable).
 */

const SERPAPI_URL = "https://serpapi.com/search.json";

// 7-second hard timeout (mirrors serperSearch's SERPER_TIMEOUT_MS).
const FLIGHT_TIMEOUT_MS = 7000;

// SerpApi google_flights `type`: 1 = round trip (DEFAULT — requires return_date),
// 2 = one way, 3 = multi-city. We only ever emit 1 or 2.
const TYPE_ROUND = "1";
const TYPE_ONEWAY = "2";

// Cap how many offers we surface to the model (kept small — cheapest few is the ask).
const MAX_OFFERS = 5;

// "2026-08-14 02:00" | "2026-08-14T02:00" -> "2026-08-14T02:00"; anything else -> null.
// Pure + exported (the PS mirror asserts it). SerpApi times are LOCAL airport wall-clock
// with no zone — we keep them as a naive ISO (no Z), which is what Google Flights shows.
function toISO(t) {
  if (typeof t !== "string") return null;
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : null;
}

// Normalize a raw SerpApi google_flights payload into M8's canonical offer shape:
//   { offers: [{ price, currency, carrier, flightNumber, departISO, arriveISO,
//                durationMin, stops }], source: "serpapi" }
// Pure + exported so the PS mirror can assert the mapping without a network call.
// best_flights (Google's recommended) rank ahead of other_flights; capped at MAX_OFFERS.
function normalizeFlights(data, opts) {
  const o = opts || {};
  const currency = (o.currency && String(o.currency)) || "SAR";
  const max = Number.isFinite(o.max) && o.max > 0 ? Math.trunc(o.max) : MAX_OFFERS;
  const empty = { offers: [], source: "serpapi" };
  if (!data || typeof data !== "object") return empty;

  const best = Array.isArray(data.best_flights) ? data.best_flights : [];
  const other = Array.isArray(data.other_flights) ? data.other_flights : [];
  const itineraries = best.concat(other);

  const offers = [];
  for (const it of itineraries) {
    if (offers.length >= max) break;
    if (!it || typeof it !== "object") continue;
    const legs = Array.isArray(it.flights) ? it.flights.filter((l) => l && typeof l === "object") : [];
    if (!legs.length) continue;
    const first = legs[0];
    const last = legs[legs.length - 1];

    // Distinct operating airlines across the legs, in order (e.g. "Saudia" or
    // "flynas / EgyptAir" for a connection with a carrier change).
    const carriers = [];
    for (const l of legs) {
      if (l.airline && typeof l.airline === "string" && carriers.indexOf(l.airline) === -1) carriers.push(l.airline);
    }

    const price = Number.isFinite(it.price) ? it.price : null;
    const departISO = toISO(first.departure_airport && first.departure_airport.time);
    const arriveISO = toISO(last.arrival_airport && last.arrival_airport.time);
    const durationMin = Number.isFinite(it.total_duration) ? it.total_duration : null;
    const stops = Math.max(0, legs.length - 1);

    offers.push({
      price,
      currency,
      carrier: carriers.length ? carriers.join(" / ") : null,
      flightNumber: (first.flight_number && typeof first.flight_number === "string") ? first.flight_number : null,
      departISO,
      arriveISO,
      durationMin,
      stops,
      // Redeemed via getBookingLink() ONLY when the user picks this specific
      // offer in a follow-up ("book the first one") — never fetched upfront for
      // all offers (extra SerpApi call + quota per redemption, Amendment B3).
      bookingToken: (it.booking_token && typeof it.booking_token === "string") ? it.booking_token : null,
    });
  }
  return { offers, source: "serpapi" };
}

/**
 * Query SerpApi Google Flights for the cheapest offers on a route.
 * @param {{departure_id:string, arrival_id:string, outbound_date:string,
 *          return_date?:string, currency?:string, adults?:number,
 *          children?:number, max?:number}} params  (IATA codes + ISO dates + counts only)
 * @returns {Promise<{offers:Array, source:"serpapi"}>}
 * @throws on missing key, missing route/date, non-2xx, SerpApi error, or timeout —
 *         the caller's waterfall turns any throw into the web-search fallback.
 */
async function searchFlights(params) {
  if (!process.env.SERPAPI_KEY) throw new Error("SERPAPI_KEY not set");
  const p = params || {};
  const departure_id = p.departure_id;
  const arrival_id = p.arrival_id;
  const outbound_date = p.outbound_date;
  if (!departure_id || !arrival_id || !outbound_date) {
    throw new Error("flightSearch: departure_id, arrival_id and outbound_date are required");
  }
  const currency = (p.currency && String(p.currency)) || "SAR";
  const return_date = p.return_date && String(p.return_date);

  const qs = new URLSearchParams({
    engine: "google_flights",
    departure_id: String(departure_id),
    arrival_id: String(arrival_id),
    outbound_date: String(outbound_date),
    currency,
    hl: "en",
    gl: "sa",
    api_key: process.env.SERPAPI_KEY,
  });
  // Round trip only when a return date is present; else one-way (type=2 avoids
  // SerpApi's "return_date is required" error that the default type=1 would raise).
  if (return_date) {
    qs.set("type", TYPE_ROUND);
    qs.set("return_date", return_date);
  } else {
    qs.set("type", TYPE_ONEWAY);
  }
  if (Number.isFinite(p.adults) && p.adults > 0) qs.set("adults", String(Math.trunc(p.adults)));
  if (Number.isFinite(p.children) && p.children > 0) qs.set("children", String(Math.trunc(p.children)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLIGHT_TIMEOUT_MS);
  try {
    const res = await fetch(`${SERPAPI_URL}?${qs.toString()}`, { signal: controller.signal });
    if (!res.ok) {
      // 429 = quota exhausted, 401 = bad key, etc. — all fall through to the waterfall.
      const body = await res.text().catch(() => "");
      throw new Error(`SerpApi ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    if (data && data.error) throw new Error(`SerpApi error: ${String(data.error).slice(0, 200)}`);
    return normalizeFlights(data, { currency, max: p.max });
  } finally {
    clearTimeout(timer);
  }
}

// extractBookingLink: pure, defensive parse of SerpApi's booking_options shape
// (Amendment B3). Google Flights redemption often returns a booking_request that
// needs a form POST (post_data present) rather than a plain clickable GET link —
// a link that silently doesn't work is worse than admitting none is available, so
// this ONLY returns a link when it is a bare GET url with NO post_data. Checks the
// "together"/"departing"/"arriving" legs SerpApi may use depending on trip shape.
// Exported + pure so the PS mirror can assert the mapping without a network call.
function extractBookingLink(data) {
  const opts = data && Array.isArray(data.booking_options) ? data.booking_options : [];
  for (const opt of opts) {
    if (!opt || typeof opt !== "object") continue;
    for (const legKey of ["together", "departing", "arriving"]) {
      const leg = opt[legKey];
      if (!leg || typeof leg !== "object") continue;
      const req = leg.booking_request;
      if (req && typeof req === "object" && typeof req.url === "string" && req.url && !req.post_data) {
        return { url: req.url, bookWith: (typeof leg.book_with === "string" && leg.book_with) || null };
      }
    }
  }
  return null;
}

/**
 * Redeem a booking_token (from a normalizeFlights offer) for the REAL clickable
 * airline/OTA link, via a SECOND SerpApi call — only made when the user picks a
 * specific offer in a follow-up (Amendment B3: "book the first one"), never
 * upfront for every offer shown (extra SerpApi credit + latency per redemption).
 * SerpApi requires the SAME route/date params as the original search alongside
 * the token to resolve it. Live-verify: a real two-turn prod conversation
 * (search, then "book the first one") — see BUILD_LOG.md B-188.
 * @param {{booking_token:string, departure_id:string, arrival_id:string,
 *          outbound_date:string, return_date?:string, currency?:string}} params
 * @returns {Promise<{url:string, bookWith:string|null}|null>} null when SerpApi
 *   returns no plain-GET link — the caller falls back to the generic search link.
 * @throws on missing key/params, non-2xx, SerpApi error, or timeout.
 */
async function getBookingLink(params) {
  if (!process.env.SERPAPI_KEY) throw new Error("SERPAPI_KEY not set");
  const p = params || {};
  const booking_token = p.booking_token;
  const departure_id = p.departure_id;
  const arrival_id = p.arrival_id;
  const outbound_date = p.outbound_date;
  if (!booking_token || !departure_id || !arrival_id || !outbound_date) {
    throw new Error("getBookingLink: booking_token, departure_id, arrival_id and outbound_date are required");
  }
  const currency = (p.currency && String(p.currency)) || "SAR";
  const return_date = p.return_date && String(p.return_date);

  const qs = new URLSearchParams({
    engine: "google_flights",
    departure_id: String(departure_id),
    arrival_id: String(arrival_id),
    outbound_date: String(outbound_date),
    booking_token: String(booking_token),
    currency,
    hl: "en",
    gl: "sa",
    api_key: process.env.SERPAPI_KEY,
  });
  if (return_date) {
    qs.set("type", TYPE_ROUND);
    qs.set("return_date", return_date);
  } else {
    qs.set("type", TYPE_ONEWAY);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLIGHT_TIMEOUT_MS);
  try {
    const res = await fetch(`${SERPAPI_URL}?${qs.toString()}`, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SerpApi ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    if (data && data.error) throw new Error(`SerpApi error: ${String(data.error).slice(0, 200)}`);
    return extractBookingLink(data);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { searchFlights, normalizeFlights, toISO, getBookingLink, extractBookingLink };
