/**
 * Build-184 — LIVE flight probe (tests/travel_flight_probe.js)
 *
 * Hits the REAL SerpApi google_flights endpoint through lib/tools/flightSearch.js and
 * prints the normalized offer table for two Saudi→Egypt routes (RUH→CAI, RUH→HBE),
 * round-trip, ~5 weeks out. Informative-then-blocking (spec Probe C).
 *
 * KEYS ARE LOCAL-ONLY — this script reads SERPAPI_KEY from the environment (the .ps1
 * wrapper loads it from M8/.env.local, gitignored). It NEVER hardcodes, prints, or
 * commits a key. If the key is absent it prints guidance and exits 0 (no live claim).
 *
 * Run:  node tests/travel_flight_probe.js         (SERPAPI_KEY must be in env)
 *  or:  powershell -File tests/travel_flight_probe.ps1   (loads .env.local first)
 */
"use strict";
const { searchFlights } = require("../lib/tools/flightSearch");

function isoInDays(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtOffer(o) {
  const price = o.price != null ? `${o.currency} ${o.price}` : "n/a";
  const dep = o.departISO ? o.departISO.replace("T", " ") : "?";
  const arr = o.arriveISO ? o.arriveISO.replace("T", " ") : "?";
  const dur = Number.isFinite(o.durationMin) ? `${Math.floor(o.durationMin / 60)}h${String(o.durationMin % 60).padStart(2, "0")}m` : "?";
  const stops = o.stops === 0 ? "nonstop" : `${o.stops} stop(s)`;
  return `${String(price).padEnd(12)} ${String(o.carrier || "?").padEnd(22)} ${String(o.flightNumber || "").padEnd(9)} ${dep} -> ${arr}  ${dur.padEnd(7)} ${stops}`;
}

const LCC_RE = /air arabia|flynas|nas air|nesma|flyadeal|jazeera|wizz|pegasus/i;

async function probe(from, to, out, ret) {
  const t0 = Date.now();
  let res;
  try {
    res = await searchFlights({ departure_id: from, arrival_id: to, outbound_date: out, return_date: ret, adults: 1, children: 0 });
  } catch (e) {
    console.log(`\n${from} -> ${to}  (${out} / ${ret})  FAILED: ${e.message}`);
    return { from, to, ok: false, error: e.message };
  }
  const ms = Date.now() - t0;
  const offers = res.offers || [];
  console.log(`\n${from} -> ${to}  (${out} / ${ret})  source=${res.source}  latency=${ms}ms  offers=${offers.length}`);
  offers.forEach((o, i) => console.log(`  ${String(i + 1).padStart(2)}. ${fmtOffer(o)}`));
  const lcc = offers.filter((o) => LCC_RE.test(o.carrier || "")).map((o) => o.carrier);
  console.log(`  low-cost carriers present: ${lcc.length ? Array.from(new Set(lcc)).join(", ") : "none in this result set"}`);
  const cheapest = offers.filter((o) => o.price != null).sort((a, b) => a.price - b.price)[0];
  if (cheapest) console.log(`  cheapest: ${cheapest.currency} ${cheapest.price} on ${cheapest.carrier}`);
  return { from, to, ok: true, count: offers.length, ms, lcc: Array.from(new Set(lcc)) };
}

(async () => {
  console.log("Build-184 LIVE flight probe (SerpApi google_flights)");
  console.log("=".repeat(72));
  if (!process.env.SERPAPI_KEY) {
    console.log("SERPAPI_KEY not set in env — skipping the live probe (no live claim made).");
    console.log("Set it in M8/.env.local (gitignored) or `$env:SERPAPI_KEY=...` and re-run.");
    process.exit(0);
  }
  const out = isoInDays(35);
  const ret = isoInDays(42);
  await probe("RUH", "CAI", out, ret);
  await probe("RUH", "HBE", out, ret);
  console.log("\n" + "=".repeat(72));
  console.log("Probe done. (Read-only search — no booking, no payment. Key never printed.)");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
