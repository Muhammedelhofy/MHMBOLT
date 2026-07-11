/**
 * M8 Hotel Search Tool — lib/tools/hotelSearch.js  (Travel PHASE B, hotels extension)
 *
 * SerpApi Google Hotels wrapper — same SerpApi key flights already use
 * (engine=google_hotels instead of google_flights), mirroring flightSearch.js's
 * approach exactly. M8_TRAVEL_LANE_SPEC.md originally planned hotels as
 * "links-only now, Amadeus Hotel Search as a later extension on the same key" —
 * that extension was never built (only flights got upgraded in Amendment B1).
 * This is that extension, on SerpApi instead of the decommissioned Amadeus.
 *
 * Real incident that motivated this: a live hotel-search turn with no hotel
 * integration wired in got answered with a fabricated price table explicitly
 * labeled "based on 2024 Booking.com data" — the LLM hallucinating a capability
 * it didn't have. This tool closes that gap the same way flights closed theirs.
 *
 * Tier-0 of the SAME fail-safe waterfall as flights:
 *   hotelSearch()  →  web search()  →  links-only + honesty guard
 * so an unset key, disabled flag, timeout, exhausted quota, or a query with no
 * data falls straight through to the Phase-A web-search + Booking.com link
 * path — the user NEVER sees an error.
 *
 * ★ PAYMENT BOUNDARY (§D8, structural): this is a READ-ONLY search. There is no
 *   booking, order, or checkout endpoint anywhere in the integration — SerpApi
 *   returns Google Hotels listings, nothing bookable. M8 finds and hands the
 *   general Booking.com link (buildBookingLinks); Muhammad confirms and pays
 *   on the hotel/OTA site himself.
 *
 * ★ PRIVACY WALL (§2.1): the only data sent to SerpApi is the DESTINATION query
 *   text + check-in/check-out DATES + guest COUNTS. Never a name, never a money
 *   figure, never a DB row.
 *
 * DISCIPLINE: a 7s hard timeout (mirrors flightSearch.js / serperSearch.js);
 *   ≤1 hotel call/turn. normalizeHotels() is PURE + exported so the PS-5.1
 *   mirror asserts the mapping with no network. The final answer is composed
 *   by the LLM from the normalized offers exactly as it is for flights — no
 *   reasoning happens here.
 */

const SERPAPI_URL = "https://serpapi.com/search.json";

// 7-second hard timeout (mirrors flightSearch's FLIGHT_TIMEOUT_MS).
const HOTEL_TIMEOUT_MS = 7000;

// Cap how many offers we surface to the model (kept small — best few is the ask).
const MAX_OFFERS = 5;

// Normalize a raw SerpApi google_hotels payload into M8's canonical offer shape:
//   { offers: [{ name, pricePerNight, currency, rating, reviews, hotelClass }],
//     source: "serpapi" }
// Pure + exported so the PS mirror can assert the mapping without a network call.
// Sorted cheapest-known-price first; entries with no extracted price sink to the
// end (still shown — never dropped just for missing a price).

// _pickHotelLink: prefer a named OTA-site (e.g. Booking.com) link from the per-site prices[]
// array (a real "book here" link for that exact property) over the generic
// property.link (Google Hotels' own page) — both are code-composed from SerpApi,
// never LLM-invented, satisfying the same D8 boundary as buildBookingLinks.
function _pickHotelLink(p) {
  if (Array.isArray(p.prices)) {
    for (const pr of p.prices) {
      if (pr && typeof pr === "object" && typeof pr.link === "string" && pr.link) return pr.link;
    }
  }
  return (typeof p.link === "string" && p.link) ? p.link : null;
}

function normalizeHotels(data, opts) {
  const o = opts || {};
  const currency = (o.currency && String(o.currency)) || "SAR";
  const max = Number.isFinite(o.max) && o.max > 0 ? Math.trunc(o.max) : MAX_OFFERS;
  const empty = { offers: [], source: "serpapi" };
  if (!data || typeof data !== "object") return empty;

  const properties = Array.isArray(data.properties) ? data.properties : [];
  const offers = [];
  for (const p of properties) {
    if (!p || typeof p !== "object") continue;
    const name = (p.name && typeof p.name === "string") ? p.name : null;
    if (!name) continue;

    const rate = p.rate_per_night && typeof p.rate_per_night === "object" ? p.rate_per_night : null;
    const pricePerNight = rate && Number.isFinite(rate.extracted_lowest) ? rate.extracted_lowest : null;
    const rating = Number.isFinite(p.overall_rating) ? p.overall_rating : null;
    const reviews = Number.isFinite(p.reviews) ? p.reviews : null;
    const hotelClass = (p.hotel_class && typeof p.hotel_class === "string") ? p.hotel_class : null;
    const link = _pickHotelLink(p);

    offers.push({ name, pricePerNight, currency, rating, reviews, hotelClass, link });
  }

  offers.sort((a, b) => {
    if (a.pricePerNight == null && b.pricePerNight == null) return 0;
    if (a.pricePerNight == null) return 1;
    if (b.pricePerNight == null) return -1;
    return a.pricePerNight - b.pricePerNight;
  });

  return { offers: offers.slice(0, max), source: "serpapi" };
}

/**
 * Query SerpApi Google Hotels for the best current listings at a destination.
 * @param {{q:string, check_in_date:string, check_out_date:string, currency?:string,
 *          adults?:number, children?:number, max?:number}} params
 *   (destination text + ISO dates + guest counts only)
 * @returns {Promise<{offers:Array, source:"serpapi"}>}
 * @throws on missing key, missing query/dates, non-2xx, SerpApi error, or timeout —
 *         the caller's waterfall turns any throw into the web-search fallback.
 */
async function searchHotels(params) {
  if (!process.env.SERPAPI_KEY) throw new Error("SERPAPI_KEY not set");
  const p = params || {};
  const q = p.q;
  const check_in_date = p.check_in_date;
  const check_out_date = p.check_out_date;
  if (!q || !check_in_date || !check_out_date) {
    throw new Error("hotelSearch: q, check_in_date and check_out_date are required");
  }
  const currency = (p.currency && String(p.currency)) || "SAR";

  const qs = new URLSearchParams({
    engine: "google_hotels",
    q: String(q),
    check_in_date: String(check_in_date),
    check_out_date: String(check_out_date),
    currency,
    hl: "en",
    gl: "sa",
    api_key: process.env.SERPAPI_KEY,
  });
  if (Number.isFinite(p.adults) && p.adults > 0) qs.set("adults", String(Math.trunc(p.adults)));
  if (Number.isFinite(p.children) && p.children > 0) qs.set("children", String(Math.trunc(p.children)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HOTEL_TIMEOUT_MS);
  try {
    const res = await fetch(`${SERPAPI_URL}?${qs.toString()}`, { signal: controller.signal });
    if (!res.ok) {
      // 429 = quota exhausted, 401 = bad key, etc. — all fall through to the waterfall.
      const body = await res.text().catch(() => "");
      throw new Error(`SerpApi ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    if (data && data.error) throw new Error(`SerpApi error: ${String(data.error).slice(0, 200)}`);
    return normalizeHotels(data, { currency, max: p.max });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { searchHotels, normalizeHotels };
