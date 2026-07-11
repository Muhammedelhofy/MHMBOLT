/**
 * tests/buildCM3_classical_math_v3.test.js — Build-CM3 "Classical-math checker pack v3" ship gate.
 *
 * A research-lane extension of CM1/CM2 to Pythagorean triples (same shape as CM1 + CM2 + R3 extend-
 * the-checker + R2 curated-cited-seed-pack). Pure-function coverage (no network, no DB, no LLM) for
 * what CM3 closes:
 *   - pyth_triple: a NEW generator-LESS checker template that VERIFIES (not quotes) whether a given
 *     (a,b,c) satisfies a^2+b^2=c^2 by direct computation.
 *   - pyth_primitive: VERIFIES whether a given (a,b,c) is a PRIMITIVE Pythagorean triple
 *     (a^2+b^2=c^2 AND gcd(a,b,c)=1).
 *   - euclid_triple: COMPUTES Euclid's formula (a=m^2-n^2, b=2mn, c=m^2+n^2) at a given m,n and
 *     VERIFIES whether it produces a primitive triple (checking m>n>0, coprime, opposite parity, and
 *     the resulting gcd).
 *   - classical-math-v3 seed pack (R2 schema): 3 seeds bound to the NEW checkers, 2 (leap + context)
 *     honestly unbound. A held check carries a CODE-GUARANTEED 〔citation〕.
 *   - M8_CLASSICAL_MATH_V3 kill-switch (default ON): OFF -> the whole family is rejected exactly as
 *     if absent, detectKernelTest does not route Pythagorean-triple Qs, AND the three digital-root
 *     proposer prompts + the CM1 + CM2 classical proposer prompts are BYTE-IDENTICAL either way (this
 *     lane never edits them — R3 + CM1 + CM2 OFF-identities kept).
 * Plus STATIC WIRE GUARDS: no new api/ fn, no SQL migration, kill-switch + templates present.
 *
 * Run:  node tests/buildCM3_classical_math_v3.test.js
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

// ── 0. Kill-switch default + gating surface ───────────────────────
delete process.env.M8_CLASSICAL_MATH_V3;
eq("classicalMathV3Enabled default ON", true, kc.classicalMathV3Enabled());
check("CLASSICAL_V3_TEMPLATES = the 3 new templates", JSON.stringify(kc.CLASSICAL_V3_TEMPLATES) === JSON.stringify(["pyth_triple", "pyth_primitive", "euclid_triple"]));
check("legacy TEMPLATES array UNCHANGED (4 entries)", JSON.stringify(kc.TEMPLATES) === JSON.stringify(["dr_periodic", "dr_constant", "dr_set", "mod_cycle"]));
check("CM1 CLASSICAL_TEMPLATES UNCHANGED (5 entries)", JSON.stringify(kc.CLASSICAL_TEMPLATES) === JSON.stringify(["amicable_pair", "perfect_number", "euclid_euler", "thabit_rule", "aliquot_class"]));
check("CM2 CLASSICAL_V2_TEMPLATES UNCHANGED (2 entries)", JSON.stringify(kc.CLASSICAL_V2_TEMPLATES) === JSON.stringify(["figurate_identity", "pell_fundamental"]));
check("v3 templates are generator-LESS (not in GENERATORS/BASE_GENERATORS)", !Object.prototype.hasOwnProperty.call(kc.GENERATORS, "pyth_triple") && !Object.prototype.hasOwnProperty.call(kc.BASE_GENERATORS, "euclid_triple"));

// ── 1. pure core: gcd + Euclid's-formula construction ─────────────
eq("gcdInt(12,18)=6", 6, kc.gcdInt(12, 18));
eq("gcdInt(17,5)=1", 1, kc.gcdInt(17, 5));
eq("gcd3(6,8,10)=2", 2, kc.gcd3(6, 8, 10));
eq("gcd3(3,4,5)=1", 1, kc.gcd3(3, 4, 5));
check("euclidTriple(2,1) = (3,4,5)", (() => { const t = kc.euclidTriple(2, 1); return t.a === 3 && t.b === 4 && t.c === 5; })());
check("euclidTriple(3,2) = (5,12,13)", (() => { const t = kc.euclidTriple(3, 2); return t.a === 5 && t.b === 12 && t.c === 13; })());
check("euclidTriple(4,3) = (7,24,25)", (() => { const t = kc.euclidTriple(4, 3); return t.a === 7 && t.b === 24 && t.c === 25; })());
check("euclidTriple(4,2) = (12,16,20) [non-primitive: gcd(m,n)=2]", (() => { const t = kc.euclidTriple(4, 2); return t.a === 12 && t.b === 16 && t.c === 20; })());

// ── 2. pyth_triple — verify a^2+b^2=c^2 by direct computation ─────
for (const [a, b, c] of [[3, 4, 5], [5, 12, 13], [8, 15, 17], [20, 21, 29], [7, 24, 25], [9, 40, 41], [12, 35, 37], [6, 8, 10], [9, 12, 15]]) {
  const r = ev({ template: "pyth_triple", params: { a, b, c } });
  check(`pyth_triple (${a},${b},${c}) HOLDS`, r.holds === true && r.detail.a === a && r.detail.b === b && r.detail.c === c);
}
check("pyth_triple (3,4,6) FALSIFIED (not a triple)", (() => { const r = ev({ template: "pyth_triple", params: { a: 3, b: 4, c: 6 } }); return r.holds === false && r.counterexample.lhs === 25 && r.counterexample.rhs === 36; })());

// ── 3. pyth_primitive — a^2+b^2=c^2 AND gcd(a,b,c)=1 ──────────────
for (const [a, b, c] of [[3, 4, 5], [5, 12, 13], [8, 15, 17], [20, 21, 29], [7, 24, 25], [9, 40, 41], [12, 35, 37]]) {
  const r = ev({ template: "pyth_primitive", params: { a, b, c } });
  check(`pyth_primitive (${a},${b},${c}) HOLDS (primitive)`, r.holds === true && r.detail.gcd === 1);
}
check("pyth_primitive (6,8,10) FALSIFIED (gcd=2, not primitive)", (() => { const r = ev({ template: "pyth_primitive", params: { a: 6, b: 8, c: 10 } }); return r.holds === false && r.detail.gcd === 2 && r.detail.pyth === true; })());
check("pyth_primitive (9,12,15) FALSIFIED (gcd=3, not primitive)", (() => { const r = ev({ template: "pyth_primitive", params: { a: 9, b: 12, c: 15 } }); return r.holds === false && r.detail.gcd === 3; })());
check("pyth_primitive (3,4,6) FALSIFIED (not even a triple)", (() => { const r = ev({ template: "pyth_primitive", params: { a: 3, b: 4, c: 6 } }); return r.holds === false && r.detail.pyth === false; })());

// ── 4. euclid_triple — construct + verify via Euclid's formula ────
for (const [m, n] of [[2, 1], [3, 2], [4, 1], [5, 2], [4, 3], [5, 4], [6, 1], [6, 5]]) {
  const r = ev({ template: "euclid_triple", params: { m, n } });
  check(`euclid_triple m=${m},n=${n} HOLDS (primitive)`, r.holds === true && r.detail.pyth === true && r.detail.preOk === true && r.detail.gcd === 1);
}
check("euclid_triple m=2,n=1 -> (3,4,5)", (() => { const r = ev({ template: "euclid_triple", params: { m: 2, n: 1 } }); return r.detail.a === 3 && r.detail.b === 4 && r.detail.c === 5; })());
check("euclid_triple m=6,n=5 -> (11,60,61)", (() => { const r = ev({ template: "euclid_triple", params: { m: 6, n: 5 } }); return r.detail.a === 11 && r.detail.b === 60 && r.detail.c === 61; })());
check("euclid_triple m=4,n=2 FALSIFIED (not coprime -> not primitive, even though it IS a valid Pythagorean triple)", (() => {
  const r = ev({ template: "euclid_triple", params: { m: 4, n: 2 } });
  return r.holds === false && r.detail.pyth === true && r.detail.preOk === false && r.detail.a === 12 && r.detail.b === 16 && r.detail.c === 20 && r.detail.gcd === 4;
})());
check("euclid_triple m=3,n=1 FALSIFIED (both odd -> same parity, not primitive)", (() => {
  const r = ev({ template: "euclid_triple", params: { m: 3, n: 1 } });
  return r.holds === false && r.detail.preOk === false && (r.detail.m % 2) === (r.detail.n % 2);
})());

// ── 5. validateClaim boundary caps (the anti-smuggling gate) ──────
check("pyth_triple rejects a non-integer", kc.validateClaim({ template: "pyth_triple", params: { a: 3.5, b: 4, c: 5 } }) === null);
check("pyth_triple rejects a<1", kc.validateClaim({ template: "pyth_triple", params: { a: 0, b: 4, c: 5 } }) === null);
check("pyth_triple rejects a>TRIPLE_MAX", kc.validateClaim({ template: "pyth_triple", params: { a: kc.TRIPLE_MAX + 1, b: 4, c: 5 } }) === null);
check("pyth_triple accepts a=TRIPLE_MAX boundary", kc.validateClaim({ template: "pyth_triple", params: { a: kc.TRIPLE_MAX, b: 4, c: 5 } }) !== null);
check("pyth_primitive rejects the same caps", kc.validateClaim({ template: "pyth_primitive", params: { a: -1, b: 4, c: 5 } }) === null);
check("euclid_triple rejects m<=n (degenerate, no valid construction)", kc.validateClaim({ template: "euclid_triple", params: { m: 2, n: 2 } }) === null);
check("euclid_triple rejects n<1", kc.validateClaim({ template: "euclid_triple", params: { m: 2, n: 0 } }) === null);
check("euclid_triple rejects m<n", kc.validateClaim({ template: "euclid_triple", params: { m: 1, n: 2 } }) === null);
check("euclid_triple rejects m>EUCLID_MN_MAX", kc.validateClaim({ template: "euclid_triple", params: { m: kc.EUCLID_MN_MAX + 1, n: 1 } }) === null);
check("euclid_triple accepts m=2,n=1", kc.validateClaim({ template: "euclid_triple", params: { m: 2, n: 1 } }) !== null);
check("euclid_triple ACCEPTS a non-coprime/same-parity (m,n) — that's a testable-false instance, not off-schema", kc.validateClaim({ template: "euclid_triple", params: { m: 4, n: 2 } }) !== null);

// ── 6. the seed pack (R2 schema) + code-guaranteed citation ───────
const pack = require("../data/seed-packs/classical-math-v3.json");
eq("classical-math-v3 has 5 curated seeds", 5, pack.seeds.length);
check("every seed passes the R2 validateSeed schema (0 errors)", pack.seeds.every((s) => sp.validateSeed(s).length === 0));
check("all seed ids unique", new Set(pack.seeds.map((s) => s.id)).size === 5);
const boundIds = pack.seeds.filter((s) => s.matches_templates.length > 0).map((s) => s.id).sort();
eq("exactly 3 seeds bound to the NEW checkers", "euclid-formula-primitive-triples,primitive-pythagorean-triple-definition,pythagorean-triple-definition", boundIds.join(","));
const unboundIds = pack.seeds.filter((s) => s.matches_templates.length === 0).map((s) => s.id).sort();
eq("exactly 2 seeds honestly unbound (leap + context)", "plimpton-322-predates-pythagoras,pythagorean-sacred-triangle-leap", unboundIds.join(","));
check("every matches_templates entry binds a template that EXISTS after this build (no phantom)", pack.seeds.every((s) => s.matches_templates.every((pat) => kc.CLASSICAL_V3_TEMPLATES.includes(String(pat).split(":")[0]))));
check("classicalV3SeedMatch(pyth_triple) -> the definition seed", (() => { const m = kc.classicalV3SeedMatch({ template: "pyth_triple" }); return m && m.id === "pythagorean-triple-definition" && /Euclid/.test(m.citation); })());
check("classicalV3SeedMatch(pyth_primitive) -> the primitive-definition seed", (() => { const m = kc.classicalV3SeedMatch({ template: "pyth_primitive" }); return m && m.id === "primitive-pythagorean-triple-definition" && /MathWorld/.test(m.citation); })());
check("classicalV3SeedMatch(euclid_triple) -> the Euclid's-formula seed (cites Book X Lemma 1)", (() => { const m = kc.classicalV3SeedMatch({ template: "euclid_triple" }); return m && m.id === "euclid-formula-primitive-triples" && /Book X/.test(m.citation); })());
check("a template with no binding matches NO seed", kc.classicalV3SeedMatch({ template: "bogus_template" }) === null);
check("leap seed carries matches_templates [] (never a phantom binding)", pack.seeds.find((s) => s.id === "pythagorean-sacred-triangle-leap").matches_templates.length === 0);
check("context seed carries matches_templates [] (never a phantom binding)", pack.seeds.find((s) => s.id === "plimpton-322-predates-pythagoras").matches_templates.length === 0);
check("Euclid's-formula seed citation names Book X (verify-not-quote attribution)", (() => { const s = pack.seeds.find((x) => x.id === "euclid-formula-primitive-triples"); return /Book X/.test(s.source_citation) && /Lemma 1/.test(s.source_citation); })());
check("leap seed citation names Plutarch + De Iside et Osiride + section 56", (() => { const s = pack.seeds.find((x) => x.id === "pythagorean-sacred-triangle-leap"); return /Plutarch/.test(s.source_citation) && /De Iside/.test(s.source_citation) && /56/.test(s.source_citation); })());
check("context seed names Plimpton 322 + predates Pythagoras", (() => { const s = pack.seeds.find((x) => x.id === "plimpton-322-predates-pythagoras"); return /Plimpton 322/.test(s.source_citation) && /Babylonian/.test(s.statement); })());

// render() CODE-GUARANTEES the citation on a held check (R4 lesson: a required line is emitted, not hoped)
const tripleRendered = kc.renderClassicalV3Claim({ template: "pyth_triple", params: { a: 3, b: 4, c: 5 } }, ev({ template: "pyth_triple", params: { a: 3, b: 4, c: 5 } }));
check("render(pyth_triple 3,4,5) carries VERIFIED + 📚 + Euclid citation", /VERIFIED/.test(tripleRendered) && /📚/.test(tripleRendered) && /Euclid/.test(tripleRendered) && /〔/.test(tripleRendered));
const primRendered = kc.renderClassicalV3Claim({ template: "pyth_primitive", params: { a: 20, b: 21, c: 29 } }, ev({ template: "pyth_primitive", params: { a: 20, b: 21, c: 29 } }));
check("render(pyth_primitive 20,21,29) carries VERIFIED + PRIMITIVE + 📚 + MathWorld citation", /VERIFIED/.test(primRendered) && /PRIMITIVE/.test(primRendered) && /📚/.test(primRendered) && /MathWorld/.test(primRendered));
const euclidRendered = kc.renderClassicalV3Claim({ template: "euclid_triple", params: { m: 2, n: 1 } }, ev({ template: "euclid_triple", params: { m: 2, n: 1 } }));
check("render(euclid_triple m=2,n=1) carries VERIFIED + (3,4,5) + 📚 + Book X citation", /VERIFIED/.test(euclidRendered) && /\(3, 4, 5\)/.test(euclidRendered) && /📚/.test(euclidRendered) && /Book X/.test(euclidRendered));
const notPrimRendered = kc.renderClassicalV3Claim({ template: "pyth_primitive", params: { a: 6, b: 8, c: 10 } }, ev({ template: "pyth_primitive", params: { a: 6, b: 8, c: 10 } }));
check("render(pyth_primitive 6,8,10 -- NOT primitive) is honest ❌, NO citation", /❌/.test(notPrimRendered) && !/📚/.test(notPrimRendered));
check("render always carries the honest 'not a general proof' + 'no sacred' coda", /not a general proof/.test(tripleRendered) && /sacred/.test(tripleRendered) && /no mystical/.test(tripleRendered));

// ── 7. Kill-switch OFF-identity (the R1/R2/R3/CM1/CM2 pattern) ─────
const ON_PROPOSE    = kc.buildProposeSystem();
const ON_LITERAL    = kc.buildLiteralSystem();
const ON_MULTI      = kc.buildMultiProposeSystem();
const ON_CLASSICAL  = kc.buildClassicalProposeSystem();     // CM1's proposer — this lane must not touch it
const ON_CLASSICAL2 = kc.buildClassicalV2ProposeSystem();   // CM2's proposer — this lane must not touch it
process.env.M8_CLASSICAL_MATH_V3 = "off";
eq("classicalMathV3Enabled('off') = false", false, kc.classicalMathV3Enabled());
process.env.M8_CLASSICAL_MATH_V3 = "0";
eq("classicalMathV3Enabled('0') = false", false, kc.classicalMathV3Enabled());
process.env.M8_CLASSICAL_MATH_V3 = "off";
check("OFF: pyth_triple rejected exactly as if absent", kc.validateClaim({ template: "pyth_triple", params: { a: 3, b: 4, c: 5 } }) === null);
check("OFF: euclid_triple evaluateClaim -> invalid", kc.evaluateClaim({ template: "euclid_triple", params: { m: 2, n: 1 } }).invalid === true);
check("OFF: isTemplateAllowed('pyth_primitive') = false", kc.isTemplateAllowed("pyth_primitive") === false);
check("OFF: detectKernelTest('is (3,4,5) a Pythagorean triple?') = false (no v3 routing)", kc.detectKernelTest("is (3,4,5) a Pythagorean triple?") === false);
check("OFF: detectKernelTest('generate a primitive triple from m=2, n=1') = false", kc.detectKernelTest("generate a primitive triple from m=2, n=1") === false);
check("OFF: buildProposeSystem() BYTE-IDENTICAL to ON (digital-root lane untouched)", kc.buildProposeSystem() === ON_PROPOSE);
check("OFF: buildLiteralSystem() BYTE-IDENTICAL to ON", kc.buildLiteralSystem() === ON_LITERAL);
check("OFF: buildMultiProposeSystem() BYTE-IDENTICAL to ON", kc.buildMultiProposeSystem() === ON_MULTI);
check("OFF: buildClassicalProposeSystem() BYTE-IDENTICAL to ON (CM1 proposer untouched)", kc.buildClassicalProposeSystem() === ON_CLASSICAL);
check("OFF: buildClassicalV2ProposeSystem() BYTE-IDENTICAL to ON (CM2 proposer untouched)", kc.buildClassicalV2ProposeSystem() === ON_CLASSICAL2);
check("OFF: legacy digital-root claim STILL WORKS (no regression)", (() => { const c = kc.validateClaim({ template: "dr_periodic", generator: "power", params: { base: 2, period: 6 }, bound: 5000 }); return c !== null && kc.evaluateClaim(c).holds; })());
check("OFF: CM1 amicable check STILL WORKS (no cross-regression)", kc.evaluateClaim({ template: "amicable_pair", params: { m: 220, n: 284 } }).holds === true);
check("OFF: CM2 figurate check STILL WORKS (no cross-regression)", kc.evaluateClaim({ template: "figurate_identity", params: { kind: "nicomachus_cubes" } }).holds === true);
check("OFF: CM1 detection STILL fires (classical lane untouched)", kc.detectKernelTest("are 220 and 284 amicable?") === true);
check("OFF: CM2 detection STILL fires (classical-v2 lane untouched)", kc.detectKernelTest("is every hexagonal number triangular?") === true);
delete process.env.M8_CLASSICAL_MATH_V3;
check("ON (restored): pyth_triple accepted again", kc.validateClaim({ template: "pyth_triple", params: { a: 3, b: 4, c: 5 } }) !== null);
check("ON: detectKernelTest routes Pythagorean-triple Qs again", kc.detectKernelTest("is (3,4,5) a Pythagorean triple?") === true && kc.detectKernelTest("does Euclid's formula give a primitive triple for m=4, n=2?") === true);
const V3_ONLY = ["pyth_triple", "pyth_primitive", "euclid_triple", "Euclid's formula", "Plutarch"];
check("digital-root + CM1 + CM2 prompts carry no CM3-specific vocab (full lane isolation)", V3_ONLY.every((tok) => !ON_PROPOSE.includes(tok) && !ON_LITERAL.includes(tok) && !ON_MULTI.includes(tok) && !ON_CLASSICAL.includes(tok) && !ON_CLASSICAL2.includes(tok)));

// ── 8. Detection precision — fires on Pythagorean-triple phrasing, never steals another lane ──
check("detect: 'is (3,4,5) a Pythagorean triple?' fires", kc.detectClassicalMathV3Test("is (3,4,5) a Pythagorean triple?"));
check("detect: 'generate a primitive triple from m=2, n=1' fires", kc.detectClassicalMathV3Test("generate a primitive triple from m=2, n=1"));
check("detect: 'does Euclid's formula give a primitive triple for m=4, n=2?' fires", kc.detectClassicalMathV3Test("does Euclid's formula give a primitive triple for m=4, n=2?"));
check("detect: 'is 6,8,10 a primitive Pythagorean triple?' fires", kc.detectClassicalMathV3Test("is 6,8,10 a primitive Pythagorean triple?"));
check("detect: fleet turn does NOT fire", !kc.detectClassicalMathV3Test("how are my drivers doing today"));
check("detect: wallet turn does NOT fire", !kc.detectClassicalMathV3Test("how much did I spend this week?"));
check("detect: digital-root turn does NOT fire (R3 lane owns it)", !kc.detectClassicalMathV3Test("test the digital root of 2^n"));
check("detect: CM1 'are 220 and 284 amicable?' does NOT fire v3 (disjoint from CM1)", !kc.detectClassicalMathV3Test("are 220 and 284 amicable?"));
check("detect: CM2 'is every hexagonal number triangular?' does NOT fire v3 (disjoint from CM2)", !kc.detectClassicalMathV3Test("is every hexagonal number triangular?"));
check("detect: mystical-only 'is the 3-4-5 triangle sacred?' does NOT fire (mirrors the CM2 precedent — the general honesty spine handles pure mysticism, not this checker)", !kc.detectClassicalMathV3Test("is the 3-4-5 triangle sacred?"));
check("detect: 'did you prove the 3-4-5 triangle is sacred?' does NOT fire", !kc.detectClassicalMathV3Test("did you prove the 3-4-5 triangle is sacred?"));

// ── 9. Proposer: closed vocabulary + worked examples (R3 lesson) ──
const propSys = kc.buildClassicalV3ProposeSystem();
check("proposer lists all 3 v3 templates", propSys.includes("pyth_triple") && propSys.includes("pyth_primitive") && propSys.includes("euclid_triple"));
check("proposer carries WORKED EXAMPLES for a triple check + Euclid's formula (new-vocab lesson)", /is \(3,4,5\) a Pythagorean triple\?/.test(propSys) && /generate a primitive triple from m=2, n=1/.test(propSys) && /WORKED EXAMPLES/.test(propSys));
check("proposer instructs null on a non-checkable (mystical / out-of-range) question", /output exactly: null/.test(propSys) && /mystical|sacred/i.test(propSys));

// ── 10. STATIC WIRE GUARDS ────────────────────────────────────────
const kcSrc = fs.readFileSync(path.join(__dirname, "../lib/kernel-conjecture.js"), "utf8");
check("kernel-conjecture.js defines M8_CLASSICAL_MATH_V3 kill-switch", /M8_CLASSICAL_MATH_V3/.test(kcSrc));
check("kernel-conjecture.js defines CLASSICAL_V3_TEMPLATES", /const\s+CLASSICAL_V3_TEMPLATES\s*=/.test(kcSrc));
check("kernel-conjecture.js defines classicalMathV3Enabled", /function\s+classicalMathV3Enabled/.test(kcSrc));
check("kernel-conjecture.js defines euclidTriple + gcd3 (no BigInt needed — exact in Number)", /function\s+euclidTriple/.test(kcSrc) && /function\s+gcd3/.test(kcSrc));
check("kernel-conjecture.js loads classical-math-v3.json directly (self-contained)", /classical-math-v3\.json/.test(kcSrc));
check("kernel-conjecture.js defines detectClassicalMathV3Test", /function\s+detectClassicalMathV3Test/.test(kcSrc));
const apiDir = path.join(__dirname, "../api");
const apiCount = fs.existsSync(apiDir) ? fs.readdirSync(apiDir).filter((f) => f.endsWith(".js")).length : 0;
eq("CM3 added no new api/ function (still 10 — cap FULL)", 10, apiCount);
const migDir = path.join(__dirname, "../migrations");
const cmSql = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => /cm3|pythagorean|euclid.*triple/i.test(f)) : [];
eq("CM3 added no SQL migration", 0, cmSql.length);
check("classical-math-v3.json exists on disk", fs.existsSync(path.join(__dirname, "../data/seed-packs/classical-math-v3.json")));
check("CM1's classical-math-v1.json left UNTOUCHED (still 6 seeds)", require("../data/seed-packs/classical-math-v1.json").seeds.length === 6);
check("CM2's classical-math-v2.json left UNTOUCHED (still 6 seeds)", require("../data/seed-packs/classical-math-v2.json").seeds.length === 6);

console.log(`\nBuild-CM3 classical-math checker v3: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
