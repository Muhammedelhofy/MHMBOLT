"use strict";
/**
 * Build-183 — lib/travel.js  (Travel lane PHASE A: travel-core, NO new key)
 *
 * The meaning-first travel/trip-planning lane. Upgrades the thin regex travel path
 * (intentClassifier LIVE_DATA + slots.js token-presence clarify) into three reusable
 * primitives, all behind M8_TRAVEL_LANE (default on; off => byte-identical routing):
 *
 *   (1) MEANING-FIRST INTENT — "I'm travelling to Alexandria" recognised by MEANING
 *       (a registry domain + semantic exemplars, in capability-registry.js /
 *       semantic-router.js), never a new keyword ACTION lane (Muhammad's #1 rule).
 *   (2) LLM SLOT-FILLING — extractTripState() reads the last ~6 turns and returns a
 *       structured trip (where / when / how-many / needs), stateless: the trip is
 *       RECONSTRUCTED from the conversation each turn (the wallet parse-our-own-prompt
 *       precedent), no pending-table, no schema migration. Fail-safe: any throw /
 *       unparseable output => null => the whole travel packet is skipped and the turn
 *       runs today's path (degraded == current prod, never worse).
 *   (3) CONFIRM-INFERRED-CONTEXT — origin is INFERRED (home city) then STATED OUT LOUD
 *       with an invitation to correct ("Assuming you're flying from Riyadh — tell me if
 *       not"). This is THE REUSABLE CORE PATTERN: any lane that infers context must
 *       (a) state the inference, (b) name its source, (c) invite correction, (d) treat
 *       confirmed != inferred. See resolveOrigin() / originConfirmClause().
 *
 * ★ PAYMENT BOUNDARY (structural, non-negotiable — §D8): M8 finds, plans, and hands a
 *   LINK; Muhammad confirms and PAYS on the airline/hotel site. The terminal action of
 *   this lane is COMPOSING A LINK (buildBookingLinks) — there is no booking API, no
 *   payment credential, no vendor POST anywhere. The LLM is FORBIDDEN from writing URLs:
 *   links are composed HERE, in code, from validated fields only (buildTravelDirective
 *   orders "present links ONLY from the LINKS block, never invent a URL").
 *
 * PURITY / TESTABILITY: every function EXCEPT extractTripState() is PURE over its
 * arguments (no DB, no LLM, no network, no clock except a couple that read the current
 * year/today) — so the PS-5.1 mirror asserts the SAME link/clarify/plan logic on this
 * Node-less host. extractTripState() is the ONE LLM call (free-stack, temp 0), isolated
 * and fully fail-safe.
 *
 * PRIVACY: the extractor sees only conversation TEXT (already sent to the LLM every
 * turn) — never a money figure or a DB row. Telemetry breadcrumbs (in the orchestrator)
 * carry sizes/counts ONLY, never a destination name or trip content (B-168 contract).
 */

const { generate } = require("./llm");

// Free, fast providers first — this is a cheap extraction, not the final answer
// (mirrors router.js's ROUTER_PROVIDER_ORDER).
const TRAVEL_PROVIDER_ORDER = process.env.ROUTER_PROVIDER_ORDER || "groq,gemini,gemini2,openrouter"; // B-185: cerebras dropped, dead 400 hop

// ── ENV LEVERS (all inert until deployed) ─────────────────────────────────────
// M8_HOME_CITY   — the D3 fallback origin when none is stated/in-profile (default Riyadh).
// M8_TRAVEL_SEARCH_CAP — max web searches per travel turn (default 2; ~3,500 free/mo).
function homeCity() {
  const v = String(process.env.M8_HOME_CITY || "").trim();
  return v || "Riyadh";
}
function travelSearchCap() {
  const n = parseInt(process.env.M8_TRAVEL_SEARCH_CAP, 10);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

// ── SHAPE VALIDATORS ──────────────────────────────────────────────────────────
const IATA_RE = /^[A-Z]{3}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validIata(s) { return typeof s === "string" && IATA_RE.test(s); }
function validIsoDate(s) { return typeof s === "string" && ISO_DATE_RE.test(s); }

// ── CITY -> IATA (small static map; keyless) ──────────────────────────────────
// Phase A composes booking links from city NAMES where possible (Google Flights /
// Booking / Maps accept natural-language). Skyscanner needs IATA path segments, so a
// small static map resolves the common Saudi/Egypt/Gulf routes; a miss simply omits
// the Skyscanner link (never a guessed code). Phase B adds an Amadeus resolver (§D6).
const CITY_IATA = {
  riyadh: "RUH", jeddah: "JED", jedda: "JED", dammam: "DMM", khobar: "DMM",
  medina: "MED", madinah: "MED", abha: "AHB", tabuk: "TUK", taif: "TIF",
  yanbu: "YNB", alula: "ULH", "al ula": "ULH", gassim: "ELQ", buraidah: "ELQ",
  cairo: "CAI", alexandria: "HBE", "sharm el sheikh": "SSH", sharm: "SSH",
  hurghada: "HRG", luxor: "LXR", aswan: "ASW",
  dubai: "DXB", "abu dhabi": "AUH", sharjah: "SHJ", doha: "DOH",
  kuwait: "KWI", "kuwait city": "KWI", manama: "BAH", bahrain: "BAH",
  muscat: "MCT", amman: "AMM", beirut: "BEY", istanbul: "IST", ankara: "ESB",
  london: "LHR", paris: "CDG", "new york": "JFK", madrid: "MAD", rome: "FCO",
  jakarta: "CGK", "kuala lumpur": "KUL", bangkok: "BKK", "male": "MLE",
  maldives: "MLE", mumbai: "BOM", delhi: "DEL", singapore: "SIN",
};
function cityToIata(city) {
  if (!city || typeof city !== "string") return null;
  const k = city.trim().toLowerCase();
  if (CITY_IATA[k]) return CITY_IATA[k];
  const base = k.split(/[,(/]/)[0].trim(); // "Alexandria, Egypt" -> "alexandria"
  return CITY_IATA[base] || null;
}

// City → country, for DISAMBIGUATING search queries (e.g. "Alexandria" without a
// country returns Alexandria, Virginia — the wrong one). Used only to enrich the
// code-composed search text, never a URL. A miss just omits the hint (no guess).
const CITY_COUNTRY = {
  riyadh: "Saudi Arabia", jeddah: "Saudi Arabia", jedda: "Saudi Arabia", dammam: "Saudi Arabia",
  khobar: "Saudi Arabia", medina: "Saudi Arabia", madinah: "Saudi Arabia", abha: "Saudi Arabia",
  tabuk: "Saudi Arabia", taif: "Saudi Arabia", yanbu: "Saudi Arabia", alula: "Saudi Arabia", "al ula": "Saudi Arabia",
  gassim: "Saudi Arabia", buraidah: "Saudi Arabia",
  cairo: "Egypt", alexandria: "Egypt", "sharm el sheikh": "Egypt", sharm: "Egypt",
  hurghada: "Egypt", luxor: "Egypt", aswan: "Egypt",
  dubai: "UAE", "abu dhabi": "UAE", sharjah: "UAE", doha: "Qatar", kuwait: "Kuwait",
  "kuwait city": "Kuwait", manama: "Bahrain", bahrain: "Bahrain", muscat: "Oman", amman: "Jordan",
  beirut: "Lebanon", istanbul: "Turkey", ankara: "Turkey", london: "UK", paris: "France",
  madrid: "Spain", rome: "Italy", "new york": "USA", jakarta: "Indonesia", "kuala lumpur": "Malaysia",
  bangkok: "Thailand", "male": "Maldives", maldives: "Maldives", mumbai: "India", delhi: "India", singapore: "Singapore",
};
function cityCountry(city) {
  if (!city || typeof city !== "string") return null;
  const k = city.trim().toLowerCase();
  if (CITY_COUNTRY[k]) return CITY_COUNTRY[k];
  const base = k.split(/[,(/]/)[0].trim();
  return CITY_COUNTRY[base] || null;
}

// ── B-191 (FIX 4): COUNTRY-LEVEL ORIGIN ───────────────────────────────────────
// The origin resolver is CITY-level (cityToIata). When a user states a whole COUNTRY
// as the departure ("the trip is from Egypt") there is no single airport to fly from,
// and silently keeping the home-city default (Riyadh) is wrong. This map lets the lane
// RECOGNISE a country origin so it can ASK which city — we never invent a capital hub
// for a country (spec: "Do not invent an airport"). EN display name → for the question;
// AR turns echo the user's own word. City-states whose name IS a city key (Kuwait,
// Bahrain, Singapore) resolve via cityToIata and are never treated as country origins.
const COUNTRY_NAMES = {
  "egypt": "Egypt", "saudi arabia": "Saudi Arabia", "ksa": "Saudi Arabia", "the kingdom": "Saudi Arabia",
  "uae": "the UAE", "united arab emirates": "the UAE", "the emirates": "the UAE", "emirates": "the UAE",
  "qatar": "Qatar", "oman": "Oman", "jordan": "Jordan", "lebanon": "Lebanon", "turkey": "Turkey",
  "uk": "the UK", "united kingdom": "the UK", "britain": "the UK", "england": "the UK",
  "france": "France", "spain": "Spain", "italy": "Italy", "germany": "Germany",
  "usa": "the USA", "us": "the USA", "united states": "the USA", "america": "the USA",
  "india": "India", "indonesia": "Indonesia", "malaysia": "Malaysia", "thailand": "Thailand",
  "مصر": "Egypt", "السعودية": "Saudi Arabia", "الإمارات": "the UAE", "الامارات": "the UAE",
  "قطر": "Qatar", "عُمان": "Oman", "عمان": "Oman", "الأردن": "Jordan", "الاردن": "Jordan",
  "لبنان": "Lebanon", "تركيا": "Turkey", "بريطانيا": "the UK", "فرنسا": "France", "أمريكا": "the USA",
};
function countryName(name) {
  if (!name || typeof name !== "string") return null;
  const k = name.trim().toLowerCase();
  if (COUNTRY_NAMES[k]) return COUNTRY_NAMES[k];
  const base = k.split(/[,(/]/)[0].trim();
  return COUNTRY_NAMES[base] || null;
}
// True when the trip's origin is a country name that has no resolvable airport (so it
// can't stand in as a departure city). A country that is ALSO a known city key (and thus
// resolves via cityToIata) returns false — it already has one airport.
function isCountryOrigin(trip) {
  const o = trip && trip.origin;
  if (!o || !o.city) return false;
  return !!countryName(o.city) && !cityToIata(o.city);
}
// The clarify string for a STATED country origin — "" / null when it isn't one.
function originCountryAsk(trip, ar) {
  if (!isCountryOrigin(trip)) return null;
  const src = trip.origin.source;
  if (src !== "stated" && src !== "confirmed") return null; // only re-ask a country the USER stated
  return ar
    ? `${trip.origin.city} بلد كبير — من أي مدينة تسافر؟`
    : `Which city in ${countryName(trip.origin.city)} are you flying from?`;
}

// B-191 fix-forward (FIX 4b) — CODE-GUARANTEED country-origin detection. The LLM
// extractor silently resolves a stated country to its capital ("from Egypt" → Cairo),
// which masked the originCountryAsk clarifier and let M8 ASSUME a city instead of
// asking. This deterministic scan of the user's OWN message re-asserts a stated country
// as the origin (overriding the LLM's guess) so the lane asks which city. Anchored on a
// departure preposition so "outside Egypt" / "trip TO Egypt" never match; a stated CITY
// ("from Cairo") isn't a country key, so it returns null and the LLM's city stands.
const _ORIGIN_COUNTRY_TOKENS = Object.keys(COUNTRY_NAMES)
  .filter((k) => k !== "us")                       // 'us' is too ambiguous after "from"
  .sort((a, b) => b.length - a.length);            // longest-first: "saudi arabia" before "..."
const _FROM_COUNTRY_RE = new RegExp(
  "(?:\\b(?:from|flying\\s+from|depart(?:ing)?\\s+from|leaving\\s+from|out\\s+of|travell?ing\\s+from)|\\u0645\\u0646)\\s+(?:the\\s+)?(" +
    _ORIGIN_COUNTRY_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")).join("|") +
    ")\\b",
  "i"
);
function detectStatedCountryOrigin(text) {
  const m = _FROM_COUNTRY_RE.exec(String(text || ""));
  return m ? m[1] : null;   // the surface token (a COUNTRY_NAMES key), or null
}

// ── DATE HELPERS (pure) ───────────────────────────────────────────────────────
const _MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function yymmdd(iso) { // "2026-08-14" -> "260814" (Skyscanner path segment)
  return iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
}
function monthName(iso) {
  const m = parseInt(iso.slice(5, 7), 10);
  return (m >= 1 && m <= 12) ? _MONTHS[m - 1] : "";
}
function dateHint(trip) {
  const d = trip && trip.dates;
  if (!d) return "";
  if (validIsoDate(d.depart)) return `${monthName(d.depart)} ${d.depart.slice(0, 4)}`;
  if (typeof d.flex === "string" && d.flex) return d.flex;
  return "";
}
function hasDates(trip) {
  const d = trip && trip.dates;
  if (!d) return false;
  return validIsoDate(d.depart) || (typeof d.flex === "string" && d.flex.length > 0);
}

const NEED_SET = ["flights", "hotels", "food", "restaurants", "attractions", "itinerary", "ideas"];
function tripNeeds(trip) {
  const n = trip && Array.isArray(trip.needs) ? trip.needs.filter((x) => NEED_SET.indexOf(x) !== -1) : [];
  return n.length ? n : ["flights"]; // "I'm travelling to X" with no stated need => flights
}

// ── D3: CONFIRM-INFERRED-CONTEXT (the reusable core pattern) ──────────────────
// resolveOrigin fills the trip's origin from the source order stated/confirmed >
// profile > env, tagging the SOURCE so downstream can decide whether to confirm.
// A stated/confirmed origin is trusted silently; an inferred one (profile|env) is
// stated out loud with an invitation to correct (originConfirmClause).
function resolveOrigin(trip, opts) {
  const o = opts || {};
  const cur = trip && trip.origin;
  if (cur && cur.city && (cur.source === "stated" || cur.source === "confirmed")) {
    return { city: cur.city, iata: validIata(cur.iata) ? cur.iata : cityToIata(cur.city), source: cur.source };
  }
  const profileCity = o.profileCity && String(o.profileCity).trim();
  const city = profileCity || homeCity();
  return { city, iata: cityToIata(city), source: profileCity ? "profile" : "env" };
}
function originInferred(trip) {
  const src = trip && trip.origin && trip.origin.source;
  return src === "profile" || src === "env";
}
// The composed confirm clause (D3 a/b/c) — "" when the origin was stated/confirmed.
function originConfirmClause(trip, ar) {
  if (!originInferred(trip)) return "";
  const city = (trip.origin && trip.origin.city) || homeCity();
  return ar
    ? `على افتراض أنك مسافر من ${city} (قل لي إن لم يكن كذلك) —`
    : `Assuming you're flying from ${city} (tell me if not) —`;
}

// A light best-effort scan of the injected memory rows for a stated home city
// (D3 source 2). Returns null when absent (the common case — no home-city profile
// field exists), so the env default serves until Muhammad states his origin once.
const _HOME_CITY_RE = /\b(?:lives?|living|based|reside[sd]?|home\s*(?:town|city|base)?|located)\s+(?:in|at)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/;
function profileHomeCity(pastMemory) {
  if (!Array.isArray(pastMemory)) return null;
  for (const m of pastMemory) {
    const t = m && typeof m.content === "string" ? m.content : "";
    const mm = t.match(_HOME_CITY_RE);
    if (mm && mm[1]) return mm[1].trim();
  }
  return null;
}

// ── D4: BOOKING LINK COMPOSER (pure; the LLM never writes URLs) ────────────────
// Composes ONLY from validated fields — a missing/invalid field OMITS that link,
// never a broken or guessed URL. Returns [{ label, url }]. Google Flights / Booking /
// Maps take natural-language (keyless); Skyscanner needs IATA + a depart date.
function buildBookingLinks(trip) {
  const links = [];
  if (!trip) return links;
  const dest = trip.destination && trip.destination.city;
  const origin = trip.origin && trip.origin.city;
  if (!dest) return links; // no destination => nothing resolvable
  const depIso = trip.dates && validIsoDate(trip.dates.depart) ? trip.dates.depart : null;
  const retIso = trip.dates && validIsoDate(trip.dates.return) ? trip.dates.return : null;
  const oIata = trip.origin && validIata(trip.origin.iata) ? trip.origin.iata : cityToIata(origin);
  const dIata = trip.destination && validIata(trip.destination.iata) ? trip.destination.iata : cityToIata(dest);
  const adults = trip.party && Number.isFinite(trip.party.adults) && trip.party.adults > 0 ? trip.party.adults : null;
  const children = trip.party && Number.isFinite(trip.party.children) && trip.party.children > 0 ? trip.party.children : null;

  const needs = new Set(tripNeeds(trip));
  const general = needs.size === 0;
  const wantFlights = needs.has("flights") || general;
  const wantHotels = needs.has("hotels") || general || needs.has("itinerary");
  const wantFood = needs.has("food") || needs.has("restaurants") || needs.has("attractions") || needs.has("itinerary") || general;

  const enc = encodeURIComponent;

  // Google Flights — natural-language q (city names OK, keyless). Needs origin+dest.
  if (wantFlights && origin) {
    const parts = [`Flights from ${origin} to ${dest}`];
    if (depIso) parts.push(`on ${depIso}`);
    if (retIso) parts.push(`returning ${retIso}`);
    links.push({ label: "Google Flights", url: `https://www.google.com/travel/flights?q=${enc(parts.join(" "))}` });
  }
  // Skyscanner — IATA path + yymmdd. Only when both codes resolve AND a depart date exists.
  if (wantFlights && oIata && dIata && depIso) {
    const seg = retIso ? `${yymmdd(depIso)}/${yymmdd(retIso)}` : `${yymmdd(depIso)}`;
    let url = `https://www.skyscanner.net/transport/flights/${oIata.toLowerCase()}/${dIata.toLowerCase()}/${seg}/`;
    const qp = [];
    if (adults) qp.push(`adults=${adults}`);
    if (children) qp.push(`children=${children}`);
    if (qp.length) url += `?${qp.join("&")}`;
    links.push({ label: "Skyscanner", url });
  }
  // Booking.com — hotels. Needs destination; dates/party enrich when present.
  if (wantHotels) {
    let url = `https://www.booking.com/searchresults.html?ss=${enc(dest)}`;
    if (depIso) url += `&checkin=${depIso}`;
    if (retIso) url += `&checkout=${retIso}`;
    if (adults) url += `&group_adults=${adults}`;
    if (children) url += `&group_children=${children}`;
    links.push({ label: "Booking.com", url });
  }
  // Google Maps — restaurants / attractions in the destination.
  if (wantFood) {
    links.push({ label: "Google Maps (restaurants)", url: `https://www.google.com/maps/search/${enc(`restaurants in ${dest}`)}` });
    if (needs.has("attractions") || needs.has("itinerary") || general) {
      links.push({ label: "Google Maps (things to do)", url: `https://www.google.com/maps/search/${enc(`things to do in ${dest}`)}` });
    }
  }
  return links;
}

// ── D5: SEARCH PLAN (pure) — which needs web-search vs answer from knowledge ───
// Live-priced needs (flights/hotels/food) get a CODE-composed search query (never an
// LLM-authored one), capped. Stable content (itinerary/attractions/ideas) answers from
// model knowledge + links — evergreen, no search. Queries are built from trip fields.
// opts.skipFlights: drop the flights web query — the Phase-B flightSearch tier-0
// already fetched real offers, so a web search for flights would waste the cap.
function travelSearchPlan(trip, cap, opts) {
  const c = Number.isFinite(cap) && cap > 0 ? cap : 2;
  const skipFlights = !!(opts && opts.skipFlights);
  const skipHotels = !!(opts && opts.skipHotels);
  const needs = tripNeeds(trip);
  const dest = trip && trip.destination && trip.destination.city;
  const origin = trip && trip.origin && trip.origin.city;
  const year = new Date().getFullYear();
  const hint = dateHint(trip);
  // Disambiguate the destination in the SEARCH TEXT ("Alexandria" alone returns the
  // Virginia one) — country appended only when known; a miss just omits it.
  const dCountry = cityCountry(dest);
  const destQ = dest ? (dCountry ? `${dest}, ${dCountry}` : dest) : dest;
  const queries = [];
  const searchNeeds = [];
  for (const n of needs) {
    if (queries.length >= c) break;
    if (n === "flights" && skipFlights) continue; // Phase B: real offers already fetched (flightSearch tier-0)
    if (n === "flights" && dest && origin) {
      queries.push(`cheapest flights from ${origin} to ${destQ} ${hint} ${year} price airline times`.replace(/\s+/g, " ").trim());
      searchNeeds.push("flights");
    } else if (n === "hotels" && skipHotels) {
      continue; // Phase B: real offers already fetched (hotelSearch tier-0)
    } else if (n === "hotels" && dest) {
      queries.push(`best hotels in ${destQ} ${hint} ${year} price per night`.replace(/\s+/g, " ").trim());
      searchNeeds.push("hotels");
    } else if ((n === "food" || n === "restaurants") && dest) {
      queries.push(`best restaurants in ${destQ} ${year}`.replace(/\s+/g, " ").trim());
      searchNeeds.push("food");
    }
    // attractions / itinerary / ideas -> knowledge, no query
  }
  return { queries: queries.slice(0, c), searchNeeds };
}

// ── D6 (Amendment B1): PHASE-B LIVE FLIGHTS — gate, request params, render (pure) ─
// The live-flight tier is lib/tools/flightSearch.js (SerpApi Google Flights). It sits
// at tier-0 of a FAIL-SAFE waterfall driven from the orchestrator's travel block:
//   flightSearch() → web search() → links-only + honesty guard.
// These three helpers are PURE (no network) so the PS-5.1 mirror asserts the same
// gating, the same request params, and the same rendered block on this Node-less host.

// flightsEnabled: the live tier is DARK unless M8_TRAVEL_FLIGHTS is on (default on)
// AND a SERPAPI_KEY exists — so with no key the whole lane is byte-identical to Phase A.
function flightsEnabled() {
  if (String(process.env.M8_TRAVEL_FLIGHTS || "").trim().toLowerCase() === "off") return false;
  return !!process.env.SERPAPI_KEY;
}

// planFlightSearch: build the SerpApi request params from a trip, or null when the live
// tier can't run for it (not a flights need, or a code/depart-date is missing). IATA
// comes from the extractor's shape-valid code, else the keyless cityToIata resolver. A
// concrete ISO depart date is required (a flex-only "mid-August" falls through to web
// search). Only ROUTE + DATES + passenger COUNTS ever leave the process (the privacy wall).
function planFlightSearch(trip) {
  if (!trip) return null;
  if (tripNeeds(trip).indexOf("flights") === -1) return null;
  const oCity = trip.origin && trip.origin.city;
  const dCity = trip.destination && trip.destination.city;
  const oIata = trip.origin && validIata(trip.origin.iata) ? trip.origin.iata : cityToIata(oCity);
  const dIata = trip.destination && validIata(trip.destination.iata) ? trip.destination.iata : cityToIata(dCity);
  const depart = trip.dates && validIsoDate(trip.dates.depart) ? trip.dates.depart : null;
  if (!oIata || !dIata || !depart) return null;
  const ret = trip.dates && validIsoDate(trip.dates.return) ? trip.dates.return : null;
  const adults = trip.party && Number.isFinite(trip.party.adults) && trip.party.adults > 0 ? trip.party.adults : 1;
  const children = trip.party && Number.isFinite(trip.party.children) && trip.party.children > 0 ? trip.party.children : 0;
  const params = { departure_id: oIata, arrival_id: dIata, outbound_date: depart, currency: "SAR", adults, children };
  if (ret) params.return_date = ret;
  return params;
}

// canonicalizeTripIata: overwrite a KNOWN city's airport code with the curated
// cityToIata mapping (its correct primary/international airport). The LLM extractor
// sometimes emits a shape-valid but flight-useless code — e.g. Alexandria -> "ALY"
// (El Nozha, ~no scheduled flights) instead of "HBE" (Borg El Arab). Trusting that code
// makes SerpApi return nothing and the airport ECHO wrong; the curated code fixes the
// flight SEARCH, the booking links, and the echo all at once and consistently. Unknown
// cities (cityToIata null) keep the extractor's code. Mutates the trip in place — called
// once, right after origin resolution, before links/packet/flight-search.
function canonicalizeTripIata(trip) {
  if (!trip) return trip;
  if (trip.origin && trip.origin.city) { const c = cityToIata(trip.origin.city); if (c) trip.origin.iata = c; }
  if (trip.destination && trip.destination.city) { const c = cityToIata(trip.destination.city); if (c) trip.destination.iata = c; }
  return trip;
}

// ── D6b: PHASE-B LIVE HOTELS — gate, request params, render (pure) ────────────
// The live-hotel tier is lib/tools/hotelSearch.js (SerpApi Google Hotels), the
// hotels analog of D6's live flights — same waterfall, same key, same shape of
// gate/params/render split so the PS-5.1 mirror can assert it without a network.

// hotelsEnabled: the live tier is DARK unless M8_TRAVEL_HOTELS is on (default on)
// AND a SERPAPI_KEY exists — so with no key the whole lane is byte-identical to Phase A.
function hotelsEnabled() {
  if (String(process.env.M8_TRAVEL_HOTELS || "").trim().toLowerCase() === "off") return false;
  return !!process.env.SERPAPI_KEY;
}

// planHotelSearch: build the SerpApi request params from a trip, or null when the live
// tier can't run for it (not a hotels need, no destination, or check-in/check-out isn't
// a concrete ISO pair — a flex-only "mid-August" falls through to web search). Unlike
// flights, google_hotels REQUIRES both dates, so a one-sided date is not enough. Only
// the DESTINATION TEXT + DATES + guest COUNTS ever leave the process (the privacy wall).
function planHotelSearch(trip) {
  if (!trip) return null;
  if (tripNeeds(trip).indexOf("hotels") === -1) return null;
  const dest = trip.destination && trip.destination.city;
  if (!dest) return null;
  const checkIn = trip.dates && validIsoDate(trip.dates.depart) ? trip.dates.depart : null;
  const checkOut = trip.dates && validIsoDate(trip.dates.return) ? trip.dates.return : null;
  if (!checkIn || !checkOut) return null;
  const dCountry = cityCountry(dest);
  const q = dCountry ? `${dest}, ${dCountry}` : dest;
  const adults = trip.party && Number.isFinite(trip.party.adults) && trip.party.adults > 0 ? trip.party.adults : 1;
  const children = trip.party && Number.isFinite(trip.party.children) && trip.party.children > 0 ? trip.party.children : 0;
  const params = { q, check_in_date: checkIn, check_out_date: checkOut, currency: "SAR", adults };
  if (children) params.children = children;
  return params;
}

// renderHotelsBlock: the HOTELS data block, placed ABOVE the BOOKING LINKS block —
// real listings the model must quote verbatim (the directive forbids inventing a
// price). Pure; returns "" for an empty / no-usable-offer list.
function renderHotelsBlock(offers) {
  if (!Array.isArray(offers) || !offers.length) return "";
  const rows = [];
  for (const o of offers.slice(0, 5)) {
    if (!o || typeof o !== "object" || !o.name) continue;
    const price = o.pricePerNight != null ? `${o.currency || "SAR"} ${o.pricePerNight}/night` : "price n/a";
    const rating = (o.rating != null) ? ` — ${o.rating}★${o.reviews != null ? ` (${o.reviews})` : ""}` : "";
    const cls = o.hotelClass ? ` — ${o.hotelClass}` : "";
    const link = o.link ? ` — ${o.link}` : "";
    rows.push(`- ${o.name}${cls}${rating} — ${price}${link}`);
  }
  if (!rows.length) return "";
  return `LIVE HOTELS (real current listings from Google Hotels via SerpApi — present these EXACT names/prices, best-value first, and the link shown on each row if present; do NOT invent or alter any figure or URL):\n${rows.join("\n")}`;
}

// ── D6c (Amendment B3): FLIGHT SELECTION → fetch-on-pick booking link (pure) ──
// A follow-up like "book the first one" / "get me a link for the cheapest" resolves
// against the FRESH offer list from THIS turn's flightSearch call — a booking_token
// from an earlier turn isn't persisted anywhere (extractTripState reconstructs the
// trip from TEXT each turn, and a token is an opaque non-text artifact), so there's
// nothing stale to redeem; the offers are simply refetched every travel turn anyway.
// The actual redemption call lives in tools/flightSearch.js's getBookingLink(); this
// module only decides WHETHER a booking-link ask was made and WHICH offer it means.

// wantsFlightBookingLink: a light, deterministic signal that the user is trying to
// book/select a SPECIFIC already-shown flight (not just re-asking for options).
// Scoped to an ALREADY travel-active turn (see orchestrator.js) — this is picking
// an index from a list already on screen, the same category of deterministic parse
// as the B-171 task-ordinal resolver, not a new top-level keyword intent lane.
const BOOKING_SIGNAL_RE = /\b(book|reserve|select|choose|pick|grab|take)\b[\s\S]*\b(it|this|that|one|flight|option|offer)\b|\b(link|url)\s+(for|to)\b|\bbook\s+(the\s+)?(first|second|third|1st|2nd|3rd|cheapest|last)\b|\bbook\s+(the\s+)?#?\d+\b/i;
function wantsFlightBookingLink(message) {
  return BOOKING_SIGNAL_RE.test(String(message || ""));
}

const _ORDINAL_WORDS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
function _normDigitsLoose(s) {
  return String(s == null ? "" : s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}
// _flightOrdinalIndex: 1-based index from an ordinal WORD or DIGIT anywhere in the
// message ("book the first one" / "book #2" / "the 3rd flight"), or null.
function _flightOrdinalIndex(msg) {
  const s = _normDigitsLoose(msg).toLowerCase();
  for (const w in _ORDINAL_WORDS) {
    if (new RegExp(`\\b${w}\\b`).test(s)) return _ORDINAL_WORDS[w];
  }
  const m = s.match(/\b#?([1-9])(?:st|nd|rd|th)?\b/);
  return m ? parseInt(m[1], 10) : null;
}

// resolveFlightSelection: message + the FRESH offers from THIS turn -> the ONE
// offer the user means, or null when it's ambiguous/unclear — never guesses; the
// caller then just shows the list again with no direct link, exactly like today.
function resolveFlightSelection(message, offers) {
  if (!Array.isArray(offers) || !offers.length) return null;
  const msg = String(message || "").toLowerCase();
  if (/\bcheapest\b|\blowest[\s-]price\b|\bbest[\s-]price\b/.test(msg)) {
    const priced = offers.filter((o) => o && Number.isFinite(o.price));
    if (!priced.length) return null;
    return priced.slice().sort((a, b) => a.price - b.price)[0];
  }
  const idx = _flightOrdinalIndex(msg);
  if (idx != null && idx >= 1 && idx <= offers.length) return offers[idx - 1];
  // carrier-name match — only when EXACTLY ONE shown offer's carrier name appears
  // in the message (two matches is ambiguous; the caller doesn't guess).
  const hits = offers.filter((o) => o && o.carrier && msg.indexOf(o.carrier.toLowerCase()) !== -1);
  if (hits.length === 1) return hits[0];
  return null;
}

// _durLabel: minutes -> "3h15m" | "2h" | "45m" | "" (mirrored in PS).
function _durLabel(min) {
  if (!Number.isFinite(min) || min <= 0) return "";
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}h${String(m).padStart(2, "0")}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// renderFlightsBlock: the FLIGHTS data block, placed ABOVE the BOOKING LINKS block —
// real offers the model must quote verbatim (the directive forbids inventing a fare).
// Pure; returns "" for an empty / no-usable-offer list. Times are the offer's naive local ISO.
function renderFlightsBlock(offers) {
  if (!Array.isArray(offers) || !offers.length) return "";
  const rows = [];
  for (const o of offers.slice(0, 5)) {
    if (!o || typeof o !== "object") continue;
    const price = o.price != null ? `${o.currency || "SAR"} ${o.price}` : "price n/a";
    const carrier = o.carrier || "airline n/a";
    const fn = o.flightNumber ? ` ${o.flightNumber}` : "";
    const dep = o.departISO ? o.departISO.replace("T", " ") : "?";
    const arr = o.arriveISO ? o.arriveISO.replace("T", " ") : "?";
    const dur = _durLabel(o.durationMin);
    let stops;
    if (o.stops == null) stops = "";
    else if (o.stops === 0) stops = "nonstop";
    else stops = `${o.stops} stop${o.stops > 1 ? "s" : ""}`;
    const tail = [dur ? `(${dur})` : "", stops].filter(Boolean).join(" ");
    rows.push(`- ${carrier}${fn} — ${price} — depart ${dep} → arrive ${arr}${tail ? " — " + tail : ""}`);
  }
  if (!rows.length) return "";
  return `LIVE FLIGHTS (real current offers from Google Flights via SerpApi — present these EXACT prices/times/airlines, cheapest first; do NOT invent or alter any figure):\n${rows.join("\n")}`;
}

// renderDirectBookingLinkBlock (Amendment B3): the ONE redeemed link for a flight
// the user just picked in this turn (see resolveFlightSelection). Pure; "" when
// absent — the packet then falls back to the generic BOOKING LINKS block only,
// exactly like before this feature existed.
function renderDirectBookingLinkBlock(link) {
  if (!link || typeof link !== "object" || !link.url) return "";
  const who = link.bookWith ? ` (via ${link.bookWith})` : "";
  return `DIRECT BOOKING LINK (composed in code from a real SerpApi redemption — present this EXACT URL for the flight he selected; do NOT invent or alter it):\n- ${link.url}${who}`;
}

// Composes the ONE disambiguating question for a multi-candidate destination turn
// ("hurghada or sharm" -> "Hurghada or Sharm El Sheikh — which one?"). Pure, deterministic.
function destinationChoiceClarify(candidates, ar) {
  const names = candidates.map((c) => c.city);
  const list = names.length <= 1
    ? (names[0] || "")
    : (ar
        ? `${names.slice(0, -1).join("، ")} أو ${names[names.length - 1]}`
        : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`);
  return ar ? `${list} — أيهما تقصد؟` : `${list} — which one did you mean?`;
}

// ── CLARIFY-ONCE (pure) — origin confirm + the ONE blocking slot ──────────────
// The travel packet OWNS clarification when active (the regex checkSpecificity gate is
// bypassed for that turn — two clarifiers must never both fire). Only the FLIGHTS
// primary need blocks on a missing date (a hotel/itinerary/link answer works without
// one). Returns a deterministic string (a COMPOSED guarantee, not a prompt-hope) so
// canary 1 — "confirm origin + ask ONE question" — is acceptance-tested, or null.
function travelClarify(trip, ar) {
  if (!trip) return null;
  // Ambiguous destination ("hurghada or sharm") — resolve THIS before anything else;
  // there is no origin/dates to clarify until he picks one (the B-187 known gap fix).
  if (!trip.destination && Array.isArray(trip.destinationCandidates) && trip.destinationCandidates.length >= 2) {
    return destinationChoiceClarify(trip.destinationCandidates, ar);
  }
  // B-191 (FIX 4): the user stated a whole COUNTRY as the departure ("from Egypt").
  // Ask which city BEFORE anything else — we can't pick a departure airport from a
  // country and must not silently default to the home city. (A stated CITY, an inferred
  // home city, or a country that already maps to one airport never reaches here.)
  const _countryAsk = originCountryAsk(trip, ar);
  if (_countryAsk) return _countryAsk;
  if (!trip.destination || !trip.destination.city) return null;
  const needs = tripNeeds(trip);
  const primary = needs[0];
  if (primary === "flights" && !hasDates(trip)) {
    const clause = originConfirmClause(trip, ar);
    const q = ar ? "في أي تاريخ تريد السفر؟" : "what dates are you thinking?";
    if (clause) return `${clause} ${q}`;
    return ar ? "تمام — في أي تاريخ تريد السفر؟" : `Sure — ${q}`;
  }
  return null;
}

// ── D3+D4+D8: THE TRAVEL DIRECTIVE (pure) ─────────────────────────────────────
// Supersedes SEARCH_DIRECTIVES.LIVE_DATA for a travel turn: keeps the live-data honesty
// discipline, upgrades the origin rule to the D3 composed confirm, adds the D4 links-only
// rule and the D8 payment boundary. Placed LAST in the packet block so it takes priority.
function buildTravelDirective(trip, opts) {
  const o = opts || {};
  const ar = !!o.ar;
  const inferred = originInferred(trip);
  const origin = (trip && trip.origin && trip.origin.city) || homeCity();
  const lines = [];
  lines.push("TRAVEL RULES — follow strictly (these take priority for this trip-planning turn):");
  if (inferred) {
    lines.push(`1. OPEN by confirming the inferred origin OUT LOUD and inviting correction — e.g. "Assuming you're flying from ${origin} — tell me if that's wrong." Never assume the origin silently.`);
  } else {
    lines.push(`1. The departure city (${origin}) was stated by the user — use it; do not re-ask it.`);
  }
  lines.push("2. Name BOTH the origin and destination (and airport codes when given) so he can sanity-check them.");
  lines.push("3. Live data honesty: state ONLY what the search results below contain. Never invent a fare, flight time, hotel price, rating, or availability. If the exact price/time isn't in the results, say so plainly and give the closest real information — never a made-up number, and never a different date than he asked for. When a LIVE FLIGHTS block appears below, those rows ARE the real current offers (Google Flights) — quote them exactly (airline, flight number, times, price in SAR) and lead with the cheapest; still never add a fare or time that isn't shown. When a LIVE HOTELS block appears below, those rows ARE the real current listings (Google Hotels) — quote them exactly (name, price/night in SAR, rating) and lead with the best value; if NEITHER block is present for a live-priced need, say plainly you don't have live prices for it right now instead of stating a remembered/typical figure as if it were current.");
  lines.push("4. Evergreen planning (itineraries, attractions, destination ideas) may come from your own knowledge — that's allowed; only LIVE prices/availability must come from the search results.");
  lines.push("5. LINKS: present booking links ONLY from the BOOKING LINKS block above, a per-row link shown inside a LIVE HOTELS row, or a DIRECT BOOKING LINK block. NEVER write, construct, shorten, or invent a URL yourself — if a link isn't shown in one of those places, don't offer one. When a DIRECT BOOKING LINK block is present, that is the real link for the SPECIFIC flight he just picked — lead with it plainly (e.g. \"Here's the direct link: …\"); when it's absent but he asked to book/select a flight, tell him plainly which flight you'd need him to confirm (e.g. by number or airline) and give the generic Google Flights/Skyscanner link meanwhile.");
  lines.push("6. PAYMENT BOUNDARY (absolute): you FIND, PLAN and hand over LINKS. You NEVER book or pay. If he says \"book it\" or \"just book it for me\", give the relevant booking link and tell him plainly to confirm and pay on the airline/hotel site himself — you cannot and will not complete a booking or payment.");
  return lines.join("\n");
}

// ── THE TRAVEL PACKET (pure) — the one composed block injected into the prompt ─
// TRIP CONTEXT line (deterministic; may name the destination — it's the LLM's answer
// context, NOT telemetry) + BOOKING LINKS block + the travel directive. Returns
// { block, linkCount }.
function buildTravelPacket(trip, opts) {
  const o = opts || {};
  const links = Array.isArray(o.links) ? o.links : buildBookingLinks(trip);
  const dest = (trip && trip.destination && trip.destination.city) || "the destination";
  const origin = (trip && trip.origin && trip.origin.city) || homeCity();
  const parts = [];

  // TRIP CONTEXT (deterministic summary the model narrates from).
  const ctx = [`origin = ${origin}${trip.origin && trip.origin.iata ? " (" + trip.origin.iata + ")" : ""}${originInferred(trip) ? " [inferred — CONFIRM out loud]" : " [stated]"}`,
               `destination = ${dest}${trip.destination && trip.destination.iata ? " (" + trip.destination.iata + ")" : ""}`];
  const dh = dateHint(trip);
  if (dh) ctx.push(`dates = ${dh}`);
  if (trip.party && (trip.party.adults || trip.party.children)) {
    const p = [];
    if (trip.party.adults) p.push(`${trip.party.adults} adult${trip.party.adults > 1 ? "s" : ""}`);
    if (trip.party.children) p.push(`${trip.party.children} child${trip.party.children > 1 ? "ren" : ""}`);
    ctx.push(`party = ${p.join(" + ")}`);
  }
  ctx.push(`needs = ${tripNeeds(trip).join(", ")}`);
  parts.push(`TRIP CONTEXT (reconstructed from the conversation):\n${ctx.join("; ")}.`);

  // LIVE FLIGHTS (Phase B) — real offers rendered ABOVE the links, when the tier-0
  // flight search returned any (offers passed in by the orchestrator). Absent/empty
  // => nothing is added and the packet is byte-identical to Phase A.
  const offers = Array.isArray(o.offers) ? o.offers : null;
  const flightsBlock = offers ? renderFlightsBlock(offers) : "";
  if (flightsBlock) parts.push(flightsBlock);

  // LIVE HOTELS (hotels extension of Phase B) — real listings rendered ABOVE the
  // links, when the tier-0 hotel search returned any (offers passed in by the
  // orchestrator). Absent/empty => nothing is added, byte-identical to before.
  const hotelOffers = Array.isArray(o.hotelOffers) ? o.hotelOffers : null;
  const hotelsBlock = hotelOffers ? renderHotelsBlock(hotelOffers) : "";
  if (hotelsBlock) parts.push(hotelsBlock);

  // DIRECT BOOKING LINK (Amendment B3) — the ONE redeemed link when the user just
  // picked a specific flight this turn. Placed right after the data blocks, above
  // the generic links, so the model leads with it. Absent => nothing added.
  const directBookingBlock = renderDirectBookingLinkBlock(o.directBookingLink);
  if (directBookingBlock) parts.push(directBookingBlock);

  if (links.length) {
    const block = links.map((l) => `- ${l.label}: ${l.url}`).join("\n");
    parts.push(`BOOKING LINKS (composed in code — present these; do NOT invent or alter any URL):\n${block}`);
  }
  parts.push(buildTravelDirective(trip, { ar: !!o.ar }));
  return {
    block: parts.join("\n\n"),
    linkCount: links.length,
    flightCount: flightsBlock ? offers.length : 0,
    hotelCount: hotelsBlock ? hotelOffers.length : 0,
  };
}

// ── D2: THE LLM TRIP-STATE EXTRACTOR (the ONE LLM call; fail-safe null) ────────
function parseJsonLoose(text) {
  if (!text || typeof text !== "string") return null;
  const s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a === -1 || b === -1 || b < a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { return null; }
}

// Coerce/validate the model's JSON into a safe trip shape. Drops anything malformed;
// returns null when there is no usable destination (=> the packet is skipped).
function normalizeTrip(raw) {
  if (!raw || typeof raw !== "object") return null;
  const trip = { origin: null, destination: null, destinationCandidates: null, dates: null, party: null, needs: [], missing: [] };

  const city = (v) => (v && typeof v === "object" && typeof v.city === "string" && v.city.trim()) ? v.city.trim() : null;
  const iata = (v) => (v && typeof v === "object" && validIata(v.iata)) ? v.iata : null;

  const dCity = city(raw.destination);
  if (dCity) {
    trip.destination = { city: dCity, iata: iata(raw.destination) };
  } else if (Array.isArray(raw.destinationCandidates)) {
    // ambiguous turn ("hurghada or sharm") — destination stays null; keep the named
    // candidates (deduped, capped) so the orchestrator can ask ONE disambiguating
    // question instead of silently skipping the whole travel packet (the B-187 gap).
    const seen = new Set();
    const cands = [];
    for (const c of raw.destinationCandidates) {
      const cCity = city(c);
      if (!cCity || seen.has(cCity.toLowerCase())) continue;
      seen.add(cCity.toLowerCase());
      cands.push({ city: cCity, iata: iata(c) });
      if (cands.length >= 4) break;
    }
    if (cands.length >= 2) trip.destinationCandidates = cands;
  }
  if (!trip.destination && !trip.destinationCandidates) return null; // no destination reconstructable

  const oCity = city(raw.origin);
  if (oCity) {
    const src = raw.origin && (raw.origin.source === "stated" || raw.origin.source === "confirmed") ? raw.origin.source : "stated";
    trip.origin = { city: oCity, iata: iata(raw.origin), source: src };
  }

  if (raw.dates && typeof raw.dates === "object") {
    const depart = validIsoDate(raw.dates.depart) ? raw.dates.depart : null;
    const ret = validIsoDate(raw.dates.return) ? raw.dates.return : null;
    const flex = typeof raw.dates.flex === "string" && raw.dates.flex.trim() ? raw.dates.flex.trim().slice(0, 40) : null;
    if (depart || ret || flex) trip.dates = { depart, return: ret, flex };
  }

  if (raw.party && typeof raw.party === "object") {
    const adults = Number.isFinite(raw.party.adults) ? Math.max(0, Math.min(20, Math.trunc(raw.party.adults))) : null;
    const children = Number.isFinite(raw.party.children) ? Math.max(0, Math.min(20, Math.trunc(raw.party.children))) : null;
    if (adults !== null || children !== null) trip.party = { adults: adults || 0, children: children || 0 };
  }

  if (Array.isArray(raw.needs)) {
    const seen = new Set();
    for (const n of raw.needs) {
      if (typeof n === "string" && NEED_SET.indexOf(n) !== -1 && !seen.has(n)) { seen.add(n); trip.needs.push(n); }
    }
  }
  if (Array.isArray(raw.missing)) {
    trip.missing = raw.missing.filter((m) => typeof m === "string").slice(0, 5);
  }
  return trip;
}

function _extractSystem(today, home) {
  return (
`You extract a structured TRIP from a conversation. Muhammad is based in ${home}, Saudi Arabia. Today is ${today}.
Read the WHOLE recent conversation (not just the last line) and RECONSTRUCT the trip being discussed — carry the destination, dates, and party across turns. Output ONLY JSON, nothing else:
{"destination":{"city":"<city>","iata":"<3-letter IATA or null>"}|null,
 "destinationCandidates":[{"city":"<city>","iata":"<IATA or null>"}]|null,
 "origin":{"city":"<city>","iata":"<IATA or null>","source":"stated"|"confirmed"}|null,
 "dates":{"depart":"YYYY-MM-DD"|null,"return":"YYYY-MM-DD"|null,"flex":"<short phrase like 'mid-August' or null>"}|null,
 "party":{"adults":<int>,"children":<int>}|null,
 "needs":[<any of: "flights","hotels","food","attractions","itinerary","ideas">],
 "missing":[<slots still needed for the primary need, e.g. "dates">]}
RULES:
- destination: the place he wants to GO. null if the conversation names no destination, OR if he named two or more candidate destinations and has not picked one yet.
- destinationCandidates: ONLY when destination is null because he named 2+ places he is deciding between (e.g. "hurghada or sharm", "thinking either Bali or Phuket") — list each named place as {city, iata}. null otherwise. Never invent a candidate that was not named.
- origin: ONLY set this if the user EXPLICITLY stated or confirmed a departure city in the conversation (e.g. "from Jeddah", "no, from Dammam"). If he only said where he's going, leave origin null — the system will infer his home city and confirm it. If he CORRECTED a previously-inferred origin, set source:"confirmed". If he named only a COUNTRY as the departure ("from Egypt", "flying from the UAE") and NOT a city, set origin.city to that COUNTRY verbatim — do NOT resolve it to a capital or guess a city; the system will ask him which city.
- dates: resolve relative/approximate dates to concrete ISO using today's date (e.g. "mid-August" -> the 15th of next August; "next weekend" -> that Sat/Sun). Also keep the human phrase in "flex". If no date at all, dates=null.
- party: "with my wife and the kids" -> {"adults":2,"children":2} (best estimate); "just me" -> {"adults":1,"children":0}. null if unstated.
- needs: infer from the ask — travelling/flying -> "flights"; a place to stay -> "hotels"; where/what to eat -> "food"; things to see -> "attractions"; "plan N days" -> "itinerary"; "where should we go" -> "ideas". Multiple allowed. If he clearly wants to travel but named no specific need, use ["flights"].
- If the latest message is a bare follow-up ("book it for me", "find a hotel there", "mid-August"), resolve it AGAINST the trip already in the conversation.
- Never invent a destination that wasn't mentioned.`
  );
}

/**
 * Extract the trip state from the conversation. The ONE LLM call in this lane.
 * @param {{message:string, history?:Array, homeCity?:string}} args
 * @returns {Promise<object|null>} normalized trip, or null on any failure / no destination.
 */
async function extractTripState({ message, history, homeCity: home }) {
  try {
    if (!message || typeof message !== "string") return null;
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Riyadh", year: "numeric", month: "long", day: "numeric",
    });
    const system = _extractSystem(today, (home && String(home).trim()) || homeCity());
    const recent = (history || [])
      .slice(-6)
      .filter((m) => m && typeof m.content === "string")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    recent.push({ role: "user", parts: [{ text: message }] });

    const out = await generate({
      systemInstruction: system,
      contents: recent,
      providerOrder: TRAVEL_PROVIDER_ORDER,
      genConfig: { temperature: 0, maxOutputTokens: 350 },
    });
    const trip = normalizeTrip(parseJsonLoose(out));
    // B-191 FIX 4b: if the user's message explicitly states a COUNTRY as the departure,
    // re-assert it as the origin — CODE-GUARANTEED, so the extractor can't silently swap
    // it for a capital. The lane then asks which city (originCountryAsk) instead of
    // assuming one. A stated CITY isn't a country key, so this is a no-op for it.
    if (trip) {
      const _country = detectStatedCountryOrigin(message);
      if (_country) trip.origin = { city: _country, iata: null, source: "stated" };
    }
    return trip;
  } catch (_) {
    return null; // fail-safe: the whole travel packet is skipped -> today's path
  }
}

module.exports = {
  // env levers
  homeCity, travelSearchCap,
  // shape/city helpers (exported for the PS mirror + tests)
  validIata, validIsoDate, cityToIata, CITY_IATA, cityCountry, CITY_COUNTRY, yymmdd, monthName, dateHint, hasDates, tripNeeds,
  // D3 origin
  resolveOrigin, originInferred, originConfirmClause, profileHomeCity,
  // B-191 FIX 4: country-level origin
  countryName, isCountryOrigin, originCountryAsk, COUNTRY_NAMES, detectStatedCountryOrigin,
  // D4 links
  buildBookingLinks,
  // D5 plan
  travelSearchPlan,
  // D6 flights (Phase B — pure gate/params/render; the network call lives in tools/flightSearch.js)
  flightsEnabled, planFlightSearch, renderFlightsBlock, canonicalizeTripIata,
  // D6b hotels (Phase B — pure gate/params/render; the network call lives in tools/hotelSearch.js)
  hotelsEnabled, planHotelSearch, renderHotelsBlock,
  // D6c (Amendment B3) flight selection + direct booking link (pure; redemption lives in tools/flightSearch.js)
  wantsFlightBookingLink, resolveFlightSelection, renderDirectBookingLinkBlock,
  // clarify-once
  travelClarify, destinationChoiceClarify,
  // directive + packet
  buildTravelDirective, buildTravelPacket,
  // D2 extractor (+ its pure helpers for tests)
  extractTripState, normalizeTrip, parseJsonLoose,
};
