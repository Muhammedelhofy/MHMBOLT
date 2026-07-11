/**
 * Build-183 — Probe B: trip-state extractor REPLAY  (tests/build183_travel_replay.js)
 *
 * Run (with free-stack keys set locally): node tests/build183_travel_replay.js
 *
 * Replays ~10 scripted conversations through the LIVE extractTripState() (the ONE LLM
 * call in the travel lane) and prints, per turn: the message → the reconstructed trip →
 * the resolved origin → the clarify-or-packet decision → the composed BOOKING LINKS.
 * This is the [Muhammad checkpoint C1] table — he eyeballs the inferences before ship.
 *
 * KEYS: the extractor uses the free-stack (GROQ/GEMINI via ROUTER_PROVIDER_ORDER). With
 * NO key set it degrades to null and prints "(no key — extraction skipped)"; the live
 * extraction quality is then verified at prod self-verify (canaries 1-7). Never echoes a
 * key. Writes nothing to any DB. Telemetry-safe (this is a local probe, not prod).
 */
"use strict";
const T = require("../lib/travel");

// Scripted conversations. Each is an array of {role, content}; the LAST user turn is
// the one extracted, with the earlier turns as history (the stateless-reconstruction test).
const CONVOS = [
  { id: "1 · bare destination (EN)", history: [], msg: "I'm travelling to Alexandria" },
  { id: "2 · dates + party follow-up", history: [
      { role: "user", content: "I'm travelling to Alexandria" },
      { role: "assistant", content: "Assuming you're flying from Riyadh (tell me if not) — what dates are you thinking?" },
    ], msg: "mid-August, with my wife and the kids" },
  { id: "3 · hotel follow-up (destination carried)", history: [
      { role: "user", content: "I'm travelling to Alexandria mid-August with my wife and 2 kids" },
      { role: "assistant", content: "Here are flight options from Riyadh (RUH) to Alexandria (HBE)…" },
    ], msg: "find me a hotel there too" },
  { id: "4 · itinerary (knowledge, no live search)", history: [
      { role: "user", content: "I'm going to Dubai next month" },
    ], msg: "plan 3 days there with the kids" },
  { id: "5 · origin CORRECTION", history: [
      { role: "user", content: "I'm travelling to Alexandria mid-August" },
      { role: "assistant", content: "Assuming you're flying from Riyadh — tell me if that's wrong. Here are options…" },
    ], msg: "no, I'm flying from Jeddah" },
  { id: "6 · Eid paraphrase (no keyword)", history: [], msg: "we want to get away somewhere over Eid with the kids" },
  { id: "7 · book-it canary (D8)", history: [
      { role: "user", content: "flights from Riyadh to Cairo on 2026-09-10 returning 2026-09-17" },
      { role: "assistant", content: "Cheapest options: … here are the booking links." },
    ], msg: "just book it for me" },
  { id: "8 · Arabic destination", history: [], msg: "عايز أسافر إسكندرية الشهر الجاي" },
  { id: "9 · Arabic with family", history: [
      { role: "user", content: "عايز أسافر دبي" },
    ], msg: "أنا وزوجتي والأطفال في أغسطس" },
  { id: "10 · restaurants ask", history: [
      { role: "user", content: "I'm in Cairo next week" },
    ], msg: "where should we eat there" },
];

function fmtTrip(trip) {
  if (!trip) return "(null — packet skipped, falls to today's path)";
  const o = trip.origin ? `${trip.origin.city}${trip.origin.iata ? "/" + trip.origin.iata : ""}[${trip.origin.source}]` : "—";
  const d = trip.destination ? `${trip.destination.city}${trip.destination.iata ? "/" + trip.destination.iata : ""}` : "—";
  const dates = trip.dates ? `${trip.dates.depart || "?"}${trip.dates.return ? ".." + trip.dates.return : ""}${trip.dates.flex ? " (" + trip.dates.flex + ")" : ""}` : "—";
  const party = trip.party ? `${trip.party.adults || 0}a+${trip.party.children || 0}c` : "—";
  return `origin=${o} dest=${d} dates=${dates} party=${party} needs=[${(trip.needs || []).join(",")}]`;
}

(async () => {
  const hasKey = !!(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2 || process.env.CEREBRAS_API_KEY);
  console.log("\nBuild-183 — trip-state extractor replay" + (hasKey ? "" : "  (NO KEY — extraction skipped; verify live at prod self-verify)"));
  console.log("=".repeat(96));
  for (const c of CONVOS) {
    let trip = null;
    if (hasKey) {
      try { trip = await T.extractTripState({ message: c.msg, history: c.history, homeCity: T.homeCity() }); } catch (_) { trip = null; }
      if (trip) trip.origin = T.resolveOrigin(trip, { homeCity: T.homeCity() });
    }
    const decision = !trip ? "—"
      : (T.travelClarify(trip, /[؀-ۿ]/.test(c.msg)) ? "CLARIFY: " + T.travelClarify(trip, /[؀-ۿ]/.test(c.msg))
        : "PACKET (" + T.buildBookingLinks(trip).length + " links)");
    console.log(`\n[${c.id}]`);
    console.log(`  msg: ${c.msg}`);
    console.log(`  trip: ${fmtTrip(trip)}`);
    console.log(`  decision: ${decision}`);
  }
  console.log("\n" + "=".repeat(96));
  console.log(hasKey ? "Replay complete — eyeball the inferences (C1 checkpoint)." : "No key locally — the same replay runs as the live prod canaries 1-7.");
})();
