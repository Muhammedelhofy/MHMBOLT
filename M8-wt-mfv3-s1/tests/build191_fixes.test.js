"use strict";
/**
 * tests/build191_fixes.test.js — B-191 transcript fixes (authoritative JS contract).
 *
 * Covers the 4 fixes from Muhammad's 2026-07-08 live transcript:
 *   FIX 1  wallet⇄travel PRESENT-level routing tie → travel wins (capability-registry).
 *          (Also asserted end-to-end by tests/intent_gate_test.js over the fixture; the
 *          two control cases are re-asserted here for a focused red/green signal.)
 *   FIX 2  vault-source leak — layer (a) sanitizeSourceTitle + layer (b) stripSourceTokens.
 *   FIX 3  wallet "balance" honest answer — isBalanceQuery + balanceReply(NoData).
 *   FIX 4  country-level origin — isCountryOrigin + originCountryAsk + travelClarify hook.
 *
 * Pure logic only (no DB / no LLM / no network) so the PS-5.1 mirror asserts the same.
 */
process.env.M8_TRAVEL_LANE = "on";

const R  = require("../lib/capability-registry");
const KI = require("../lib/knowledge-intake");
const STF = require("../lib/source-token-filter");
const W  = require("../lib/wallet");
const T  = require("../lib/travel");

let pass = 0, fail = 0;
const fails = [];
function ok(label, cond) { if (cond) pass++; else { fail++; fails.push(label); console.log("  FAIL  " + label); } }
function eq(label, got, exp) { ok(label + "  (got " + JSON.stringify(got) + ", exp " + JSON.stringify(exp) + ")", got === exp); }

console.log("B-191 transcript fixes — unit tests");
console.log("=".repeat(72));

// ── FIX 1: wallet⇄travel present-tie ─────────────────────────────────────────
(() => {
  const red = R.resolveIntent("no the trip is from egypt, if i have a budget of 6000 sar for me wife and daughter can you recommend a trip outside egypt with this budget?", {});
  eq("FIX1 red case → travel", red.domain, "travel");
  ok("FIX1 red case why=wallet_travel_present_tie", red.why === "wallet_travel_present_tie");
  // CONTROL: strong wallet + strong travel — wallet must still win (money safety).
  const ctrl = R.resolveIntent("how much did I spend on my trip to Cairo?", {});
  eq("FIX1 control (spend-on-trip) stays wallet", ctrl.domain, "wallet");
  // Anchors unchanged.
  eq("FIX1 anchor travel-origin-correction", R.resolveIntent("no, the trip is from Egypt", {}).domain, "travel");
  eq("FIX1 anchor wallet-balance-en", R.resolveIntent("what is the balance of my wallet now?", {}).domain, "wallet");
})();

// ── FIX 2: vault-source leak (both layers) ───────────────────────────────────
(() => {
  // Layer (a): sanitizeSourceTitle strips the internal "vault:" namespace.
  eq("FIX2a vault title relabelled", KI.sanitizeSourceTitle("vault:Prime Claude.md"), "Prime Claude");
  eq("FIX2a vault path basename", KI.sanitizeSourceTitle("vault:Muhammad-OS/NORTH_STAR.md"), "NORTH_STAR");
  eq("FIX2a non-vault title untouched", KI.sanitizeSourceTitle("Ibn al-Haytham — Optics"), "Ibn al-Haytham — Optics");
  // formatCitation never emits a "vault:" token.
  const cite = KI.formatCitation({}, "vault:Prime Claude.md");
  ok("FIX2a citation has no 'vault:' token", typeof cite === "string" && cite.indexOf("vault:") === -1);
  // A real book citation is unaffected.
  ok("FIX2a book citation intact", KI.formatCitation({ author: "Ibn Kathir", year: "1370" }, "Al-Bidayah — Vol 1").indexOf("Ibn Kathir") === 0);

  // Layer (b): stripSourceTokens scrubs a leaked token from the final reply.
  const cases = [
    "Sure — that's from 【vault:Prime Claude.md】 in your notes.",
    "I found it in 〔vault:Projects/M8.md〕 earlier.",
    "According to vault:Prime Claude.md you prefer tables.",
    "No — it's in vault:Muhammad-OS/NORTH_STAR.md.",
  ];
  for (const c of cases) {
    const out = STF.stripSourceTokens(c);
    ok("FIX2b strips vault token: " + JSON.stringify(c), out.indexOf("vault:") === -1 && out.indexOf("【vault") === -1);
  }
  // Must NOT touch a legit math marker or clean prose (byte-identical).
  eq("FIX2b leaves ⟦n⟧ math marker", STF.stripSourceTokens("The result ⟦n⟧ = 42 is established."), "The result ⟦n⟧ = 42 is established.");
  eq("FIX2b clean reply unchanged", STF.stripSourceTokens("Your CV mentions 3 years at Careem."), "Your CV mentions 3 years at Careem.");
  eq("FIX2b idempotent on clean", STF.stripSourceTokens("hello"), "hello");
})();

// ── FIX 3: wallet balance honest answer ──────────────────────────────────────
(() => {
  eq("FIX3 'balance of my wallet' → balance query", W.isBalanceQuery("what is the balance of my wallet now?"), true);
  eq("FIX3 'how much do I have left' → balance", W.isBalanceQuery("how much do I have left?"), true);
  eq("FIX3 AR رصيد → balance", W.isBalanceQuery("كم رصيدي؟"), true);
  // CONTROL: a SPEND query is NOT a balance query (the summary lane owns it).
  eq("FIX3 'how much did I spend' NOT balance", W.isBalanceQuery("how much did I spend this month?"), false);
  eq("FIX3 AR صرفت NOT balance", W.isBalanceQuery("كم صرفت هذا الشهر؟"), false);
  eq("FIX3 'add 50 sar lunch' NOT balance", W.isBalanceQuery("add 50 sar lunch"), false);
  // Honest replies: name the limitation, never imply a balance exists.
  const r = W.balanceReply({ expense: 1234.5, base: "SAR", ar: false });
  ok("FIX3 reply states 'not a running balance'", /not a running balance/i.test(r));
  ok("FIX3 reply carries the spend total", r.indexOf("1234.5 SAR") !== -1);
  ok("FIX3 no-data reply still honest", /not a running balance/i.test(W.balanceReplyNoData(false)));
})();

// ── FIX 4: country-level origin ──────────────────────────────────────────────
(() => {
  eq("FIX4 Egypt is a country origin", T.isCountryOrigin({ origin: { city: "Egypt", source: "stated" } }), true);
  eq("FIX4 Cairo is a city, not country", T.isCountryOrigin({ origin: { city: "Cairo", source: "stated" } }), false);
  eq("FIX4 Kuwait city-state resolves (no ask)", T.isCountryOrigin({ origin: { city: "Kuwait", source: "stated" } }), false);
  // Ask only about a USER-STATED country, never an inferred home default.
  ok("FIX4 stated country → asks which city", /which city in Egypt/i.test(T.originCountryAsk({ origin: { city: "Egypt", source: "stated" } }, false) || ""));
  eq("FIX4 inferred country → no ask", T.originCountryAsk({ origin: { city: "Egypt", source: "env" } }, false), null);
  // AR asks in Arabic and never invents an airport.
  ok("FIX4 AR ask is Arabic", /من أي مدينة/.test(T.originCountryAsk({ origin: { city: "مصر", source: "stated" } }, true) || ""));
  // travelClarify hooks the country ask ahead of the dates question.
  eq("FIX4 travelClarify asks the origin city first",
     T.travelClarify({ origin: { city: "Egypt", source: "stated" }, destination: { city: "Dubai" }, needs: ["flights"] }, false),
     "Which city in Egypt are you flying from?");
  // REGRESSION: a stated CITY origin still gets the dates question, not the country ask.
  eq("FIX4 regression: city origin → dates question",
     T.travelClarify({ origin: { city: "Cairo", source: "stated" }, destination: { city: "Dubai" }, needs: ["flights"] }, false),
     "Sure — what dates are you thinking?");
})();

// ── FIX 4b: code-guaranteed country-origin detection (extractor can't mask it) ────
(() => {
  eq("FIX4b 'flying from Egypt' → Egypt", T.detectStatedCountryOrigin("find me flights to Dubai next month, flying from Egypt"), "Egypt");
  eq("FIX4b 'from egypt' (lc) → egypt", T.detectStatedCountryOrigin("no the trip is from egypt, if i have a budget of 6000 sar"), "egypt");
  eq("FIX4b 'from Saudi Arabia' → Saudi Arabia", T.detectStatedCountryOrigin("book a flight to Dubai on August 5th, flying from Saudi Arabia"), "Saudi Arabia");
  eq("FIX4b 'from the UAE' → UAE (article dropped)", T.detectStatedCountryOrigin("flights from the UAE to London"), "UAE");
  // Must NOT fire on a stated CITY, a destination, or a no-anchor mention.
  eq("FIX4b 'from Cairo' (city) → null", T.detectStatedCountryOrigin("flights from Cairo to Dubai"), null);
  eq("FIX4b 'to Egypt' (destination) → null", T.detectStatedCountryOrigin("a trip to Egypt in August"), null);
  eq("FIX4b 'outside egypt' (no anchor) → null", T.detectStatedCountryOrigin("recommend a trip outside egypt with this budget"), null);
  // The detected country renders the honest ask (article restored for display).
  ok("FIX4b UAE detection → 'which city in the UAE' ask",
     /which city in the UAE/i.test(T.originCountryAsk({ origin: { city: T.detectStatedCountryOrigin("flights from the UAE to London"), source: "stated" } }, false) || ""));
  // End-to-end: even if the extractor resolved Egypt→Cairo, the override re-asserts the
  // country so the lane asks which city (the live 2026-07-08 miss this closes).
  const trip = { origin: { city: "Cairo", iata: "CAI", source: "stated" }, destination: { city: "Dubai" }, needs: ["flights"] };
  const c = T.detectStatedCountryOrigin("find me flights to Dubai next month, flying from Egypt");
  if (c) trip.origin = { city: c, iata: null, source: "stated" };
  eq("FIX4b override → travelClarify asks the city",
     T.travelClarify(trip, false), "Which city in Egypt are you flying from?");
})();

console.log("=".repeat(72));
console.log(`\nResults: ${pass}/${pass + fail} passed, ${fail} failed`);
if (fail) { console.log("\nFailing:\n" + fails.map((f) => "  - " + f).join("\n")); process.exit(1); }
console.log("\nAll B-191 unit tests passed.");
