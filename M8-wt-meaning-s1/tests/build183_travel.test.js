/**
 * Build-183 — Travel lane PHASE A (travel-core)  (tests/build183_travel.test.js)
 *
 * Run: node tests/build183_travel.test.js
 *
 * Covers the PURE surface (the LLM extractor is exercised offline only via
 * normalizeTrip on canned JSON — no network): the registry travel row + kill-switch,
 * origin resolution (D3), the booking-link composer (D4), the search plan (D5), the
 * clarify-once path, the travel directive + packet, and the ★ D8 payment boundary.
 * The PS-5.1 mirror (build183_travel.test.ps1) asserts the same pure logic on this host.
 */
"use strict";
const assert = require("assert");
const reg = require("../lib/capability-registry");
const T = require("../lib/travel");

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) { pass++; } else { fails.push(label); console.log("  FAIL  " + label); } }

console.log("\nBuild-183 Travel lane — unit tests");
console.log("=".repeat(72));

// ── REGISTRY: travel domain + routing + kill-switch ───────────────────────────
ok("DOMAINS contains travel between memory and web",
  reg.DOMAINS.indexOf("travel") === reg.DOMAINS.indexOf("memory") + 1 &&
  reg.DOMAINS.indexOf("travel") === reg.DOMAINS.indexOf("web") - 1);
ok("REGISTRY.travel actions = search,read",
  JSON.stringify(reg.REGISTRY.travel.actions) === JSON.stringify(["search", "read"]));

for (const [msg, dom] of [
  ["I'm travelling to Alexandria", "travel"],
  ["find me the cheapest flights to Cairo", "travel"],
  ["book me a hotel in Jeddah", "travel"],
  ["plan a 3 day itinerary for Dubai", "travel"],
  ["عايز أسافر إسكندرية الشهر الجاي", "travel"],
]) {
  ok(`resolveIntent("${msg}") → travel (got ${reg.resolveIntent(msg, {}).domain})`, reg.resolveIntent(msg, {}).domain === dom);
}
// Collisions — money/notes/fleet keep priority
ok("collision: 'how much did I spend on my trip to Cairo' → wallet",
  reg.resolveIntent("how much did I spend on my trip to Cairo?", {}).domain === "wallet");
ok("collision: 'search my notes for the Alexandria trip' → notes",
  reg.resolveIntent("search my notes for the Alexandria trip", {}).domain === "notes");
ok("collision: 'how are my drivers doing today' → fleet",
  reg.resolveIntent("how are my drivers doing today", {}).domain === "fleet");

// Kill-switch: flag off ⇒ travel scores 0 (byte-identical routing proven separately)
{
  const prev = process.env.M8_TRAVEL_LANE;
  process.env.M8_TRAVEL_LANE = "off";
  ok("kill-switch: travel score 0 when off", (reg.scoreMessage("I'm travelling to Alexandria").travel || 0) === 0);
  ok("kill-switch: travel phrasing → NOT travel when off", reg.resolveIntent("I'm travelling to Alexandria", {}).domain !== "travel");
  if (prev === undefined) delete process.env.M8_TRAVEL_LANE; else process.env.M8_TRAVEL_LANE = prev;
}
ok("travelLaneEnabled() default ON", T === T && reg.travelLaneEnabled() === true);

// ── SHAPE / CITY HELPERS ──────────────────────────────────────────────────────
ok("validIata RUH", T.validIata("RUH") && !T.validIata("RU") && !T.validIata("ruh"));
ok("validIsoDate", T.validIsoDate("2026-08-14") && !T.validIsoDate("2026-8-1") && !T.validIsoDate("Aug 14"));
ok("cityToIata Riyadh→RUH, Alexandria→HBE, Cairo→CAI", T.cityToIata("Riyadh") === "RUH" && T.cityToIata("Alexandria") === "HBE" && T.cityToIata("cairo") === "CAI");
ok("cityToIata strips country: 'Alexandria, Egypt'→HBE", T.cityToIata("Alexandria, Egypt") === "HBE");
ok("cityToIata unknown → null", T.cityToIata("Atlantis") === null);
ok("yymmdd", T.yymmdd("2026-08-14") === "260814");
ok("monthName", T.monthName("2026-08-14") === "Aug");

// ── D3: ORIGIN RESOLUTION + CONFIRM ───────────────────────────────────────────
{
  const stated = T.resolveOrigin({ origin: { city: "Jeddah", iata: "JED", source: "stated" } }, { homeCity: "Riyadh" });
  ok("resolveOrigin trusts a stated origin", stated.city === "Jeddah" && stated.source === "stated");
  ok("originInferred false for stated", T.originInferred({ origin: stated }) === false);
  ok("originConfirmClause empty for stated", T.originConfirmClause({ origin: stated }, false) === "");

  const inferredEnv = T.resolveOrigin({ origin: null }, { homeCity: "Riyadh" });
  ok("resolveOrigin falls back to env (Riyadh) with source=env", inferredEnv.city === "Riyadh" && inferredEnv.source === "env" && inferredEnv.iata === "RUH");
  ok("originInferred true for env", T.originInferred({ origin: inferredEnv }) === true);
  ok("originConfirmClause EN names the city + invites correction",
    /Assuming you're flying from Riyadh/.test(T.originConfirmClause({ origin: inferredEnv }, false)) &&
    /tell me if not/.test(T.originConfirmClause({ origin: inferredEnv }, false)));
  ok("originConfirmClause AR present + names the city", /من Riyadh/.test(T.originConfirmClause({ origin: inferredEnv }, true)) && T.originConfirmClause({ origin: inferredEnv }, true).length > 10);

  const inferredProfile = T.resolveOrigin({ origin: null }, { homeCity: "Riyadh", profileCity: "Dammam" });
  ok("resolveOrigin prefers a profile city over env", inferredProfile.city === "Dammam" && inferredProfile.source === "profile" && inferredProfile.iata === "DMM");

  const confirmed = T.resolveOrigin({ origin: { city: "Jeddah", source: "confirmed" } }, { homeCity: "Riyadh" });
  ok("resolveOrigin trusts a confirmed origin (not re-inferred)", confirmed.city === "Jeddah" && confirmed.source === "confirmed");
}
ok("profileHomeCity finds 'based in X'", T.profileHomeCity([{ content: "Muhammad is based in Dammam these days" }]) === "Dammam");
ok("profileHomeCity null when absent", T.profileHomeCity([{ content: "Sara is your wife" }]) === null);

// ── D4: BOOKING LINK COMPOSER (the LLM never writes URLs) ─────────────────────
{
  const trip = {
    origin: { city: "Riyadh", iata: "RUH", source: "env" },
    destination: { city: "Alexandria", iata: "HBE" },
    dates: { depart: "2026-08-14", return: "2026-08-21", flex: "mid-August" },
    party: { adults: 2, children: 2 },
    needs: ["flights", "hotels"],
  };
  const links = T.buildBookingLinks(trip);
  const byLabel = {}; links.forEach((l) => { byLabel[l.label] = l.url; });
  ok("Google Flights link present + shape", /^https:\/\/www\.google\.com\/travel\/flights\?q=/.test(byLabel["Google Flights"] || ""));
  ok("Google Flights q has origin+dest", /Riyadh/.test(byLabel["Google Flights"]) && /Alexandria/.test(byLabel["Google Flights"]));
  ok("Skyscanner link uses IATA + yymmdd", (byLabel["Skyscanner"] || "").indexOf("/ruh/hbe/260814/260821/") !== -1);
  ok("Skyscanner carries adults/children", /adults=2/.test(byLabel["Skyscanner"] || "") && /children=2/.test(byLabel["Skyscanner"] || ""));
  ok("Booking.com link present + dates + party", /booking\.com\/searchresults/.test(byLabel["Booking.com"] || "") && /ss=Alexandria/.test(byLabel["Booking.com"]) && /checkin=2026-08-14/.test(byLabel["Booking.com"]) && /group_adults=2/.test(byLabel["Booking.com"]));

  // Missing destination → no links at all
  ok("no destination → zero links", T.buildBookingLinks({ origin: { city: "Riyadh" }, destination: null }).length === 0);

  // Invalid IATA in the trip is rejected (never a guessed segment); a bad ISO date omits Skyscanner
  const noDate = T.buildBookingLinks({ origin: { city: "Riyadh", iata: "RUH", source: "env" }, destination: { city: "Cairo", iata: "CAI" }, dates: null, needs: ["flights"] });
  ok("no depart date → Skyscanner omitted, Google Flights still present", !noDate.some((l) => l.label === "Skyscanner") && noDate.some((l) => l.label === "Google Flights"));

  // Hotels-only need → Booking present, no flight links
  const hotelOnly = T.buildBookingLinks({ origin: { city: "Riyadh" }, destination: { city: "Cairo", iata: "CAI" }, needs: ["hotels"] });
  ok("hotels-only → Booking present, no Google Flights", hotelOnly.some((l) => l.label === "Booking.com") && !hotelOnly.some((l) => l.label === "Google Flights"));

  // Food/itinerary need → a Maps link
  const foodTrip = T.buildBookingLinks({ origin: { city: "Riyadh" }, destination: { city: "Cairo" }, needs: ["itinerary", "attractions"] });
  ok("itinerary/attractions → Google Maps link", foodTrip.some((l) => /google\.com\/maps\/search/.test(l.url)));

  // ★ D8: every composed URL is a read-only SEARCH/BROWSE surface — structurally there
  // is no booking-CREATE / payment endpoint (those live at different paths we never emit:
  // /flight-orders, /reservation, /payment, a checkout POST). Allowlist > denylist.
  const SAFE_URL = /^https:\/\/(www\.google\.com\/travel\/flights\?|www\.skyscanner\.net\/transport\/flights\/|www\.booking\.com\/searchresults\.html\?|www\.google\.com\/maps\/search\/)/;
  const allTripsUrls = links.concat(noDate, hotelOnly, foodTrip).map((l) => l.url);
  ok("D8: every composed URL is a read-only search/browse surface (no booking/payment endpoint)",
    allTripsUrls.length > 0 && allTripsUrls.every((u) => SAFE_URL.test(u)));
}

// ── D5: SEARCH PLAN ───────────────────────────────────────────────────────────
{
  const trip = { origin: { city: "Riyadh" }, destination: { city: "Alexandria" }, dates: { depart: "2026-08-14" }, needs: ["flights", "hotels", "food"] };
  const plan2 = T.travelSearchPlan(trip, 2);
  ok("search plan respects the cap (2)", plan2.queries.length === 2);
  ok("flights query is code-composed with origin+dest", /flights from Riyadh to Alexandria/i.test(plan2.queries[0]));
  ok("cityCountry Alexandria→Egypt, Dubai→UAE, unknown→null", T.cityCountry("Alexandria") === "Egypt" && T.cityCountry("Dubai") === "UAE" && T.cityCountry("Atlantis") === null);
  ok("search query disambiguates the destination with country", /Alexandria, Egypt/.test(plan2.queries[0]));
  const knowledgeOnly = T.travelSearchPlan({ origin: { city: "Riyadh" }, destination: { city: "Alexandria" }, needs: ["itinerary", "attractions"] }, 2);
  ok("itinerary/attractions → no search queries (knowledge)", knowledgeOnly.queries.length === 0);
}

// ── CLARIFY-ONCE (origin confirm + one blocking slot) ─────────────────────────
{
  const noDates = { origin: T.resolveOrigin({ origin: null }, { homeCity: "Riyadh" }), destination: { city: "Alexandria" }, dates: null, needs: ["flights"] };
  const clar = T.travelClarify(noDates, false);
  ok("clarify: flights + no dates → origin confirm + ONE question", /Assuming you're flying from Riyadh/.test(clar) && /dates/.test(clar));
  ok("clarify asks exactly one question (single '?')", (clar.match(/\?/g) || []).length === 1);

  const withDates = { origin: T.resolveOrigin({ origin: null }, { homeCity: "Riyadh" }), destination: { city: "Alexandria" }, dates: { depart: "2026-08-14" }, needs: ["flights"] };
  ok("clarify: dates present → null (proceed to packet)", T.travelClarify(withDates, false) === null);

  const hotelNeed = { origin: T.resolveOrigin({ origin: null }, { homeCity: "Riyadh" }), destination: { city: "Alexandria" }, dates: null, needs: ["hotels"] };
  ok("clarify: hotels need + no dates → null (link works without dates)", T.travelClarify(hotelNeed, false) === null);

  // stated origin → no confirm clause in the clarify
  const statedNoDates = { origin: { city: "Jeddah", source: "stated" }, destination: { city: "Alexandria" }, dates: null, needs: ["flights"] };
  ok("clarify with stated origin does NOT re-confirm origin", !/Assuming you're flying/.test(T.travelClarify(statedNoDates, false)));
}

// ── DIRECTIVE + PACKET (D3 + D4 + D8) ─────────────────────────────────────────
{
  const trip = {
    origin: { city: "Riyadh", iata: "RUH", source: "env" },
    destination: { city: "Alexandria", iata: "HBE" },
    dates: { depart: "2026-08-14", flex: "mid-August" },
    party: { adults: 2, children: 2 },
    needs: ["flights", "hotels"],
  };
  const dir = T.buildTravelDirective(trip, { ar: false });
  ok("directive D3: confirm inferred origin out loud", /Assuming you're flying from Riyadh/.test(dir) && /Never assume the origin silently/.test(dir));
  ok("directive D4: links ONLY from the block, never invent a URL", /ONLY from the BOOKING LINKS block/.test(dir) && /NEVER write, construct/i.test(dir));
  ok("directive D8: NEVER book or pay + confirm and pay yourself", /NEVER book or pay/i.test(dir) && /confirm and pay/i.test(dir));
  ok("directive keeps live-data honesty (never invent a fare/time)", /Never invent a fare/i.test(dir));

  // stated origin → directive does NOT ask to confirm origin
  const statedDir = T.buildTravelDirective({ origin: { city: "Jeddah", source: "stated" }, destination: { city: "Cairo" }, needs: ["flights"] }, {});
  ok("directive with stated origin: no re-confirm, still enforces the boundary", !/Assuming you're flying/.test(statedDir) && /NEVER book or pay/i.test(statedDir));

  const packet = T.buildTravelPacket(trip, { ar: false });
  ok("packet block has TRIP CONTEXT", /TRIP CONTEXT/.test(packet.block));
  ok("packet block has a BOOKING LINKS section", /BOOKING LINKS \(composed in code/.test(packet.block));
  ok("packet block ends with the directive (boundary present)", /NEVER book or pay/i.test(packet.block));
  ok("packet linkCount matches the links", packet.linkCount === T.buildBookingLinks(trip).length && packet.linkCount >= 2);
}

// ── EXTRACTOR NORMALIZER (offline; no network) ────────────────────────────────
ok("parseJsonLoose strips fences", JSON.stringify(T.parseJsonLoose('```json\n{"a":1}\n```')) === JSON.stringify({ a: 1 }));
ok("normalizeTrip: no destination → null", T.normalizeTrip({ destination: null, needs: ["flights"] }) === null);
{
  const nt = T.normalizeTrip({
    destination: { city: "Alexandria", iata: "hbe" }, // lowercase iata is invalid → dropped
    origin: { city: "Jeddah", iata: "JED", source: "stated" },
    dates: { depart: "2026-08-14", return: "bad", flex: "mid-August" },
    party: { adults: 2, children: 99 }, // clamped to 20
    needs: ["flights", "hotels", "bogus"], // bogus dropped
    missing: ["dates"],
  });
  ok("normalizeTrip keeps a valid destination, drops invalid iata", nt.destination.city === "Alexandria" && nt.destination.iata === null);
  ok("normalizeTrip keeps a stated origin", nt.origin.city === "Jeddah" && nt.origin.source === "stated");
  ok("normalizeTrip validates dates (bad return dropped, flex kept)", nt.dates.depart === "2026-08-14" && nt.dates.return === null && nt.dates.flex === "mid-August");
  ok("normalizeTrip clamps party children to ≤20", nt.party.adults === 2 && nt.party.children === 20);
  ok("normalizeTrip drops unknown needs", nt.needs.indexOf("bogus") === -1 && nt.needs.indexOf("flights") !== -1);
}
ok("normalizeTrip: garbage → null", T.normalizeTrip("nope") === null && T.normalizeTrip(null) === null);

// ── report ────────────────────────────────────────────────────────────────────
console.log("=".repeat(72));
const total = pass + fails.length;
console.log(`\nResults: ${pass}/${total} passed, ${fails.length} failed\n`);
if (fails.length) { fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
else console.log("All Build-183 travel unit tests passed.\n");
