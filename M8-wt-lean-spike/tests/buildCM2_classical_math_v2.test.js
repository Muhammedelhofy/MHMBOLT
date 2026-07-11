/**
 * tests/buildCM2_classical_math_v2.test.js — Build-CM2 "Classical-math checker pack v2" ship gate.
 *
 * A research-lane extension of CM1 to two more classical-canon families (same shape as CM1 +
 * R3 extend-the-checker + R2 curated-cited-seed-pack). Pure-function coverage (no network, no DB,
 * no LLM) for what CM2 closes:
 *   - figurate_identity: a NEW generator-LESS checker template that VERIFIES (not quotes) a classical
 *     figurate identity by DIRECT computation of BOTH sides over a bounded range —
 *       · hexagonal_triangular            H(n) = T(2n-1)
 *       · nicomachus_cubes                1^3+..+n^3 = T(n)^2  (Nicomachus's theorem)
 *       · square_consecutive_triangular   n^2 = T(n-1)+T(n)
 *     Every identity is checked to hold across the range; the exactness cap is < 2^53.
 *   - pell_fundamental: a NEW generator-LESS template that COMPUTES the fundamental solution of
 *     x^2 - N*y^2 = 1 from the sqrt(N) continued fraction and VERIFIES it in BigInt — incl. the
 *     famous N=61 -> (1766319049, 226153980), plus N=2,3,5,6,7,13,109,149.
 *   - classical-math-v2 seed pack (R2 schema): 4 seeds bound to the NEW checkers, 2 (leap + misnomer)
 *     honestly unbound. A held check carries a CODE-GUARANTEED 〔citation〕.
 *   - M8_CLASSICAL_MATH_V2 kill-switch (default ON): OFF -> the whole family is rejected exactly as
 *     if absent, detectKernelTest does not route figurate/Pell Qs, AND the three digital-root proposer
 *     prompts + the CM1 classical proposer prompt are BYTE-IDENTICAL either way (this lane never edits
 *     them — R3 + CM1 OFF-identities kept).
 * Plus STATIC WIRE GUARDS: no new api/ fn, no SQL migration, kill-switch + templates present.
 *
 * Run:  node tests/buildCM2_classical_math_v2.test.js
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
const MAXSAFE = Number.MAX_SAFE_INTEGER;

// ── 0. Kill-switch default + gating surface ───────────────────────
delete process.env.M8_CLASSICAL_MATH_V2;
eq("classicalMathV2Enabled default ON", true, kc.classicalMathV2Enabled());
check("CLASSICAL_V2_TEMPLATES = the 2 new templates", JSON.stringify(kc.CLASSICAL_V2_TEMPLATES) === JSON.stringify(["figurate_identity", "pell_fundamental"]));
check("FIGURATE_KINDS = the 3 established identities", JSON.stringify(kc.FIGURATE_KINDS) === JSON.stringify(["hexagonal_triangular", "nicomachus_cubes", "square_consecutive_triangular"]));
check("legacy TEMPLATES array UNCHANGED (4 entries)", JSON.stringify(kc.TEMPLATES) === JSON.stringify(["dr_periodic", "dr_constant", "dr_set", "mod_cycle"]));
check("CM1 CLASSICAL_TEMPLATES UNCHANGED (5 entries)", JSON.stringify(kc.CLASSICAL_TEMPLATES) === JSON.stringify(["amicable_pair", "perfect_number", "euclid_euler", "thabit_rule", "aliquot_class"]));
check("v2 templates are generator-LESS (not in GENERATORS/BASE_GENERATORS)", !Object.prototype.hasOwnProperty.call(kc.GENERATORS, "figurate_identity") && !Object.prototype.hasOwnProperty.call(kc.BASE_GENERATORS, "pell_fundamental"));

// ── 1. pure core: figurate builders + pellFundamental ─────────────
eq("T(1)=1", 1, kc.triangularNum(1));
eq("T(2n-1) at n=1 is T(1)=1", 1, kc.triangularNum(1));
eq("H(1)=1", 1, kc.hexagonalNum(1));
eq("H(2)=6", 6, kc.hexagonalNum(2));
eq("H(3)=15", 15, kc.hexagonalNum(3));
eq("H(4)=28 = T(7)", kc.triangularNum(7), kc.hexagonalNum(4));
check("checkFigurateIdentity hexagonal_triangular holds to 10000", kc.checkFigurateIdentity("hexagonal_triangular", 10000).holds === true);
check("checkFigurateIdentity nicomachus_cubes holds to 10000", kc.checkFigurateIdentity("nicomachus_cubes", 10000).holds === true);
check("checkFigurateIdentity square_consecutive_triangular holds to 10000", kc.checkFigurateIdentity("square_consecutive_triangular", 10000).holds === true);
check("checkFigurateIdentity unknown kind -> invalid", kc.checkFigurateIdentity("bogus", 100).invalid === true);
check("pellFundamental(61) = (1766319049, 226153980) [BigInt]", (() => { const s = kc.pellFundamental(61); return s && s.x === 1766319049n && s.y === 226153980n; })());
check("pellFundamental(2) = (3,2)", (() => { const s = kc.pellFundamental(2); return s && s.x === 3n && s.y === 2n; })());
check("pellFundamental(4) [perfect square] = null", kc.pellFundamental(4) === null);
check("pellFundamental returns BigInt x,y (not Number)", (() => { const s = kc.pellFundamental(13); return typeof s.x === "bigint" && typeof s.y === "bigint"; })());

// ── 2. figurate_identity — every established identity VERIFIES over the default range ──
for (const kind of ["hexagonal_triangular", "nicomachus_cubes", "square_consecutive_triangular"]) {
  const r = ev({ template: "figurate_identity", params: { kind } });
  check(`figurate_identity ${kind} HOLDS (default range) + checkedTo=10000`, r.holds && r.checkedTo === 10000 && r.detail.kind === kind);
}
// exactness ceiling: at FIGURATE_N_MAX the sum-of-cubes RHS T(n)^2 stays < 2^53, and the identity still holds
check("figurate exactness: T(FIGURATE_N_MAX)^2 < 2^53 (no float error)", kc.triangularNum(kc.FIGURATE_N_MAX) ** 2 < MAXSAFE);
check("figurate exactness: nicomachus_cubes HOLDS at FIGURATE_N_MAX (13000)", kc.checkFigurateIdentity("nicomachus_cubes", kc.FIGURATE_N_MAX).holds === true);
check("figurate exactness: T(FIGURATE_N_MAX+1000)^2 WOULD exceed 2^53 (why the cap exists)", kc.triangularNum(kc.FIGURATE_N_MAX + 1000) ** 2 > MAXSAFE);

// ── 3. pell_fundamental — the canon, verified in BigInt by direct computation ──
const PELL_KNOWN = { 2: ["3", "2"], 3: ["2", "1"], 5: ["9", "4"], 6: ["5", "2"], 7: ["8", "3"], 13: ["649", "180"], 61: ["1766319049", "226153980"], 109: ["158070671986249", "15140424455100"], 149: ["25801741449", "2113761020"] };
for (const N of Object.keys(PELL_KNOWN).map(Number)) {
  const r = ev({ template: "pell_fundamental", params: { N } });
  const [ex, ey] = PELL_KNOWN[N];
  check(`pell N=${N} HOLDS + (x,y)=(${ex},${ey}) + x^2-N y^2=1`, r.holds && r.detail.x === ex && r.detail.y === ey && r.detail.lhs === "1");
}
check("pell HEADLINE N=61 detail carries the full BigInt solution as strings", (() => { const r = ev({ template: "pell_fundamental", params: { N: 61 } }); return r.detail.x === "1766319049" && r.detail.y === "226153980" && r.detail.cfTerms > 0; })());

// ── 4. validateClaim boundary caps (the anti-smuggling gate) ──────
check("figurate_identity rejects an unknown kind", kc.validateClaim({ template: "figurate_identity", params: { kind: "pentagonal_magic" } }) === null);
check("figurate_identity accepts a valid kind + defaults bound to 10000", (() => { const c = kc.validateClaim({ template: "figurate_identity", params: { kind: "nicomachus_cubes" } }); return c && c.params.kind === "nicomachus_cubes" && c.params.bound === kc.FIGURATE_N_DEFAULT; })());
check("figurate_identity clamps an over-cap bound down to FIGURATE_N_MAX", (() => { const c = kc.validateClaim({ template: "figurate_identity", params: { kind: "nicomachus_cubes", bound: 999999 } }); return c && c.params.bound === kc.FIGURATE_N_MAX; })());
check("figurate_identity clamps a tiny bound up to FIGURATE_N_MIN", (() => { const c = kc.validateClaim({ template: "figurate_identity", params: { kind: "hexagonal_triangular", bound: 1 } }); return c && c.params.bound === kc.FIGURATE_N_MIN; })());
check("pell_fundamental rejects N < PELL_N_MIN", kc.validateClaim({ template: "pell_fundamental", params: { N: 1 } }) === null);
check("pell_fundamental rejects N > PELL_N_MAX", kc.validateClaim({ template: "pell_fundamental", params: { N: kc.PELL_N_MAX + 1 } }) === null);
check("pell_fundamental rejects a perfect-square N (no non-trivial solution)", kc.validateClaim({ template: "pell_fundamental", params: { N: 49 } }) === null);
check("pell_fundamental rejects a non-integer N", kc.validateClaim({ template: "pell_fundamental", params: { N: 61.5 } }) === null);
check("pell_fundamental accepts N=61", kc.validateClaim({ template: "pell_fundamental", params: { N: 61 } }) !== null);

// ── 5. the seed pack (R2 schema) + code-guaranteed citation ───────
const pack = require("../data/seed-packs/classical-math-v2.json");
eq("classical-math-v2 has 6 curated seeds", 6, pack.seeds.length);
check("every seed passes the R2 validateSeed schema (0 errors)", pack.seeds.every((s) => sp.validateSeed(s).length === 0));
check("all seed ids unique", new Set(pack.seeds.map((s) => s.id)).size === 6);
const boundIds = pack.seeds.filter((s) => s.matches_templates.length > 0).map((s) => s.id).sort();
eq("exactly 4 seeds bound to the NEW checkers", "hexagonal-are-triangular,nicomachus-sum-of-cubes,pell-fundamental-cf,square-consecutive-triangulars", boundIds.join(","));
const unboundIds = pack.seeds.filter((s) => s.matches_templates.length === 0).map((s) => s.id).sort();
eq("exactly 2 seeds honestly unbound (leap + misnomer)", "figurate-sacred-geometry-leap,pell-name-misnomer", unboundIds.join(","));
check("every matches_templates entry binds a template that EXISTS after this build (no phantom)", pack.seeds.every((s) => s.matches_templates.every((pat) => kc.CLASSICAL_V2_TEMPLATES.includes(String(pat).split(":")[0]))));
check("figurate seeds pin ONE kind via template:slot=val", pack.seeds.filter((s) => s.matches_templates.some((p) => p.startsWith("figurate_identity:kind="))).length === 3);
check("classicalV2SeedMatch(nicomachus_cubes) -> the Nicomachus seed", (() => { const m = kc.classicalV2SeedMatch({ template: "figurate_identity", kind: "nicomachus_cubes" }); return m && m.id === "nicomachus-sum-of-cubes" && /Nicomachus/.test(m.citation); })());
check("classicalV2SeedMatch(hexagonal_triangular) -> the hexagonal seed", (() => { const m = kc.classicalV2SeedMatch({ template: "figurate_identity", kind: "hexagonal_triangular" }); return m && m.id === "hexagonal-are-triangular"; })());
check("classicalV2SeedMatch(square_consecutive_triangular) -> the square seed", (() => { const m = kc.classicalV2SeedMatch({ template: "figurate_identity", kind: "square_consecutive_triangular" }); return m && m.id === "square-consecutive-triangulars"; })());
check("classicalV2SeedMatch(pell_fundamental) -> the Pell seed (cites Brahmagupta + Bhaskara)", (() => { const m = kc.classicalV2SeedMatch({ template: "pell_fundamental", N: 61 }); return m && m.id === "pell-fundamental-cf" && /Brahmagupta/.test(m.citation) && /Bhaskara/.test(m.citation); })());
check("a WRONG figurate kind matches NO seed (slot condition enforced)", kc.classicalV2SeedMatch({ template: "figurate_identity", kind: "not_a_real_kind" }) === null);
check("leap seed carries matches_templates [] (never a phantom binding)", pack.seeds.find((s) => s.id === "figurate-sacred-geometry-leap").matches_templates.length === 0);
check("Pell seed citation names Brahmagupta AND Bhaskara (verify-not-quote attribution)", (() => { const s = pack.seeds.find((x) => x.id === "pell-fundamental-cf"); return /Brahmagupta/.test(s.source_citation) && /Bhaskara/.test(s.source_citation); })());
check("Pell seed statement notes the 'Pell' misnomer + records the 61 figure", (() => { const s = pack.seeds.find((x) => x.id === "pell-fundamental-cf"); return /misnomer/.test(s.statement) && /1766319049/.test(s.statement); })());
check("misnomer seed explains Euler's misattribution to John Pell", (() => { const s = pack.seeds.find((x) => x.id === "pell-name-misnomer"); return /Euler/.test(s.source_citation) && /Pell/.test(s.statement); })());

// render() CODE-GUARANTEES the citation on a held check (R4 lesson: a required line is emitted, not hoped)
const pellRendered = kc.renderClassicalV2Claim({ template: "pell_fundamental", params: { N: 61 } }, ev({ template: "pell_fundamental", params: { N: 61 } }));
check("render(x^2-61y^2=1) carries VERIFIED + the (1766319049,226153980) solution + 📚 〔Brahmagupta/Bhaskara〕", /VERIFIED/.test(pellRendered) && /1766319049/.test(pellRendered) && /226153980/.test(pellRendered) && /📚/.test(pellRendered) && /Brahmagupta/.test(pellRendered) && /Bhaskara/.test(pellRendered) && /〔/.test(pellRendered));
const nicoRendered = kc.renderClassicalV2Claim({ template: "figurate_identity", params: { kind: "nicomachus_cubes" } }, ev({ template: "figurate_identity", params: { kind: "nicomachus_cubes" } }));
check("render(nicomachus_cubes) carries VERIFIED + 📚 + Nicomachus citation", /VERIFIED/.test(nicoRendered) && /📚/.test(nicoRendered) && /Nicomachus/.test(nicoRendered));
const hexRendered = kc.renderClassicalV2Claim({ template: "figurate_identity", params: { kind: "hexagonal_triangular" } }, ev({ template: "figurate_identity", params: { kind: "hexagonal_triangular" } }));
check("render always carries the honest 'not a general proof' + 'no sacred-geometry significance' coda", /not a general proof/.test(hexRendered) && /sacred-geometry/.test(hexRendered) && /no mystical/.test(hexRendered));

// ── 6. Kill-switch OFF-identity (the R1/R2/R3/CM1 pattern) ─────────
const ON_PROPOSE   = kc.buildProposeSystem();
const ON_LITERAL   = kc.buildLiteralSystem();
const ON_MULTI     = kc.buildMultiProposeSystem();
const ON_CLASSICAL = kc.buildClassicalProposeSystem();   // CM1's proposer — this lane must not touch it
process.env.M8_CLASSICAL_MATH_V2 = "off";
eq("classicalMathV2Enabled('off') = false", false, kc.classicalMathV2Enabled());
process.env.M8_CLASSICAL_MATH_V2 = "0";
eq("classicalMathV2Enabled('0') = false", false, kc.classicalMathV2Enabled());
process.env.M8_CLASSICAL_MATH_V2 = "off";
check("OFF: figurate_identity rejected exactly as if absent", kc.validateClaim({ template: "figurate_identity", params: { kind: "nicomachus_cubes" } }) === null);
check("OFF: pell_fundamental evaluateClaim -> invalid", kc.evaluateClaim({ template: "pell_fundamental", params: { N: 61 } }).invalid === true);
check("OFF: isTemplateAllowed('figurate_identity') = false", kc.isTemplateAllowed("figurate_identity") === false);
check("OFF: detectKernelTest('is every hexagonal number triangular?') = false (no v2 routing)", kc.detectKernelTest("is every hexagonal number triangular?") === false);
check("OFF: detectKernelTest('smallest solution to x^2 - 61 y^2 = 1?') = false", kc.detectKernelTest("smallest solution to x^2 - 61 y^2 = 1?") === false);
check("OFF: buildProposeSystem() BYTE-IDENTICAL to ON (digital-root lane untouched)", kc.buildProposeSystem() === ON_PROPOSE);
check("OFF: buildLiteralSystem() BYTE-IDENTICAL to ON", kc.buildLiteralSystem() === ON_LITERAL);
check("OFF: buildMultiProposeSystem() BYTE-IDENTICAL to ON", kc.buildMultiProposeSystem() === ON_MULTI);
check("OFF: buildClassicalProposeSystem() BYTE-IDENTICAL to ON (CM1 proposer untouched)", kc.buildClassicalProposeSystem() === ON_CLASSICAL);
check("OFF: legacy digital-root claim STILL WORKS (no regression)", (() => { const c = kc.validateClaim({ template: "dr_periodic", generator: "power", params: { base: 2, period: 6 }, bound: 5000 }); return c !== null && kc.evaluateClaim(c).holds; })());
check("OFF: CM1 amicable check STILL WORKS (no cross-regression)", kc.evaluateClaim({ template: "amicable_pair", params: { m: 220, n: 284 } }).holds === true);
check("OFF: CM1 detection STILL fires (classical lane untouched)", kc.detectKernelTest("are 220 and 284 amicable?") === true);
delete process.env.M8_CLASSICAL_MATH_V2;
check("ON (restored): figurate_identity accepted again", kc.validateClaim({ template: "figurate_identity", params: { kind: "nicomachus_cubes" } }) !== null);
check("ON: detectKernelTest routes figurate/Pell Qs again", kc.detectKernelTest("is every hexagonal number triangular?") === true && kc.detectKernelTest("smallest solution to x^2 - 61 y^2 = 1?") === true);
// isolation: the digital-root + CM1 proposer prompts NEVER carry CM2-SPECIFIC vocabulary. (Note the
// digital-root prompt legitimately describes its pentagonal/hexagonal GENERATORS as "figurate" — that
// is pre-CM2 R3 vocab, not leakage — so we assert on tokens that are genuinely CM2-only.)
const V2_ONLY = ["pell_fundamental", "figurate_identity", "chakravala", "nicomachus_cubes", "continued fraction"];
check("digital-root + CM1 prompts carry no CM2-specific vocab (full lane isolation)", V2_ONLY.every((tok) => !ON_PROPOSE.includes(tok) && !ON_LITERAL.includes(tok) && !ON_MULTI.includes(tok) && !ON_CLASSICAL.includes(tok)));

// ── 7. Detection precision — fires on figurate/Pell, never steals another lane ──
check("detect: 'is every hexagonal number triangular?' fires", kc.detectClassicalMathV2Test("is every hexagonal number triangular?"));
check("detect: 'smallest solution to x^2 - 61 y^2 = 1?' fires", kc.detectClassicalMathV2Test("smallest solution to x^2 - 61 y^2 = 1?"));
check("detect: 'solve Pell's equation for N=109' fires", kc.detectClassicalMathV2Test("solve Pell's equation for N=109"));
check("detect: 'is the sum of the first n cubes a perfect square?' fires", kc.detectClassicalMathV2Test("is the sum of the first n cubes a perfect square?"));
check("detect: 'does Nicomachus's theorem hold?' fires", kc.detectClassicalMathV2Test("does Nicomachus's theorem hold?"));
check("detect: fleet turn does NOT fire", !kc.detectClassicalMathV2Test("how are my drivers doing today"));
check("detect: wallet turn does NOT fire", !kc.detectClassicalMathV2Test("how much did I spend this week?"));
check("detect: digital-root of 2^n does NOT fire (R3 lane owns it)", !kc.detectClassicalMathV2Test("test the digital root of 2^n"));
check("detect: 'digital root of triangular numbers' does NOT fire (R3 owns figurate digital-roots)", !kc.detectClassicalMathV2Test("test the digital root of triangular numbers"));
check("detect: CM1 'are 220 and 284 amicable?' does NOT fire v2 (disjoint from CM1)", !kc.detectClassicalMathV2Test("are 220 and 284 amicable?"));
check("detect: mystical-only 'is the tetractys sacred?' does NOT fire", !kc.detectClassicalMathV2Test("is the tetractys sacred?"));

// ── 8. Proposer: closed vocabulary + worked examples (R3 lesson) ──
const propSys = kc.buildClassicalV2ProposeSystem();
check("proposer lists both v2 templates", propSys.includes("figurate_identity") && propSys.includes("pell_fundamental"));
check("proposer lists all 3 figurate kinds", ["hexagonal_triangular", "nicomachus_cubes", "square_consecutive_triangular"].every((k) => propSys.includes(k)));
check("proposer carries WORKED EXAMPLES for hexagonal + Pell (new-vocab lesson)", /is every hexagonal number triangular\?/.test(propSys) && /x\^2 - 61 y\^2 = 1/.test(propSys) && /WORKED EXAMPLES/.test(propSys));
check("proposer instructs null on a non-checkable (mystical / out-of-range) question", /output exactly: null/.test(propSys) && /mystical|sacred geometry/i.test(propSys));

// ── 9. STATIC WIRE GUARDS ────────────────────────────────────────
const kcSrc = fs.readFileSync(path.join(__dirname, "../lib/kernel-conjecture.js"), "utf8");
check("kernel-conjecture.js defines M8_CLASSICAL_MATH_V2 kill-switch", /M8_CLASSICAL_MATH_V2/.test(kcSrc));
check("kernel-conjecture.js defines CLASSICAL_V2_TEMPLATES", /const\s+CLASSICAL_V2_TEMPLATES\s*=/.test(kcSrc));
check("kernel-conjecture.js defines classicalMathV2Enabled", /function\s+classicalMathV2Enabled/.test(kcSrc));
check("kernel-conjecture.js defines pellFundamental (BigInt) + checkFigurateIdentity", /function\s+pellFundamental/.test(kcSrc) && /function\s+checkFigurateIdentity/.test(kcSrc));
check("kernel-conjecture.js loads classical-math-v2.json directly (self-contained)", /classical-math-v2\.json/.test(kcSrc));
check("kernel-conjecture.js defines detectClassicalMathV2Test", /function\s+detectClassicalMathV2Test/.test(kcSrc));
check("the Pell checker uses BigInt (the honest exact tool for x > 2^53)", /1n/.test(kcSrc) && /BigInt/.test(kcSrc));
const apiDir = path.join(__dirname, "../api");
const apiCount = fs.existsSync(apiDir) ? fs.readdirSync(apiDir).filter((f) => f.endsWith(".js")).length : 0;
eq("CM2 added no new api/ function (still 10 — cap FULL)", 10, apiCount);
const migDir = path.join(__dirname, "../migrations");
const cmSql = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => /cm2|figurate|pell/i.test(f)) : [];
eq("CM2 added no SQL migration", 0, cmSql.length);
check("classical-math-v2.json exists on disk", fs.existsSync(path.join(__dirname, "../data/seed-packs/classical-math-v2.json")));
check("CM1's classical-math-v1.json left UNTOUCHED (still 6 seeds)", require("../data/seed-packs/classical-math-v1.json").seeds.length === 6);

console.log(`\nBuild-CM2 classical-math checker v2: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
