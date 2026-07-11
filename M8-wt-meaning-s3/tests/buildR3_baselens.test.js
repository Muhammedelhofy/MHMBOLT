/**
 * tests/buildR3_baselens.test.js — Build-R3 "Base-b lens" ship gate.
 *
 * Pure-function coverage (no network, no DB, no LLM) for what R3 closes:
 *   - dr_base_periodic / dr_base_constant / dr_base_set : the digital-root-in-ARBITRARY-RADIX
 *     template family, same closed-whitelist discipline as dr_periodic/dr_constant/dr_set —
 *     validateClaim boundary checks, exhaustive evaluateClaim correctness, the honest
 *     "different base -> different cycle" experiment (base10/12/16 doubling periods)
 *   - kgonal / primes_mod : new CLOSED generators (whitelist-gated), kgonal generalizing
 *     the existing triangular/square/pentagonal/hexagonal generators
 *   - M8_BASE_LENS kill-switch (default ON): OFF -> dr_base family / kgonal / primes_mod
 *     rejected exactly as if absent, AND the three proposer prompts are BYTE-IDENTICAL to the
 *     pre-R3 text (no new vocabulary leaks into the LLM prompt when disabled)
 *   - the visible payoff (Part 2): seedKnownMatch now resolves 8 of the 16 digital-root-v1
 *     seeds to EXISTING templates/generators (not the new dr_base family) — the other 8
 *     honestly stay unbound; a dr_base_* (radix != 10) claim gets NO citation (no seed
 *     covers a non-base-10 result — Part 1 and Part 2 stay honestly independent)
 *   - Lean stretch: leanVerifyDigitSumMod9 fails safe to lean_pending when cold (never
 *     calls the check endpoint), and reports 'proven' when the injected checker verifies
 * Plus STATIC WIRE GUARDS: no new api/ fn, no SQL migration, kill-switch present in source.
 *
 * Run:  node tests/buildR3_baselens.test.js   (Kimi runtime: the PS mirror shells it)
 * PASS = every check passes (exit 0). Any FAIL ⇒ exit 1.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const kc   = require("../lib/kernel-conjecture");
const sp   = require("../lib/seed-pack");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}
function eq(name, expected, actual) {
  const ok = expected === actual;
  if (!ok) console.log(`        expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  check(name, ok);
}

// ── 0. Kill-switch default + basic gating ─────────────────────────
delete process.env.M8_BASE_LENS;
eq("baseLensEnabled default ON", true, kc.baseLensEnabled());
check("BASE_TEMPLATES = the 3 new templates", JSON.stringify(kc.BASE_TEMPLATES) === JSON.stringify(["dr_base_periodic", "dr_base_constant", "dr_base_set"]));
check("legacy TEMPLATES array UNCHANGED (4 entries)", JSON.stringify(kc.TEMPLATES) === JSON.stringify(["dr_periodic", "dr_constant", "dr_set", "mod_cycle"]));
check("legacy GENERATORS object UNCHANGED (no kgonal/primes_mod in it)", !Object.prototype.hasOwnProperty.call(kc.GENERATORS, "kgonal") && !Object.prototype.hasOwnProperty.call(kc.GENERATORS, "primes_mod"));
check("BASE_GENERATORS carries kgonal + primes_mod", Object.prototype.hasOwnProperty.call(kc.BASE_GENERATORS, "kgonal") && Object.prototype.hasOwnProperty.call(kc.BASE_GENERATORS, "primes_mod"));

// ── 1. dr_base_periodic — the honest "different base -> different cycle" experiment ──
// ord_9(2)=6 (base10) / ord_11(2)=10 (base12) / ord_15(2)=4 (base16) — hand-verified.
const doubleBase = (radix, period) => kc.validateClaim({ template: "dr_base_periodic", generator: "power", params: { base: 2, radix, period }, bound: 5000, label: `dr base ${radix} of 2^n period ${period}` });
const r10 = kc.evaluateClaim(kc.validateClaim({ template: "dr_periodic", generator: "power", params: { base: 2, period: 6 }, bound: 5000 }));
const r12 = kc.evaluateClaim(doubleBase(12, 10));
const r16 = kc.evaluateClaim(doubleBase(16, 4));
check("base10 doubling: period 6 holds (existing dr_periodic, regression)", r10.holds && r10.observedPeriod === 6);
check("base12 doubling: period 10 holds (ord_11(2)=10 — a DIFFERENT cycle)", r12.holds && r12.observedPeriod === 10);
check("base16 doubling: period 4 holds (ord_15(2)=4 — a DIFFERENT cycle again)", r16.holds && r16.observedPeriod === 4);
// the wrong period for a given base is correctly falsified (checker isn't fooled by any period)
const r12wrong = kc.evaluateClaim(doubleBase(12, 6));
check("base12 doubling period 6 is FALSIFIED (6 is the base-10 answer, not base-12's)", !r12wrong.holds);

// ── 2. validateClaim boundary checks for the base-b lens ──────────
check("dr_base_periodic rejects radix < 3", kc.validateClaim({ template: "dr_base_periodic", generator: "n", params: { radix: 2, period: 1 }, bound: 100 }) === null);
check("dr_base_periodic rejects radix > 1000", kc.validateClaim({ template: "dr_base_periodic", generator: "n", params: { radix: 1001, period: 1 }, bound: 100 }) === null);
check("dr_base_periodic accepts radix=3 (boundary)", kc.validateClaim({ template: "dr_base_periodic", generator: "n", params: { radix: 3, period: 2 }, bound: 100 }) !== null);
check("dr_base_constant rejects value > radix-1", kc.validateClaim({ template: "dr_base_constant", generator: "multiple", params: { k: 12, radix: 12, value: 11 }, bound: 100 }) !== null); // value=11=radix-1 OK
check("dr_base_constant rejects value == radix (out of 1..radix-1)", kc.validateClaim({ template: "dr_base_constant", generator: "n", params: { radix: 12, value: 12 }, bound: 100 }) === null);
check("dr_base_set rejects a set member > radix-1", kc.validateClaim({ template: "dr_base_set", generator: "n", params: { radix: 12, set: [1, 11, 12] }, bound: 100 }) === null);
check("dr_base_set accepts a valid subset", kc.validateClaim({ template: "dr_base_set", generator: "multiple", params: { k: 3, radix: 12, set: [3, 6, 9] }, bound: 100 }) !== null);

// ── 3. dr_base_constant / dr_base_set exhaustive correctness ──────
// dr in base 12 (mod 11) of 11n is always 11 (analog of dr(9n)=9 in base10).
const c11n = kc.validateClaim({ template: "dr_base_constant", generator: "multiple", params: { k: 11, radix: 12, value: 11 }, bound: 2000 });
check("dr_base_constant: dr_base12(11n) always 11 HOLDS", kc.evaluateClaim(c11n).holds);
const cWrong = kc.validateClaim({ template: "dr_base_constant", generator: "multiple", params: { k: 11, radix: 12, value: 5 }, bound: 2000 });
check("dr_base_constant: wrong constant is FALSIFIED", !kc.evaluateClaim(cWrong).holds);
// dr in base 13 of 3n is always in {3,6,9,12} (radix-1=12 is divisible by 3, so multiples of
// 3 land in the ideal 3Z/12Z — the base-13 analog of the base-10 {3,6,9} non-units fact; NOTE
// base 12 (radix-1=11, PRIME) would give the FULL set instead — itself an honest demonstration
// that the "restricted subset" structure is a base-dependent artifact, not universal).
const obsSet = kc.observedRootSetBase({ generator: "multiple", params: { k: 3, radix: 13 }, bound: 2000 });
const cSet = kc.validateClaim({ template: "dr_base_set", generator: "multiple", params: { k: 3, radix: 13, set: obsSet }, bound: 2000 });
check("dr_base_set: the TIGHT observed set HOLDS", kc.evaluateClaim(cSet).holds);
const cSetLoose = kc.validateClaim({ template: "dr_base_set", generator: "multiple", params: { k: 3, radix: 13, set: [...new Set([...obsSet, 1])].sort((a,b)=>a-b) }, bound: 2000 });
const resLoose = kc.evaluateClaim(cSetLoose);
check("dr_base_set: a superset also holds (loose)", resLoose.holds);
check("classifyHeld flags the loose superset TRIVIAL, the tight set TIGHT", kc.classifyHeld(cSet, kc.evaluateClaim(cSet)) === "tight" && kc.classifyHeld(cSetLoose, resLoose) === "trivial");

// ── 4. dr_base_periodic classifyHeld tight/trivial + tightnessScore ──
const tightClaim = doubleBase(12, 10);
const looseClaim = doubleBase(12, 20); // a proper multiple of the true period 10
const tightRes = kc.evaluateClaim(tightClaim), looseRes = kc.evaluateClaim(looseClaim);
check("period 20 (multiple of true 10) also holds", looseRes.holds);
check("classifyHeld: minimal period tight, multiple-period trivial", kc.classifyHeld(tightClaim, tightRes) === "tight" && kc.classifyHeld(looseClaim, looseRes) === "trivial");
eq("tightnessScore(dr_base_periodic) = its period", 10, kc.tightnessScore(tightClaim));

// ── 5. kgonal generalizes the existing figurate generators ────────
const genMatchesKgonal = (name, sides) => {
  for (let n = 1; n <= 12; n++) {
    if (kc.digitalRootOfGen(name, {}, n) !== kc.digitalRootOfGen("kgonal", { sides }, n)) return false;
  }
  return true;
};
check("kgonal(sides=3) == triangular", genMatchesKgonal("triangular", 3));
check("kgonal(sides=4) == square", genMatchesKgonal("square", 4));
check("kgonal(sides=5) == pentagonal", genMatchesKgonal("pentagonal", 5));
check("kgonal(sides=6) == hexagonal", genMatchesKgonal("hexagonal", 6));
check("kgonal rejects sides < 3", kc.validateClaim({ template: "dr_periodic", generator: "kgonal", params: { sides: 2, period: 9 }, bound: 100 }) === null);
check("kgonal rejects sides > 1000", kc.validateClaim({ template: "dr_periodic", generator: "kgonal", params: { sides: 1001, period: 9 }, bound: 100 }) === null);
// a genuinely NEW k-gonal family (heptagonal, sides=7) is a real, checkable, non-degenerate claim
const hept = kc.validateClaim({ template: "dr_periodic", generator: "kgonal", params: { sides: 7, period: 9 }, bound: 5000 });
check("heptagonal (sides=7, new — no dedicated generator existed before) digital root period 9 HOLDS", hept !== null && kc.evaluateClaim(hept).holds);

// ── 6. primes_mod — the n-th prime, bound-capped for sieve cost ──
eq("primes_mod n=1..5 mod 9 = 2,3,5,7,2 (primes 2,3,5,7,11)", "2,3,5,7,2", [1,2,3,4,5].map((n) => kc.genValueMod("primes_mod", {}, n, 9)).join(","));
eq("nthPrime(10) = 29", 29, kc.nthPrime(10));
const bigBoundClaim = kc.validateClaim({ template: "mod_cycle", generator: "primes_mod", params: { m: 9, period: 50 }, bound: 500000 });
check("primes_mod claim bound is clamped to PRIMES_MOD_BOUND_MAX", bigBoundClaim.bound === kc.PRIMES_MOD_BOUND_MAX);

// ── 7. Kill-switch OFF-identity (the R1/R2 pattern) ───────────────
const EXPECTED_PROPOSE_SYSTEM_PRE_R3 = `You turn an ESTABLISHED arithmetic KERNEL into ONE concrete, machine-checkable number-pattern claim a computer can falsify by exhaustive computation. This is for honest research: the claim will be CHECKED, never assumed true.

You may ONLY use this closed vocabulary (anything else is rejected):
TEMPLATES:
  - "dr_periodic":  the DIGITAL ROOT of g(n) repeats with period P.  params: {"period": <int 1..100>}
  - "dr_constant":  the DIGITAL ROOT of g(n) equals a constant C for all n.  params: {"value": <int 1..9>}
  - "dr_set":       the DIGITAL ROOT of g(n) is ALWAYS one of a fixed set of values.  params: {"set": [<ints 1..9>]}
  - "mod_cycle":    g(n) mod M is periodic with period P.  params: {"m": <int 2..1000>, "period": <int 1..100>}
GENERATORS g(n):
  - "n"           g(n)=n
  - "multiple"    g(n)=k*n        params also need {"k": <int 1..10000>}
  - "power"       g(n)=base^n     params also need {"base": <int 2..10000>}  (base=2 is the classic doubling/vortex sequence)
  - "square"      g(n)=n^2
  - "cube"        g(n)=n^3
  - "triangular"  g(n)=n(n+1)/2
  - "fib"         g(n)=Fibonacci(n)
  - "lucas"       g(n)=Lucas(n)        (Fibonacci's companion: 1,3,4,7,11,…)
  - "pentagonal"  g(n)=n(3n-1)/2       (figurate / "sacred-geometry" number)
  - "hexagonal"   g(n)=n(2n-1)         (figurate number)

OUTPUT CONTRACT — exactly one JSON object, no markdown, no prose:
{"template":"...","generator":"...","params":{...},"bound":<int e.g. 10000>,"label":"<one-line plain statement>"}

RULES:
1. The claim must follow ONLY from the kernel's established arithmetic — NOT from any speculative/energy/mystical framing. Test the arithmetic, never the mysticism.
2. If the kernel yields no claim expressible in the vocabulary above, output exactly: null
3. Invent nothing the kernel does not support. A missing claim is better than a wrong one.
4. params must merge the template's and the generator's required keys into one flat object.`;

process.env.M8_BASE_LENS = "off";
eq("baseLensEnabled('off') = false", false, kc.baseLensEnabled());
process.env.M8_BASE_LENS = "0";
eq("baseLensEnabled('0') = false", false, kc.baseLensEnabled());
process.env.M8_BASE_LENS = "off";
// E5 follow-up added its OWN orthogonal switch (M8_DR_PROPOSER_EXAMPLES, worked examples for
// terse kernels) — hold IT off too so this check keeps proving ONLY the R3 base-lens identity,
// independent of the E5 addition (mirrors the CM1/CM2 "never touches buildProposeSystem's
// OFF-identity" discipline, just for a switch that DOES touch it, gated off here instead).
process.env.M8_DR_PROPOSER_EXAMPLES = "off";
check("OFF: buildProposeSystem() is BYTE-IDENTICAL to the pre-R3 prompt", kc.buildProposeSystem() === EXPECTED_PROPOSE_SYSTEM_PRE_R3);
delete process.env.M8_DR_PROPOSER_EXAMPLES;
check("OFF: buildLiteralSystem() carries no base-lens vocab", !kc.buildLiteralSystem().includes("dr_base") && !kc.buildLiteralSystem().includes("kgonal"));
check("OFF: buildMultiProposeSystem() carries no base-lens vocab", !kc.buildMultiProposeSystem().includes("dr_base") && !kc.buildMultiProposeSystem().includes("kgonal"));
check("OFF: dr_base_periodic rejected exactly as if absent", kc.validateClaim({ template: "dr_base_periodic", generator: "power", params: { base: 2, radix: 12, period: 10 }, bound: 5000 }) === null);
check("OFF: kgonal generator rejected exactly as if absent", kc.validateClaim({ template: "dr_periodic", generator: "kgonal", params: { sides: 7, period: 9 }, bound: 5000 }) === null);
check("OFF: primes_mod generator rejected exactly as if absent", kc.validateClaim({ template: "mod_cycle", generator: "primes_mod", params: { m: 9, period: 24 }, bound: 5000 }) === null);
check("OFF: legacy dr_periodic/power(base=2) claim STILL WORKS (no regression)", (() => {
  const c = kc.validateClaim({ template: "dr_periodic", generator: "power", params: { base: 2, period: 6 }, bound: 5000 });
  return c !== null && kc.evaluateClaim(c).holds;
})());
delete process.env.M8_BASE_LENS;
check("ON (restored): dr_base_periodic accepted again", kc.validateClaim({ template: "dr_base_periodic", generator: "power", params: { base: 2, radix: 12, period: 10 }, bound: 5000 }) !== null);
check("ON: buildProposeSystem() now DOES carry the base-lens vocab", kc.buildProposeSystem().includes("dr_base_periodic") && kc.buildProposeSystem().includes("kgonal"));

// ── 8. The visible payoff — 8 seeds now resolve, dr_base_* stays unbound (Part 1/2 independence) ──
const bound = [
  { claim: { template: "dr_periodic", generator: "n", period: 9 }, seedId: "digital-root-period-9" },
  { claim: { template: "dr_periodic", generator: "power", base: 2, period: 6 }, seedId: "doubling-orbit-124875" },
  { claim: { template: "dr_set", generator: "multiple", k: 3, set: [3, 6, 9] }, seedId: "three-six-nine-are-the-non-units" },
  { claim: { template: "dr_periodic", generator: "square", period: 9 }, seedId: "squares-digital-root-period-9" },
  { claim: { template: "mod_cycle", generator: "fib", m: 9, period: 24 }, seedId: "fibonacci-pisano-period-9" },
  { claim: { template: "dr_periodic", generator: "fib", period: 24 }, seedId: "fibonacci-digital-root-period-24" },
  { claim: { template: "mod_cycle", generator: "lucas", m: 9, period: 24 }, seedId: "lucas-mod-9-period-24" },
  { claim: { template: "dr_periodic", generator: "triangular", period: 9 }, seedId: "triangular-digital-root-period-9" },
];
for (const { claim, seedId } of bound) {
  const m = sp.seedKnownMatch(claim);
  check(`seedKnownMatch resolves ${JSON.stringify(claim)} -> ${seedId}`, !!m && m.id === seedId);
}
// the other 8 seeds (group-theoretic / two-variable / negative facts) correctly stay
// unbound — no honest single-variable g(n) template exists for them (no fabrication).
const UNBOUND_IDS = ["dr-equals-n-mod-9", "digit-sum-congruence-mod-9", "casting-out-nines-homomorphism", "units-mod-9-cyclic-order-6", "threes-and-sixes-doubling", "rodin-doubling-kernel-classical", "tesla-369-quote-unsourced", "rodin-vortex-energy-leap"];
const drById = Object.fromEntries(sp.DIGITAL_ROOT.seeds.map((s) => [s.id, s]));
check("the 8 remaining seeds all still have empty matches_templates", UNBOUND_IDS.every((id) => drById[id] && drById[id].matches_templates.length === 0));
// a dr_base_* claim (radix != 10) never gets a citation — no seed in the pack covers a
// non-base-10 result, so the FORM-match search correctly returns null (Parts 1/2 independent).
eq("dr_base_periodic (radix=12, base=2) -> NO citation (no base-12 literature seed exists)", null, sp.seedKnownMatch({ template: "dr_base_periodic", generator: "power", base: 2, radix: 12, period: 10 }));
// end-to-end: renderKernelConjecture now shows the 📚 line for the doubling-orbit claim
const doublingClaim = { template: "dr_periodic", generator: "power", params: { base: 2, period: 6 }, bound: 5000, label: "dr of 2^n has period 6" };
const doublingRes = kc.evaluateClaim(doublingClaim);
const doublingRendered = kc.renderKernelConjecture({ label: "doubling kernel" }, doublingClaim, doublingRes);
check("renderKernelConjecture NOW carries 📚 + the doubling-orbit citation (R3 lit up)", /📚/.test(doublingRendered) && /doubling orbit mod 9/i.test(doublingRendered) && /OEIS A000079/.test(doublingRendered));

// ── 9. Lean stretch — fails safe to lean_pending when cold, never blocks ─────
(async () => {
  let checkCalled = false;
  const coldHealth = async () => ({ ready: false });
  const shouldNotBeCalled = async () => { checkCalled = true; return { ok: true, data: { verified: true } }; };
  const coldResult = await kc.leanVerifyDigitSumMod9({ healthFn: coldHealth, checkFn: shouldNotBeCalled });
  check("Lean stretch: cold checker -> lean_pending, check() NEVER called", coldResult.status === "lean_pending" && checkCalled === false);

  const warmHealth = async () => ({ ready: true });
  const verifiedCheck = async () => ({ ok: true, data: { verified: true } });
  const warmResult = await kc.leanVerifyDigitSumMod9({ healthFn: warmHealth, checkFn: verifiedCheck });
  check("Lean stretch: warm + verified -> status 'proven'", warmResult.status === "proven" && warmResult.theorem === kc.LEAN_DIGIT_SUM_MOD9_CODE);
  check("Lean theorem source is the two-digit mod-9 building block (omega-decidable)", /10 \* a \+ b\) % 9 = \(a \+ b\) % 9/.test(kc.LEAN_DIGIT_SUM_MOD9_CODE) && /omega/.test(kc.LEAN_DIGIT_SUM_MOD9_CODE));

  const sorryCheck = async () => ({ ok: true, data: { verified: false, sorries: ["x"] } });
  const sorryResult = await kc.leanVerifyDigitSumMod9({ healthFn: warmHealth, checkFn: sorryCheck });
  check("Lean stretch: warm but not verified -> NOT 'proven' (honest, never overclaims)", sorryResult.status !== "proven");

  // ── 10. STATIC WIRE GUARDS ──────────────────────────────────────
  const kcSrc = fs.readFileSync(path.join(__dirname, "../lib/kernel-conjecture.js"), "utf8");
  check("kernel-conjecture.js defines M8_BASE_LENS kill-switch", /M8_BASE_LENS/.test(kcSrc));
  check("kernel-conjecture.js defines BASE_TEMPLATES", /const\s+BASE_TEMPLATES\s*=/.test(kcSrc));
  check("kernel-conjecture.js defines BASE_GENERATORS", /const\s+BASE_GENERATORS\s*=/.test(kcSrc));
  check("kernel-conjecture.js requires ./leanClient", /require\(["']\.\/leanClient["']\)/.test(kcSrc));
  const apiDir = path.join(__dirname, "../api");
  const apiCount = fs.existsSync(apiDir) ? fs.readdirSync(apiDir).filter((f) => f.endsWith(".js")).length : 0;
  eq("R3 added no new api/ function (still 10)", 10, apiCount);
  const migDir = path.join(__dirname, "../migrations");
  const r3Sql = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => /r3|base.?lens/i.test(f)) : [];
  eq("R3 added no SQL migration", 0, r3Sql.length);
  check("digital-root-v1.json exists on disk (unchanged path)", fs.existsSync(path.join(__dirname, "../data/seed-packs/digital-root-v1.json")));

  console.log(`\nBuild-R3 base-b lens: ${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})();
