/**
 * tests/buildR2_seedpack_wiring.test.js — Build-R2 "digital-root seed pack + narration wiring" ship gate.
 *
 * Pure-function coverage (no network, no DB, no LLM) for what R2 closes:
 *   - digital-root-v1 pack : schema-valid under the SAME rules as collatz-v1 (validatePack),
 *                            16 seeds, the two honesty seeds present, kernel/leap/unsourced axis
 *   - matches_templates    : EMPTY on every seed (R3 fills it — the deferred-binding guarantee)
 *   - seedKnownMatch       : multi-pack search — collatz bindings still fire (regression);
 *                            a digital-root claim returns null (no fabricated citation TODAY)
 *   - kernel-conjecture wiring : seedCandidateFromClaim flattens params; seedMatchLine is INERT
 *                            with the shipped pack, and renders R1-style 〔citation〕 when a match
 *                            exists (proven via an injected matcher); a HELD render carries NO 📚
 *                            today (deferred activation)
 *   - seedToNode           : per-pack thread/pack stamp + kernel_leap passthrough; collatz unchanged
 * Plus STATIC WIRE GUARDS (grep the real source): seed-pack loads the new pack + PACKS;
 * kernel-conjecture requires ./seed-pack and appends seedMatchLine in the holds branch;
 * the pack JSON exists; no new api/ fn and no SQL migration were added by R2.
 *
 * Run:  node tests/buildR2_seedpack_wiring.test.js   (Kimi runtime: the PS mirror shells it)
 * PASS = every check passes (exit 0). Any FAIL ⇒ exit 1.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const sp   = require("../lib/seed-pack");
const kc   = require("../lib/kernel-conjecture");

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

const DR = sp.DIGITAL_ROOT;

// ── 1. Pack schema (same rules as collatz-v1) ─────────────────────
eq("validateAllPacks clean", "[]", JSON.stringify(sp.validateAllPacks()));
eq("digital-root validatePack clean", "[]", JSON.stringify(sp.validatePack(DR)));
eq("pack id", "digital-root-v1", DR.pack);
eq("seed count in 15-20", true, DR.seeds.length >= 15 && DR.seeds.length <= 20);
eq("seed count is 16", 16, DR.seeds.length);
check("all seeds pass validateSeed", DR.seeds.every((s) => sp.validateSeed(s).length === 0));
check("all seed ids unique", new Set(DR.seeds.map((s) => s.id)).size === DR.seeds.length);

// ── 2. matches_templates (R3 populated 8/16 seeds — see buildR3_baselens.test.js
//    for the full detail on WHICH generators exist and why exactly these 8 bind) ──
check("every seed matches_templates is an array", DR.seeds.every((s) => Array.isArray(s.matches_templates)));
eq("8 seeds now bound, 8 stay unbound (no honest template exists for them)", 8, DR.seeds.filter((s) => s.matches_templates.length > 0).length);
check("bound seeds are exactly the R3 set", JSON.stringify(DR.seeds.filter((s) => s.matches_templates.length > 0).map((s) => s.id).sort()) ===
  JSON.stringify(["digital-root-period-9", "doubling-orbit-124875", "fibonacci-digital-root-period-24", "fibonacci-pisano-period-9", "lucas-mod-9-period-24", "squares-digital-root-period-9", "three-six-nine-are-the-non-units", "triangular-digital-root-period-9"].sort()));

// ── 3. Honesty axis: kernel / leap / unsourced ────────────────────
const byId = Object.fromEntries(DR.seeds.map((s) => [s.id, s]));
check("tesla quote seed present + unsourced + negative", !!byId["tesla-369-quote-unsourced"] && byId["tesla-369-quote-unsourced"].kernel_leap === "unsourced" && byId["tesla-369-quote-unsourced"].negative_result === true);
check("rodin energy seed present + leap + negative", !!byId["rodin-vortex-energy-leap"] && byId["rodin-vortex-energy-leap"].kernel_leap === "leap" && byId["rodin-vortex-energy-leap"].negative_result === true);
check("rodin kernel seed present + kernel (established split)", !!byId["rodin-doubling-kernel-classical"] && byId["rodin-doubling-kernel-classical"].kernel_leap === "kernel");
eq("exactly 2 negative/honesty seeds", 2, DR.seeds.filter((s) => s.negative_result === true).length);
eq("exactly 1 unsourced seed", 1, DR.seeds.filter((s) => s.kernel_leap === "unsourced").length);
eq("exactly 1 leap seed", 1, DR.seeds.filter((s) => s.kernel_leap === "leap").length);
check("kernel seeds are the majority (established arithmetic)", DR.seeds.filter((s) => s.kernel_leap === "kernel").length >= 12);
check("every seed carries a source_citation + verification note", DR.seeds.every((s) => s.source_citation && s.verification && s.verification.method && s.verification.date));
// the two negative seeds must NOT carry a proof_strength (never 'proved' by accident)
check("honesty seeds have no proof_strength", DR.seeds.filter((s) => s.negative_result).every((s) => s.proof_strength == null));
// the required positive facts exist (spot-check the four the brief names)
["dr-equals-n-mod-9", "doubling-orbit-124875", "threes-and-sixes-doubling", "fibonacci-pisano-period-9"].forEach((id) =>
  check(`positive fact present: ${id}`, !!byId[id]));

// ── 4. seedKnownMatch multi-pack search ───────────────────────────
const collatzHit = sp.seedKnownMatch({ template: "B_nu_geo" });
check("collatz B_nu_geo still matches (regression)", !!collatzHit && collatzHit.pack === "collatz-v1");
check("collatz B_sigma_freq still matches (regression)", !!sp.seedKnownMatch({ template: "B_sigma_freq" }));
// R3 ACTIVATED this exact binding (doubling-orbit-124875 -> "dr_periodic:base=2") —
// see tests/buildR3_baselens.test.js for the full lit-up-citation proof. Regression
// here just confirms the multi-pack search still resolves it post-R3.
check("digital-root doubling claim → now resolves (R3 activated dr_periodic:base=2)",
  !!sp.seedKnownMatch({ template: "dr_periodic", generator: "power", base: 2, period: 6 }));
eq("unknown template → null", null, sp.seedKnownMatch({ template: "not_a_template" }));
eq("no candidate → null", null, sp.seedKnownMatch(null));

// ── 5. kernel-conjecture citation wiring ──────────────────────────
// dr_constant has ZERO seeds pointing at it (see the seed pack) — a genuinely
// still-unmatched claim shape, used here to test the general INERT-by-default
// mechanism (as opposed to the specific doubling-orbit binding R3 just activated).
const claim = { template: "dr_constant", generator: "multiple", params: { k: 9, value: 9 }, bound: 500, label: "dr(9n) is always 9" };
eq("seedCandidateFromClaim flattens params to top-level slots",
   JSON.stringify({ template: "dr_constant", generator: "multiple", k: 9, value: 9 }),
   JSON.stringify(kc.seedCandidateFromClaim(claim)));
eq("seedMatchLine still INERT for an unbound claim shape (no fabricated cite)", "", kc.seedMatchLine(claim));
// injected matcher proves the render lights up (what R3's real bindings do) in R1's 〔…〕 style
const stub = () => ({ id: "doubling-orbit-124875", title: "doubling orbit mod 9 is period 6", citation: "OEIS A000079; ord_9(2)=6" });
const posLine = kc.seedMatchLine(claim, stub);
check("seedMatchLine renders 📚 + verbatim 〔citation〕 on match", /📚/.test(posLine) && posLine.includes("〔OEIS A000079; ord_9(2)=6〕"));
check("seedMatchLine says FORM established, not proven", /established/.test(posLine) && /not a proof/.test(posLine) && !/proven/i.test(posLine));
// a real HELD render for this still-unbound shape carries NO citation (honesty intact)
const res = kc.evaluateClaim(claim);
const rendered = kc.renderKernelConjecture({ label: "9n kernel" }, claim, res);
check("held claim OBSERVED-through-N", res.holds && /OBSERVED by exhaustive computation/.test(rendered));
check("held render has NO 📚 for an unbound shape", !/📚/.test(rendered));
check("held render frames status as 'never proven'", /never proven/.test(rendered));
// FALSIFIED path unchanged (no citation on a false claim)
const falseClaim = { template: "dr_constant", generator: "n", params: { value: 5 }, bound: 200, label: "dr(n)=5 always" };
const fres = kc.evaluateClaim(falseClaim);
const frendered = kc.renderKernelConjecture({ label: "x" }, falseClaim, fres);
check("falsified render has counterexample + no 📚", /FALSIFIED/.test(frendered) && !/📚/.test(frendered));

// ── 6. seedToNode per-pack correctness ────────────────────────────
const drNode = sp.seedToNode(byId["tesla-369-quote-unsourced"], DR);
eq("seedToNode digital-root thread", "digital-root-literature", drNode.thread);
eq("seedToNode digital-root seed_pack", "digital-root-v1", drNode.metadata.seed_pack);
eq("seedToNode kernel_leap passthrough", "unsourced", drNode.metadata.kernel_leap);
check("seedToNode unsourced tail note", drNode.content.includes("Unsourced — no primary source on file."));
check("seedToNode content stamps the digital-root pack", drNode.content.includes("pack digital-root-v1"));
const leapNode = sp.seedToNode(byId["rodin-vortex-energy-leap"], DR);
check("seedToNode leap tail note", leapNode.content.includes("Speculative leap"));
// collatz path unchanged (default pack)
const collatzNode = sp.seedToNode(sp.PACK.seeds[0]);
check("seedToNode collatz default pack unchanged", collatzNode.thread === sp.PACK.thread && collatzNode.content.includes("pack collatz-v1"));

// ── 7. STATIC WIRE GUARDS (grep the real source) ──────────────────
const seedPackSrc = fs.readFileSync(path.join(__dirname, "../lib/seed-pack.js"), "utf8");
const kcSrc       = fs.readFileSync(path.join(__dirname, "../lib/kernel-conjecture.js"), "utf8");
check("seed-pack.js loads digital-root-v1.json", /require\(["']\.\.\/data\/seed-packs\/digital-root-v1\.json["']\)/.test(seedPackSrc));
check("seed-pack.js defines PACKS array", /const\s+PACKS\s*=\s*\[/.test(seedPackSrc));
check("seedKnownMatch iterates PACKS (multi-pack)", /for\s*\(const pack of PACKS\)/.test(seedPackSrc));
check("kernel-conjecture requires ./seed-pack", /require\(["']\.\/seed-pack["']\)/.test(kcSrc));
check("kernel-conjecture appends seedMatchLine in a holds branch", /seedMatchLine\(claim\)/.test(kcSrc));
check("digital-root pack JSON exists on disk", fs.existsSync(path.join(__dirname, "../data/seed-packs/digital-root-v1.json")));
// R2 adds NO api/ function and NO SQL migration
const apiDir = path.join(__dirname, "../api");
const apiSeed = fs.existsSync(path.join(apiDir, "seed-pack.js"));
check("R2 added no api/seed-pack.js function", !apiSeed);
const migDir = path.join(__dirname, "../migrations");
const r2Sql = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => /r2|digital.?root/i.test(f)) : [];
eq("R2 added no SQL migration", 0, r2Sql.length);

// ── summary ───────────────────────────────────────────────────────
console.log(`\nBuild-R2 seed-pack wiring: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
