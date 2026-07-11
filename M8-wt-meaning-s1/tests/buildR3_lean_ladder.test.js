/**
 * tests/buildR3_lean_ladder.test.js — Build-R3 STRETCH WIRING ship gate.
 *
 * Covers the production caller that connects the R3 stretch prover
 * (leanVerifyDigitSumMod9) to the digital-root narration as the honest three-tier
 * ladder (SPECULATIVE → OBSERVED-to-N → PROVEN). No network, no DB, no LLM — the
 * Lean checker is INJECTED (leanLadderLine's verifyFn DI, mirroring the R3 fn's).
 *
 *   - eligibility scoping: ONLY held base-10 digital-root templates
 *     (dr_periodic/dr_constant/dr_set). mod_cycle (not mod 9) + dr_base_* (base b≠10,
 *     rests on mod b-1) are EXCLUDED — the Lean theorem is 10·a+b, base-10 only.
 *   - proven tier: a warm checker returning {status:'proven'} → the ⚡ PROVEN line
 *     carries the REAL theorem receipt AND explicitly scopes to the GROUNDWORK, never
 *     the specific pattern.
 *   - fail-safe: a cold / unreachable / not-verified checker → an honest
 *     "machine-check pending" note, and NEVER the "⚡ PROVEN (Lean-verified)" claim.
 *   - kill-switch M8_LEAN_LADDER (default ON): OFF → leanLadderLine returns "" for an
 *     otherwise-proven eligible claim (byte-identical to pre-wiring).
 *   - STATIC WIRE GUARDS: all four held-return points in runKernelTest append
 *     leanLadderLine; kill-switch + exports present in source.
 *
 * Run:  node tests/buildR3_lean_ladder.test.js   (Kimi runtime: the PS mirror shells it)
 * PASS = every check passes (exit 0). Any FAIL ⇒ exit 1.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const kc   = require("../lib/kernel-conjecture");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}

// injected checkers (no network)
const provenChecker = async () => ({ status: "proven", theorem: kc.LEAN_DIGIT_SUM_MOD9_CODE, data: { verified: true } });
const coldChecker   = async () => ({ status: "lean_pending", reason: "checker cold — skipped, not attempted" });
const errChecker    = async () => ({ status: "lean_error", reason: "unreachable" });
const notVerified   = async () => ({ status: "ok", data: { verified: false, errors: ["boom"] } });

// representative claims
const drPeriodic = { template: "dr_periodic", generator: "power",    params: { base: 2, period: 6 } };
const drConstant = { template: "dr_constant", generator: "multiple", params: { k: 9, value: 9 } };
const drSet      = { template: "dr_set",      generator: "multiple", params: { k: 3, set: [3, 6, 9] } };
const modCycle   = { template: "mod_cycle",   generator: "power",    params: { m: 7, period: 3 } };
const drBase     = { template: "dr_base_periodic", generator: "power", params: { base: 2, radix: 12, period: 10 } };
const held       = { holds: true, checkedTo: 10000, observedPeriod: 6 };
const falsified  = { holds: false, checkedTo: 10000, counterexample: { n: 5 } };

(async () => {
  // ── 0. Kill-switch default ON ─────────────────────────────────────
  delete process.env.M8_LEAN_LADDER;
  check("leanLadderEnabled default ON", kc.leanLadderEnabled() === true);
  check("LEAN_LADDER_TEMPLATES = the 3 base-10 dr templates",
    JSON.stringify(kc.LEAN_LADDER_TEMPLATES) === JSON.stringify(["dr_periodic", "dr_constant", "dr_set"]));

  // ── 1. Eligibility scoping ────────────────────────────────────────
  check("eligible: held dr_periodic",  kc.leanLadderEligible(drPeriodic, held) === true);
  check("eligible: held dr_constant",  kc.leanLadderEligible(drConstant, held) === true);
  check("eligible: held dr_set",       kc.leanLadderEligible(drSet, held) === true);
  check("EXCLUDED: mod_cycle (not mod 9)",        kc.leanLadderEligible(modCycle, held) === false);
  check("EXCLUDED: dr_base_* (base b != 10)",     kc.leanLadderEligible(drBase, held) === false);
  check("EXCLUDED: a falsified dr_periodic",      kc.leanLadderEligible(drPeriodic, falsified) === false);
  check("EXCLUDED: null claim",                   kc.leanLadderEligible(null, held) === false);
  check("EXCLUDED: null result",                  kc.leanLadderEligible(drPeriodic, null) === false);

  // ── 2. Proven tier (warm checker) ─────────────────────────────────
  const proven = await kc.leanLadderLine(drPeriodic, held, { verifyFn: provenChecker });
  check("proven: renders ⚡ PROVEN (Lean-verified)", /⚡ PROVEN \(Lean-verified\)/.test(proven));
  check("proven: carries the real theorem receipt", proven.includes(kc.LEAN_DIGIT_SUM_MOD9_CODE));
  check("proven: mentions 0 sorry, 0 errors",       /0 sorry, 0 errors/.test(proven));
  check("proven: scopes to the GROUNDWORK, not the pattern", /GROUNDWORK, not the specific pattern/.test(proven));
  check("proven: names all three tiers",
    /SPECULATIVE/.test(proven) && /OBSERVED-to-N/.test(proven) && /PROVEN/.test(proven));

  // ── 3. Fail-safe: cold / error / not-verified → pending, NEVER a proof ──
  for (const [label, fn] of [["cold", coldChecker], ["error", errChecker], ["not-verified", notVerified]]) {
    const out = await kc.leanLadderLine(drPeriodic, held, { verifyFn: fn });
    check(`${label}: renders "Machine-check pending"`, /Machine-check pending/.test(out));
    check(`${label}: NEVER the "⚡ PROVEN (Lean-verified)" claim`, !/⚡ PROVEN \(Lean-verified\)/.test(out));
    check(`${label}: keeps pattern OBSERVED-to-N`, /OBSERVED-to-N/.test(out));
  }

  // a thrown checker must fail safe to "" (never crash the turn)
  const threw = await kc.leanLadderLine(drPeriodic, held, { verifyFn: async () => { throw new Error("net"); } });
  check("thrown checker → fails safe to empty string", threw === "");

  // ── 4. Ineligible claims → empty, regardless of checker ──────────────
  check("ineligible mod_cycle → empty", (await kc.leanLadderLine(modCycle, held, { verifyFn: provenChecker })) === "");
  check("ineligible dr_base → empty",   (await kc.leanLadderLine(drBase, held, { verifyFn: provenChecker })) === "");
  check("falsified dr → empty",         (await kc.leanLadderLine(drPeriodic, falsified, { verifyFn: provenChecker })) === "");

  // ── 5. Kill-switch OFF → byte-identical (empty) even when proven+eligible ──
  process.env.M8_LEAN_LADDER = "off";
  check("kill-switch OFF: leanLadderEnabled false", kc.leanLadderEnabled() === false);
  const off = await kc.leanLadderLine(drPeriodic, held, { verifyFn: provenChecker });
  check("kill-switch OFF: empty for an otherwise-proven eligible claim", off === "");
  process.env.M8_LEAN_LADDER = "OFF";
  check("kill-switch OFF (uppercase): empty", (await kc.leanLadderLine(drPeriodic, held, { verifyFn: provenChecker })) === "");
  delete process.env.M8_LEAN_LADDER;

  // ── 6. STATIC WIRE GUARDS — all four held-return points call leanLadderLine ──
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "kernel-conjecture.js"), "utf8");
  const wireCount = (src.match(/await leanLadderLine\(/g) || []).length;
  check("runKernelTest wires leanLadderLine at all 4 held-return points (>=4 call sites)", wireCount >= 4);
  check("source defines M8_LEAN_LADDER kill-switch", /M8_LEAN_LADDER/.test(src));
  check("source exports leanLadderLine + eligibility helpers",
    /leanLadderEnabled/.test(src) && /leanLadderEligible/.test(src) && /LEAN_LADDER_TEMPLATES/.test(src));
  // honesty guard: the proven line must be emitted ONLY inside the status==='proven' branch
  check("proven line is code-guarded by status==='proven'",
    /r\.status === "proven" && r\.theorem/.test(src));

  console.log(`\nBuild-R3 Lean-ladder wiring: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
