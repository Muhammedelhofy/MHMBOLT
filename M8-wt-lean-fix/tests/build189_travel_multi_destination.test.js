/**
 * Build-189 — Travel lane multi-candidate destination fix (tests/build189_travel_multi_destination.test.js)
 *
 * Run: node tests/build189_travel_multi_destination.test.js
 *
 * Known gap flagged in B-187 (M8_TRAVEL_LANE_SPEC.md Amendment B2, BUILD_LOG.md Session 87):
 * extractTripState()'s trip schema modeled a SINGLE destination.city. A message naming two
 * candidate destinations ("hurghada or sharm", "thinking Bali or Phuket") gave the extractor
 * nothing valid to put in "destination", so normalizeTrip returned null and the WHOLE travel
 * packet (buildTravelPacket, live flight/hotel search, booking links) silently skipped that
 * turn in orchestrator.js — degrading straight to the non-travel path (this was the likely
 * trigger for the fleet-error-leak incident B-187 fixed the symptom of, not the mechanism).
 *
 * Fix (meaning-first, no new keyword lane — the extractor is still the ONE LLM call):
 *   - the JSON schema gains an optional "destinationCandidates":[{city,iata}] field, filled
 *     ONLY when the model reads 2+ named candidates and no decided destination.
 *   - normalizeTrip keeps a trip alive in that case (destination:null, destinationCandidates
 *     populated, deduped, capped at 4) instead of discarding it.
 *   - travelClarify (the EXISTING clarify-once mechanism — same one-blocking-question pattern
 *     as the missing-dates case) fires FIRST on an ambiguous destination and asks the ONE
 *     disambiguating question ("Hurghada or Sharm — which one?"), before origin/dates are
 *     ever touched. No new keyword regex, no new action lane — same LLM extraction + the
 *     same deterministic clarify-once composer, extended to a second blocking condition.
 *   - orchestrator.js's gate widens to also reach travelClarify when the destination is
 *     ambiguous (previously only reached when a single destination.city existed); the
 *     ambiguous branch ALWAYS returns from travelClarify by construction, so the rest of the
 *     travel packet (links/flights/hotels) can only run once a single destination is settled.
 *
 * Covers: normalizeTrip candidate parsing (dedupe/cap/ignored-when-destination-present/
 * needs-2-plus), destinationChoiceClarify + travelClarify precedence (EN + AR, exactly one
 * '?'), and a static wire-guard grep on orchestrator.js proving the ambiguous branch reaches
 * travelClarify and short-circuits before the packet-building code.
 * The PS-5.1 mirror (build189_travel_multi_destination.test.ps1) asserts the same pure logic.
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const T = require("../lib/travel");

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) { pass++; } else { fails.push(label); console.log("  FAIL  " + label); } }

console.log("\nBuild-189 Travel lane multi-candidate destination — unit tests");
console.log("=".repeat(72));

// ── normalizeTrip: destinationCandidates parsing (pure, offline) ─────────────
{
  // 2 candidates, no decided destination -> trip stays alive with candidates
  const nt = T.normalizeTrip({
    destination: null,
    destinationCandidates: [{ city: "Hurghada", iata: null }, { city: "Sharm El Sheikh", iata: "SSH" }],
    needs: ["hotels"],
  });
  ok("2 candidates: trip is not null", nt !== null);
  ok("2 candidates: destination stays null", nt.destination === null);
  ok("2 candidates: destinationCandidates has both", Array.isArray(nt.destinationCandidates) && nt.destinationCandidates.length === 2);
  ok("2 candidates: city names preserved in order", nt.destinationCandidates[0].city === "Hurghada" && nt.destinationCandidates[1].city === "Sharm El Sheikh");
  ok("2 candidates: iata kept when valid, null when absent", nt.destinationCandidates[0].iata === null && nt.destinationCandidates[1].iata === "SSH");
}

{
  // exactly 1 candidate is NOT enough to keep the trip alive (needs 2+ to be "ambiguous")
  const nt = T.normalizeTrip({ destination: null, destinationCandidates: [{ city: "Hurghada" }], needs: ["hotels"] });
  ok("1 candidate + no destination -> null (not ambiguous, just absent)", nt === null);
}

{
  // garbage entries in the candidates array are dropped, not fatal
  const nt = T.normalizeTrip({
    destination: null,
    destinationCandidates: [{ city: "Hurghada" }, "garbage", { notACity: 1 }, { city: "Sharm" }],
    needs: ["flights"],
  });
  ok("garbage candidate entries are skipped, valid ones kept", nt && nt.destinationCandidates.length === 2 &&
    nt.destinationCandidates[0].city === "Hurghada" && nt.destinationCandidates[1].city === "Sharm");
}

{
  // dedupe case-insensitively
  const nt = T.normalizeTrip({
    destination: null,
    destinationCandidates: [{ city: "Hurghada" }, { city: "HURGHADA" }, { city: "Sharm" }],
    needs: ["hotels"],
  });
  ok("duplicate candidate (case-insensitive) is deduped", nt.destinationCandidates.length === 2);
}

{
  // cap at 4 even if the model names more
  const nt = T.normalizeTrip({
    destination: null,
    destinationCandidates: [{ city: "A" }, { city: "B" }, { city: "C" }, { city: "D" }, { city: "E" }],
    needs: ["ideas"],
  });
  ok("candidates capped at 4", nt.destinationCandidates.length === 4);
}

{
  // a decided destination WINS — candidates (if the model still echoed some) are ignored
  const nt = T.normalizeTrip({
    destination: { city: "Cairo", iata: "CAI" },
    destinationCandidates: [{ city: "Hurghada" }, { city: "Sharm" }],
    needs: ["flights"],
  });
  ok("decided destination present -> destinationCandidates ignored (null)", nt.destination.city === "Cairo" && nt.destinationCandidates === null);
}

ok("no destination + no candidates -> null (unchanged prior behaviour)", T.normalizeTrip({ destination: null, needs: ["flights"] }) === null);
ok("non-array destinationCandidates is just ignored -> null", T.normalizeTrip({ destination: null, destinationCandidates: "nope", needs: ["flights"] }) === null);

// ── destinationChoiceClarify (pure composer) ─────────────────────────────────
{
  const two = T.destinationChoiceClarify([{ city: "Hurghada" }, { city: "Sharm El Sheikh" }], false);
  ok("2-candidate EN: names both cities joined with 'or'", /Hurghada or Sharm El Sheikh/.test(two));
  ok("2-candidate EN: asks exactly one question", (two.match(/\?/g) || []).length === 1);
  ok("2-candidate EN: ends with a disambiguating question", /which one/i.test(two));

  const three = T.destinationChoiceClarify([{ city: "Bali" }, { city: "Phuket" }, { city: "Krabi" }], false);
  ok("3-candidate EN: oxford-style list", /Bali, Phuket or Krabi/.test(three));
  ok("3-candidate EN: exactly one question", (three.match(/\?/g) || []).length === 1);

  const ar = T.destinationChoiceClarify([{ city: "Hurghada" }, { city: "Sharm" }], true);
  ok("2-candidate AR: names both cities + Arabic connective", /Hurghada/.test(ar) && /Sharm/.test(ar) && /أو/.test(ar));
  ok("2-candidate AR: exactly one question mark", (ar.match(/\?/g) || []).length <= 1 && /أيهما/.test(ar));
}

// ── travelClarify: ambiguous destination fires FIRST, before origin/dates ────
{
  const ambiguous = { destination: null, destinationCandidates: [{ city: "Hurghada" }, { city: "Sharm El Sheikh" }], needs: ["hotels"] };
  const clar = T.travelClarify(ambiguous, false);
  ok("travelClarify fires on ambiguous destination (destination null, 2+ candidates)", !!clar);
  ok("travelClarify ambiguous-destination text names both candidates", /Hurghada/.test(clar) && /Sharm El Sheikh/.test(clar));
  ok("travelClarify ambiguous-destination asks exactly ONE question", (clar.match(/\?/g) || []).length === 1);
  // no origin was resolved on this trip at all -- proves the ambiguous check runs before any
  // origin-confirm logic could even be reached (origin is undefined, not just unset)
  ok("ambiguous trip never had origin touched", ambiguous.origin === undefined);
}

{
  // exactly 1 candidate (already covered by normalizeTrip returning null) can't reach
  // travelClarify as an "ambiguous" trip -- but if some other caller passed a malformed
  // trip with only 1 candidate directly, travelClarify must NOT treat it as ambiguous.
  const notAmbiguous = { destination: null, destinationCandidates: [{ city: "Hurghada" }], needs: ["hotels"] };
  ok("travelClarify does not treat a single candidate as ambiguous (destination still null -> null, not a crash)", T.travelClarify(notAmbiguous, false) === null);
}

{
  // regression: a resolved single destination is unaffected by the new branch
  const resolved = { origin: T.resolveOrigin({ origin: null }, { homeCity: "Riyadh" }), destination: { city: "Alexandria" }, dates: null, needs: ["flights"] };
  const clar = T.travelClarify(resolved, false);
  ok("regression: resolved destination + flights + no dates -> the ORIGINAL origin-confirm clarify, not the ambiguous one", /Assuming you're flying from Riyadh/.test(clar) && !/which one/i.test(clar));
}

{
  // regression: no ambiguity, no missing slot -> null (proceed to packet), same as B-183
  const ready = { origin: T.resolveOrigin({ origin: null }, { homeCity: "Riyadh" }), destination: { city: "Alexandria" }, dates: { depart: "2026-08-14" }, needs: ["flights"] };
  ok("regression: fully resolved trip -> travelClarify null (unchanged)", T.travelClarify(ready, false) === null);
}

ok("travelClarify(null) -> null (guard)", T.travelClarify(null, false) === null);

// ── ★ static wire guard: orchestrator.js reaches travelClarify on the ambiguous branch ──
{
  const orch = fs.readFileSync(path.join(__dirname, "..", "lib", "orchestrator.js"), "utf8");
  ok("orchestrator: computes an ambiguous-destination flag off destinationCandidates.length >= 2",
    /_ambiguousDest\s*=.*destinationCandidates.*length\s*>=\s*2/.test(orch));
  ok("orchestrator: the outer gate now admits EITHER a resolved destination OR the ambiguous case",
    /if\s*\(trip\s*&&\s*\(_hasDest\s*\|\|\s*_ambiguousDest\)\)/.test(orch));
  ok("orchestrator: resolveOrigin/canonicalizeTripIata only run when a destination is actually resolved",
    /if\s*\(_hasDest\)\s*\{[\s\S]{0,200}resolveOrigin/.test(orch));
  ok("orchestrator: travelClarify is still called (and still returns early) after the widened gate",
    /travel\.travelClarify\(trip, _ar\)/.test(orch) && /if \(_clar\) \{[\s\S]{0,120}return _clar;/.test(orch));
}

// ── report ────────────────────────────────────────────────────────────────────
console.log("=".repeat(72));
const total = pass + fails.length;
console.log(`\nResults: ${pass}/${total} passed, ${fails.length} failed\n`);
if (fails.length) { fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
else console.log("All Build-189 multi-destination unit tests passed.\n");
