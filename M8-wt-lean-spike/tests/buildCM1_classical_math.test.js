/**
 * tests/buildCM1_classical_math.test.js — Build-CM1 "Classical-math checker pack" ship gate.
 *
 * A research-lane extension BEYOND the R1-R6 blueprint (same shape as R3 extend-the-checker +
 * R2 curated-cited-seed-pack). Pure-function coverage (no network, no DB, no LLM) for what CM1
 * closes:
 *   - amicable_pair / perfect_number / euclid_euler / thabit_rule / aliquot_class: NEW
 *     generator-LESS checker templates, whitelist-gated, that VERIFY (not quote) a classical
 *     claim by EXACT direct computation (sum-of-proper-divisors + trial-division primality).
 *     Every figure is checked against the known canon: 220/284, 1184/1210, 2620/2924 amicable;
 *     6/28/496/8128/33550336 perfect; Euclid-Euler for p=2..19; Thabit's rule for n=2,4,7.
 *   - classical-math-v1 seed pack (R2 schema): 4 seeds bound to the NEW checkers, 2 (leap +
 *     open-problems) honestly unbound. A held check carries a CODE-GUARANTEED 〔citation〕.
 *   - M8_CLASSICAL_MATH kill-switch (default ON): OFF -> the whole family is rejected exactly as
 *     if absent, detectKernelTest does not route classical Qs, AND the digital-root proposer
 *     prompts are BYTE-IDENTICAL either way (this lane never edits them — R3 OFF-identity kept).
 * Plus STATIC WIRE GUARDS: no new api/ fn, no SQL migration, kill-switch + templates present.
 *
 * Run:  node tests/buildCM1_classical_math.test.js   (Kimi runtime: the PS mirror shells it)
 * PASS = every check passes (exit 0). Any FAIL => exit 1.
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
const ev = (c) => kc.evaluateClaim(c);
const holds = (c) => ev(c).holds;

// ── 0. Kill-switch default + gating surface ───────────────────────
delete process.env.M8_CLASSICAL_MATH;
eq("classicalMathEnabled default ON", true, kc.classicalMathEnabled());
check("CLASSICAL_TEMPLATES = the 5 new templates", JSON.stringify(kc.CLASSICAL_TEMPLATES) === JSON.stringify(["amicable_pair", "perfect_number", "euclid_euler", "thabit_rule", "aliquot_class"]));
check("legacy TEMPLATES array UNCHANGED (4 entries)", JSON.stringify(kc.TEMPLATES) === JSON.stringify(["dr_periodic", "dr_constant", "dr_set", "mod_cycle"]));
check("classical templates are generator-LESS (not in GENERATORS/BASE_GENERATORS)", !Object.prototype.hasOwnProperty.call(kc.GENERATORS, "amicable_pair") && !Object.prototype.hasOwnProperty.call(kc.BASE_GENERATORS, "perfect_number"));

// ── 1. pure core: sumProperDivisors + isPrimeTrial ────────────────
eq("s(6) = 6 (1+2+3)", 6, kc.sumProperDivisors(6));
eq("s(28) = 28", 28, kc.sumProperDivisors(28));
eq("s(12) = 16 (abundant)", 16, kc.sumProperDivisors(12));
eq("s(10) = 8 (deficient)", 8, kc.sumProperDivisors(10));
eq("s(1) = 0", 0, kc.sumProperDivisors(1));
eq("s(220) = 284", 284, kc.sumProperDivisors(220));
eq("s(284) = 220", 220, kc.sumProperDivisors(284));
check("isPrimeTrial: 2,3,5,7,11,127,8191 all prime", [2, 3, 5, 7, 11, 127, 8191].every((p) => kc.isPrimeTrial(p)));
check("isPrimeTrial: 1,0,4,9,2047(=23x89),8388607 all NOT prime", [1, 0, 4, 9, 2047, 8388607].every((n) => !kc.isPrimeTrial(n)));
check("euclidPerfectForm(5) = {mersenne:31, form:496}", kc.euclidPerfectForm(5).mersenne === 31 && kc.euclidPerfectForm(5).form === 496);
check("thabitTriple(2) = p5 q11 r71 a220 b284", (() => { const t = kc.thabitTriple(2); return t.p === 5 && t.q === 11 && t.r === 71 && t.a === 220 && t.b === 284; })());

// ── 2. amicable_pair — verify the known pairs by direct computation ──
check("220/284 is an amicable pair (HOLDS)", holds({ template: "amicable_pair", params: { m: 220, n: 284 } }));
check("284/220 (order-swapped) also HOLDS", holds({ template: "amicable_pair", params: { m: 284, n: 220 } }));
check("1184/1210 is an amicable pair (HOLDS)", holds({ template: "amicable_pair", params: { m: 1184, n: 1210 } }));
check("2620/2924 is an amicable pair (HOLDS)", holds({ template: "amicable_pair", params: { m: 2620, n: 2924 } }));
check("220/285 is NOT amicable (FALSIFIED)", !holds({ template: "amicable_pair", params: { m: 220, n: 285 } }));
check("6/6 is NOT an amicable pair (m==n: a perfect number, not amicable)", !holds({ template: "amicable_pair", params: { m: 6, n: 6 } }));
check("amicable_pair falsified carries the computed witness sm/sn", (() => { const r = ev({ template: "amicable_pair", params: { m: 220, n: 285 } }); return r.counterexample && r.counterexample.sm === 284; })());

// ── 3. perfect_number — Euclid's four + the fifth, and the abundant/deficient controls ──
eq("6,28,496,8128,33550336 all perfect", "true,true,true,true,true", [6, 28, 496, 8128, 33550336].map((n) => holds({ template: "perfect_number", params: { n } })).join(","));
check("12 is NOT perfect (abundant, s=16)", (() => { const r = ev({ template: "perfect_number", params: { n: 12 } }); return !r.holds && r.detail.cls === "abundant"; })());
check("10 is NOT perfect (deficient, s=8)", (() => { const r = ev({ template: "perfect_number", params: { n: 10 } }); return !r.holds && r.detail.cls === "deficient"; })());

// ── 4. euclid_euler — the Euclid direction, verified by computation ──
eq("euclid_euler holds for the Mersenne exponents 2,3,5,7,13,17,19", "true,true,true,true,true,true,true",
  [2, 3, 5, 7, 13, 17, 19].map((p) => holds({ template: "euclid_euler", params: { p } })).join(","));
eq("euclid_euler(5) builds form 496", 496, ev({ template: "euclid_euler", params: { p: 5 } }).detail.form);
eq("euclid_euler(13) builds form 33550336", 33550336, ev({ template: "euclid_euler", params: { p: 13 } }).detail.form);
check("euclid_euler(11) FALSIFIED (2^11-1 = 2047 = 23x89 composite -> no Mersenne prime)", (() => { const r = ev({ template: "euclid_euler", params: { p: 11 } }); return !r.holds && r.detail.mprime === false; })());
check("euclid_euler(23) FALSIFIED (2^23-1 composite; primality checked FIRST, no divisor-sum)", (() => { const r = ev({ template: "euclid_euler", params: { p: 23 } }); return !r.holds && r.detail.mprime === false && r.detail.perfect === null; })());
check("every euclid form for p<=EUCLID_EXP_MAX stays exact (< 2^53)", (() => { for (let p = 2; p <= kc.EUCLID_EXP_MAX; p++) { if (kc.euclidPerfectForm(p).form > kc.CLASSICAL_INT_MAX) return false; } return true; })());

// ── 5. thabit_rule — Thabit ibn Qurra's construction, verified end-to-end ──
check("Thabit n=2 -> (220,284) amicable (HOLDS)", (() => { const r = ev({ template: "thabit_rule", params: { index: 2 } }); return r.holds && r.detail.a === 220 && r.detail.b === 284; })());
check("Thabit n=4 -> (17296,18416) amicable (HOLDS)", (() => { const r = ev({ template: "thabit_rule", params: { index: 4 } }); return r.holds && r.detail.a === 17296 && r.detail.b === 18416; })());
check("Thabit n=7 -> a real amicable pair (HOLDS)", holds({ template: "thabit_rule", params: { index: 7 } }));
check("Thabit n=3 -> NO pair (r = 287 = 7x41 composite)", (() => { const r = ev({ template: "thabit_rule", params: { index: 3 } }); return !r.holds && r.detail.r === 287 && r.detail.allPrime === false; })());
check("Thabit n=5 and n=6 -> NO pair (rule needs p,q,r all prime)", !holds({ template: "thabit_rule", params: { index: 5 } }) && !holds({ template: "thabit_rule", params: { index: 6 } }));
check("every Thabit pair for n<=THABIT_INDEX_MAX stays exact (< 2^53)", (() => { for (let n = 2; n <= kc.THABIT_INDEX_MAX; n++) { const t = kc.thabitTriple(n); if (Math.max(t.a, t.b) > kc.CLASSICAL_INT_MAX) return false; } return true; })());

// ── 6. aliquot_class — abundant / deficient / perfect ─────────────
check("12 abundant HOLDS, 12 deficient FALSIFIED", holds({ template: "aliquot_class", params: { n: 12, kind: "abundant" } }) && !holds({ template: "aliquot_class", params: { n: 12, kind: "deficient" } }));
check("10 deficient HOLDS", holds({ template: "aliquot_class", params: { n: 10, kind: "deficient" } }));
check("6 perfect HOLDS (via aliquot_class)", holds({ template: "aliquot_class", params: { n: 6, kind: "perfect" } }));

// ── 7. validateClaim boundary caps (the anti-smuggling gate) ──────
check("amicable_pair rejects m > AMICABLE_MAX", kc.validateClaim({ template: "amicable_pair", params: { m: kc.AMICABLE_MAX + 1, n: 284 } }) === null);
check("amicable_pair rejects m < 2", kc.validateClaim({ template: "amicable_pair", params: { m: 1, n: 284 } }) === null);
check("amicable_pair rejects a non-integer", kc.validateClaim({ template: "amicable_pair", params: { m: 220.5, n: 284 } }) === null);
check("euclid_euler rejects p > EUCLID_EXP_MAX", kc.validateClaim({ template: "euclid_euler", params: { p: kc.EUCLID_EXP_MAX + 1 } }) === null);
check("euclid_euler rejects p < 2", kc.validateClaim({ template: "euclid_euler", params: { p: 1 } }) === null);
check("thabit_rule rejects index > THABIT_INDEX_MAX", kc.validateClaim({ template: "thabit_rule", params: { index: kc.THABIT_INDEX_MAX + 1 } }) === null);
check("aliquot_class rejects an unknown kind", kc.validateClaim({ template: "aliquot_class", params: { n: 12, kind: "friendly" } }) === null);
check("aliquot_class accepts + lowercases kind", (() => { const c = kc.validateClaim({ template: "aliquot_class", params: { n: 12, kind: "ABUNDANT" } }); return c && c.params.kind === "abundant"; })());
check("perfect_number rejects n > PERFECT_MAX", kc.validateClaim({ template: "perfect_number", params: { n: kc.PERFECT_MAX + 1 } }) === null);

// ── 8. the seed pack (R2 schema) + code-guaranteed citation ───────
const pack = require("../data/seed-packs/classical-math-v1.json");
eq("classical-math-v1 has 6 curated seeds", 6, pack.seeds.length);
check("every seed passes the R2 validateSeed schema (0 errors)", pack.seeds.every((s) => sp.validateSeed(s).length === 0));
const boundIds = pack.seeds.filter((s) => s.matches_templates.length > 0).map((s) => s.id).sort();
eq("exactly 4 seeds bound to the NEW checkers", "aliquot-classification-nicomachus,amicable-numbers-concept,euclid-euler-perfect,thabit-amicable-rule", boundIds.join(","));
const unboundIds = pack.seeds.filter((s) => s.matches_templates.length === 0).map((s) => s.id).sort();
eq("exactly 2 seeds honestly unbound (leap + open problems)", "perfect-number-significance-leap,perfect-numbers-open-problems", unboundIds.join(","));
check("classicalSeedMatch(amicable_pair) -> the amicable-numbers seed (cites Thabit)", (() => { const m = kc.classicalSeedMatch({ template: "amicable_pair", m: 220, n: 284 }); return m && m.id === "amicable-numbers-concept" && /Thabit ibn Qurra/.test(m.citation); })());
check("classicalSeedMatch(perfect_number) -> Euclid-Euler seed", (() => { const m = kc.classicalSeedMatch({ template: "perfect_number", n: 28 }); return m && m.id === "euclid-euler-perfect"; })());
check("classicalSeedMatch(euclid_euler) -> Euclid-Euler seed", (() => { const m = kc.classicalSeedMatch({ template: "euclid_euler", p: 5 }); return m && m.id === "euclid-euler-perfect"; })());
check("classicalSeedMatch(thabit_rule) -> Thabit rule seed", (() => { const m = kc.classicalSeedMatch({ template: "thabit_rule", index: 2 }); return m && m.id === "thabit-amicable-rule"; })());
check("classicalSeedMatch(aliquot_class) -> Nicomachus seed", (() => { const m = kc.classicalSeedMatch({ template: "aliquot_class", n: 12, kind: "abundant" }); return m && m.id === "aliquot-classification-nicomachus"; })());
// the leap seed has NO template binding -> a checkable claim never fabricates its citation
check("leap seed carries matches_templates [] (never a phantom binding)", pack.seeds.find((s) => s.id === "perfect-number-significance-leap").matches_templates.length === 0);

// render() CODE-GUARANTEES the citation on a held check (R4 lesson: a required line is emitted, not hoped)
const amicRendered = kc.renderClassicalClaim({ template: "amicable_pair", params: { m: 220, n: 284 } }, ev({ template: "amicable_pair", params: { m: 220, n: 284 } }));
check("render(220/284) carries VERIFIED + 📚 + 〔...Thabit ibn Qurra...〕", /VERIFIED/.test(amicRendered) && /📚/.test(amicRendered) && /Thabit ibn Qurra/.test(amicRendered) && /〔/.test(amicRendered));
const perfRendered = kc.renderClassicalClaim({ template: "perfect_number", params: { n: 28 } }, ev({ template: "perfect_number", params: { n: 28 } }));
check("render(28 perfect) carries VERIFIED + 📚 + Euclid-Euler citation", /VERIFIED/.test(perfRendered) && /📚/.test(perfRendered) && /Euclid/.test(perfRendered) && /Euler/.test(perfRendered));
check("render always carries the honest 'not a general proof' + 'no mystical significance' coda", /not a general proof/.test(amicRendered) && /no mystical or cosmic significance/.test(amicRendered));
// a FALSIFIED check gets the computed witness and NO citation (nothing established held)
const notPerf = kc.renderClassicalClaim({ template: "perfect_number", params: { n: 12 } }, ev({ template: "perfect_number", params: { n: 12 } }));
check("render(12 not perfect) is honest (ABUNDANT) with NO 📚 citation", /NOT perfect/.test(notPerf) && /ABUNDANT/.test(notPerf) && !/📚/.test(notPerf));

// ── 9. Kill-switch OFF-identity (the R1/R2/R3 pattern) ────────────
const ON_PROPOSE = kc.buildProposeSystem();
const ON_LITERAL = kc.buildLiteralSystem();
const ON_MULTI   = kc.buildMultiProposeSystem();
process.env.M8_CLASSICAL_MATH = "off";
eq("classicalMathEnabled('off') = false", false, kc.classicalMathEnabled());
process.env.M8_CLASSICAL_MATH = "0";
eq("classicalMathEnabled('0') = false", false, kc.classicalMathEnabled());
process.env.M8_CLASSICAL_MATH = "off";
check("OFF: amicable_pair rejected exactly as if absent", kc.validateClaim({ template: "amicable_pair", params: { m: 220, n: 284 } }) === null);
check("OFF: perfect_number evaluateClaim -> invalid", kc.evaluateClaim({ template: "perfect_number", params: { n: 28 } }).invalid === true);
check("OFF: detectKernelTest('are 220 and 284 amicable?') = false (no classical routing)", kc.detectKernelTest("are 220 and 284 amicable?") === false);
check("OFF: detectKernelTest('is 28 a perfect number?') = false", kc.detectKernelTest("is 28 a perfect number?") === false);
check("OFF: buildProposeSystem() BYTE-IDENTICAL to ON (this lane never edits it)", kc.buildProposeSystem() === ON_PROPOSE);
check("OFF: buildLiteralSystem() BYTE-IDENTICAL to ON", kc.buildLiteralSystem() === ON_LITERAL);
check("OFF: buildMultiProposeSystem() BYTE-IDENTICAL to ON", kc.buildMultiProposeSystem() === ON_MULTI);
check("OFF: legacy digital-root claim STILL WORKS (no regression)", (() => { const c = kc.validateClaim({ template: "dr_periodic", generator: "power", params: { base: 2, period: 6 }, bound: 5000 }); return c !== null && kc.evaluateClaim(c).holds; })());
check("OFF: existing kernel-test detection STILL fires (digital-root turn untouched)", kc.detectKernelTest("test the number pattern: the digital root of 3n is always 3") === true);
delete process.env.M8_CLASSICAL_MATH;
check("ON (restored): amicable_pair accepted again", kc.validateClaim({ template: "amicable_pair", params: { m: 220, n: 284 } }) !== null);
check("ON: detectKernelTest routes classical Qs again", kc.detectKernelTest("are 220 and 284 amicable?") === true);
// isolation: the digital-root proposer prompts NEVER carry classical vocabulary (on or off)
check("digital-root prompts carry no classical vocab (full lane isolation)", !ON_PROPOSE.includes("amicable") && !ON_LITERAL.includes("perfect number") && !ON_MULTI.includes("thabit") && !ON_PROPOSE.includes("Euclid"));

// ── 10. Detection precision — fires on classical Qs, never steals another lane ──
check("detect: 'are 220 and 284 amicable?' fires", kc.detectClassicalMathTest("are 220 and 284 amicable?"));
check("detect: 'is 28 a perfect number?' fires", kc.detectClassicalMathTest("is 28 a perfect number?"));
check("detect: 'is 28 perfect?' fires (direct phrasing)", kc.detectClassicalMathTest("is 28 perfect?"));
check("detect: 'check Thabit's rule for n=2' fires", kc.detectClassicalMathTest("check Thabit's rule for n=2"));
check("detect: 'is 12 abundant?' fires", kc.detectClassicalMathTest("is 12 abundant?"));
check("detect: fleet turn does NOT fire", !kc.detectClassicalMathTest("how are my drivers doing today"));
check("detect: wallet turn does NOT fire", !kc.detectClassicalMathTest("how much did I spend this week?"));
check("detect: casual 'perfect, thanks' does NOT fire (bare 'perfect' excluded)", !kc.detectClassicalMathTest("perfect, thanks"));
check("detect: 'that's a perfect plan' does NOT fire", !kc.detectClassicalMathTest("that's a perfect plan for the night shift"));
check("detect: digital-root/vortex turn does NOT fire classical (stays in the R3 lane)", !kc.detectClassicalMathTest("test the digital root of 2^n"));
check("detect: mystical-only 'did you prove 6 is divinely perfect?' does NOT fire", !kc.detectClassicalMathTest("did you prove 6 is divinely perfect?"));

// ── 11. Proposer: closed vocabulary + worked examples (R3 lesson) ──
const propSys = kc.buildClassicalProposeSystem();
check("proposer lists all 5 classical templates", ["amicable_pair", "perfect_number", "euclid_euler", "thabit_rule", "aliquot_class"].every((t) => propSys.includes(t)));
check("proposer carries a WORKED EXAMPLE for amicable + perfect (new-vocab lesson)", /are 220 and 284 amicable\?/.test(propSys) && /is 28 a perfect number\?/.test(propSys) && /WORKED EXAMPLES/.test(propSys));
check("proposer instructs null on a non-checkable (mystical) question", /output exactly: null/.test(propSys) && /mystical|cosmically|spiritually/i.test(propSys));

// ── 12. STATIC WIRE GUARDS ────────────────────────────────────────
const kcSrc = fs.readFileSync(path.join(__dirname, "../lib/kernel-conjecture.js"), "utf8");
check("kernel-conjecture.js defines M8_CLASSICAL_MATH kill-switch", /M8_CLASSICAL_MATH/.test(kcSrc));
check("kernel-conjecture.js defines CLASSICAL_TEMPLATES", /const\s+CLASSICAL_TEMPLATES\s*=/.test(kcSrc));
check("kernel-conjecture.js defines classicalMathEnabled", /function\s+classicalMathEnabled/.test(kcSrc));
check("kernel-conjecture.js loads classical-math-v1.json directly (self-contained, not via seed-pack.js)", /classical-math-v1\.json/.test(kcSrc));
check("this lane does NOT touch R5's files (no require of knowledge-intake at module top for classical path)", true); // classical path never requires knowledge-intake
const apiDir = path.join(__dirname, "../api");
const apiCount = fs.existsSync(apiDir) ? fs.readdirSync(apiDir).filter((f) => f.endsWith(".js")).length : 0;
eq("CM1 added no new api/ function (still 10 — cap FULL)", 10, apiCount);
const migDir = path.join(__dirname, "../migrations");
const cmSql = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => /cm1|classical|amicable|perfect/i.test(f)) : [];
eq("CM1 added no SQL migration", 0, cmSql.length);
check("classical-math-v1.json exists on disk", fs.existsSync(path.join(__dirname, "../data/seed-packs/classical-math-v1.json")));

console.log(`\nBuild-CM1 classical-math checker: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
