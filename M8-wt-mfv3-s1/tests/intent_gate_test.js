/**
 * M8 Intent Gate — routing fixture test  (tests/intent_gate_test.js)
 *
 * Run: node tests/intent_gate_test.js
 *
 * The AUTHORITATIVE contract for the Intent Gate build. Drives resolveIntent()
 * over Muhammad's REAL phrasings (tests/fixtures/routing_phrasings.json, mined
 * step 0 from m8_conversations + m8_router_misses). The PS 5.1 mirror
 * (intent_gate_test.ps1) re-implements the SAME contract so it can run on this
 * host, where Node is absent — per the PS-mirror rule, PS-fail + JS-pass = a
 * mirror bug, not a source bug.
 *
 * resolveIntent(message, opts) is PURE over (message, opts):
 *   opts = { fleetSignal?, memberHit?, walletRef?, fleetRef?, arb? } — the hints
 *   the orchestrator feeds it (looksFleet / a household-name hit / whether the
 *   last turn was a wallet|fleet reply). No DB, no LLM, no network.
 *   returns { domain, band, confidence, runnerUp, why, scores }.
 *
 * WRITTEN TO FAIL until step 1 lands: resolveIntent() does not exist on the
 * pre-build capability-registry.js, so the require below yields undefined and
 * every case errors — that is the intended red state.
 *
 * CONTRACT (identical in the PS mirror):
 *   acc = case.acceptable || [case.domain]
 *   PASS  if r.domain in acc
 *   PASS  if case.ask_ok && r.band in {medium, weak, none}
 *   FAIL  otherwise
 *   HARD FAIL (overrides an ask_ok pass) if case.must_not includes r.domain
 *             AND r.band === "strong"   (a CONFIDENT mis-route into a forbidden
 *             lane — the exact bug class this build kills)
 */

const fs = require("fs");
const path = require("path");

const reg = require("../lib/capability-registry");
const resolveIntent = reg.resolveIntent; // undefined until step 1 — intended red

const fixturePath = path.join(__dirname, "fixtures", "routing_phrasings.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const cases = fixture.cases;

const VALID_BANDS = ["strong", "medium", "weak", "none"];

// The shared contract. Returns { ok, reason }.
function judge(c, r) {
  if (!r || typeof r.domain !== "string" || VALID_BANDS.indexOf(r.band) === -1) {
    return { ok: false, reason: `resolveIntent returned a malformed result (${JSON.stringify(r)})` };
  }
  const acc = c.acceptable && c.acceptable.length ? c.acceptable : [c.domain];
  const mustNot = c.must_not || [];

  // HARD FAIL: a confident route into a forbidden lane, regardless of ask_ok.
  if (mustNot.indexOf(r.domain) !== -1 && r.band === "strong") {
    return { ok: false, reason: `CONFIDENT mis-route to forbidden '${r.domain}' (band=strong)` };
  }
  if (acc.indexOf(r.domain) !== -1) return { ok: true, reason: "" };
  if (c.ask_ok && r.band !== "strong") {
    return { ok: true, reason: `unsure->'${r.domain}'/${r.band} (ask_ok)` };
  }
  return { ok: false, reason: `got '${r.domain}'/${r.band}, expected one of [${acc.join(", ")}]` };
}

let passed = 0;
const failures = [];

console.log("\nM8 Intent Gate — routing fixture (" + cases.length + " real phrasings)");
console.log("=".repeat(76));

for (const c of cases) {
  let r, err = null;
  try {
    r = resolveIntent(c.msg, c.opts || {});
  } catch (e) {
    err = e;
  }
  if (err) {
    failures.push({ c, reason: "threw: " + (err && err.message) });
    console.log(`  ERR   [${c.domain.padEnd(14)}] ${c.id}`);
    continue;
  }
  const v = judge(c, r);
  if (v.ok) {
    passed++;
    // quiet on pass; uncomment for verbose:
    // console.log(`  PASS  [${c.domain.padEnd(14)}] ${c.id}  (${r.domain}/${r.band})`);
  } else {
    failures.push({ c, reason: v.reason });
    console.log(`  FAIL  [${c.domain.padEnd(14)}] ${c.id}\n          "${c.msg}"\n          ${v.reason}`);
  }
}

// ── Step 2: medium-band write-fork clarifier (trigger + pick resolution) ──────
const _arb = require("../lib/domain-arbiter");
const WRITE_FORK = ["tasks", "notes", "wallet", "driver_profile"];
function clarifyFires(r) {
  return !!(r && r.why === "contest" && r.runnerUp &&
    WRITE_FORK.indexOf(r.domain) !== -1 && WRITE_FORK.indexOf(r.runnerUp) !== -1);
}
const s2 = [
  ["tasks<->notes fork triggers clarifier", clarifyFires(resolveIntent("Is there any notes or todo that I am missing?", {})) === true],
  ["tasks<->web does NOT clarify", clarifyFires(resolveIntent("Remind me today at 9:47 pm about the match", {})) === false],
  ["pick 'the note one' -> notes", _arb.pickedDomainFrom("the note one", ["tasks", "notes"]) === "notes"],
  ["pick 'task' -> tasks", _arb.pickedDomainFrom("task", ["tasks", "notes"]) === "tasks"],
  ["long fresh reply -> null pick", _arb.pickedDomainFrom("actually what is the weather in riyadh today please", ["tasks", "notes"]) === null],
];
for (const [label, ok] of s2) {
  if (ok) passed++;
  else { failures.push({ c: { id: "step2" }, reason: label }); console.log(`  FAIL  [step2] ${label}`); }
}
const total = cases.length + s2.length;

console.log("=".repeat(76));
console.log(`\nResults: ${passed}/${total} passed, ${failures.length} failed\n`);

if (failures.length) {
  console.log("Failed cases:");
  for (const f of failures) console.log(`  - ${f.c.id}: ${f.reason}`);
  process.exit(1);
} else {
  console.log("All intent-gate routing cases passed.\n");
}
