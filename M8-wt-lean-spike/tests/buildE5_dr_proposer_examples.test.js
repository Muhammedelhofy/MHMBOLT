/**
 * tests/buildE5_dr_proposer_examples.test.js — E5 miss-mining follow-up: digital-root
 * proposer worked examples.
 *
 * Pure-function / prompt-string coverage (no network, no DB, no LLM) for the fix:
 *   - m8_router_misses mining (2026-07-04) found a RECURRING pattern: terse kernel-test
 *     phrasings ("test the doubling digital-root claim", "did you prove the vortex idea?")
 *     fell through to "couldn't form a claim" — the R3/CM1/CM2 lesson (new proposer vocab
 *     needs a worked example) had never been applied to the ORIGINAL digital-root proposer
 *     prompts (buildProposeSystem / buildMultiProposeSystem).
 *   - Fix: a WORKED EXAMPLES block (kernel label -> concrete claim JSON) appended to both,
 *     gated by M8_DR_PROPOSER_EXAMPLES (default ON) so the fix can be killed instantly.
 *   - buildLiteralSystem() (explicit user assertions) is NEVER touched by this switch —
 *     that lane already forms a claim fine; proven byte-identical either way.
 *   - OFF -> buildProposeSystem()/buildMultiProposeSystem() carry NO worked-examples block
 *     (byte-identical to pre-this-build, same discipline as M8_BASE_LENS/M8_CLASSICAL_MATH).
 *
 * Run:  node tests/buildE5_dr_proposer_examples.test.js
 * PASS = every check passes (exit 0). Any FAIL -> exit 1.
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

// ── 0. Kill-switch default + basic gating ─────────────────────────
delete process.env.M8_DR_PROPOSER_EXAMPLES;
check("drProposerExamplesEnabled default ON", kc.drProposerExamplesEnabled() === true);
process.env.M8_DR_PROPOSER_EXAMPLES = "off";
check("drProposerExamplesEnabled('off') = false", kc.drProposerExamplesEnabled() === false);
process.env.M8_DR_PROPOSER_EXAMPLES = "0";
check("drProposerExamplesEnabled('0') = false", kc.drProposerExamplesEnabled() === false);
delete process.env.M8_DR_PROPOSER_EXAMPLES;

// ── 1. ON (default): both kernel-derived proposer prompts carry a worked example that
//    maps the exact terse phrasing mined from m8_router_misses ("the doubling / vortex
//    digital-root sequence") to a concrete, schema-valid claim. ──
const proposeOn = kc.buildProposeSystem();
const multiOn   = kc.buildMultiProposeSystem();
check("ON: buildProposeSystem() carries a WORKED EXAMPLES block", proposeOn.includes("WORKED EXAMPLES"));
check("ON: buildProposeSystem() example resolves the doubling/vortex kernel to dr_periodic/power/period 6", proposeOn.includes('"template":"dr_periodic","generator":"power","params":{"base":2,"period":6}'));
check("ON: buildMultiProposeSystem() carries a WORKED EXAMPLE block", multiOn.includes("WORKED EXAMPLE"));
check("ON: buildMultiProposeSystem() example is a JSON ARRAY (multi-candidate shape)", /-> \[\{"template"/.test(multiOn));
// The example claims must themselves be schema-valid (round-trip through the real checker) —
// so the "worked example" isn't just prose, it's a claim the deterministic checker can run.
const dblClaim = kc.validateClaim({ template: "dr_periodic", generator: "power", params: { base: 2, period: 6 }, bound: 10000 });
check("the doubling worked-example claim is schema-valid", dblClaim !== null);
check("the doubling worked-example claim HOLDS (period 6, hand-verified in R3)", kc.evaluateClaim(dblClaim).holds);

// ── 2. buildLiteralSystem() is NEVER touched by this switch (explicit-phrasing behavior
//    stays byte-identical either way — only the KERNEL-derived proposers needed help). ──
const literalOn = kc.buildLiteralSystem();
process.env.M8_DR_PROPOSER_EXAMPLES = "off";
const literalOff = kc.buildLiteralSystem();
check("buildLiteralSystem() is BYTE-IDENTICAL regardless of M8_DR_PROPOSER_EXAMPLES", literalOn === literalOff);
check("buildLiteralSystem() carries no E5 worked-examples block (out of scope)", !literalOn.includes("the doubling / vortex digital-root sequence"));
delete process.env.M8_DR_PROPOSER_EXAMPLES;

// ── 3. OFF -> byte-identical to pre-this-build (no worked-examples block appended) ──
process.env.M8_DR_PROPOSER_EXAMPLES = "off";
const proposeOff = kc.buildProposeSystem();
const multiOff   = kc.buildMultiProposeSystem();
check("OFF: buildProposeSystem() carries NO worked-examples block", !proposeOff.includes("WORKED EXAMPLES") && !proposeOff.includes("doubling / vortex"));
check("OFF: buildMultiProposeSystem() carries NO worked-examples block", !multiOff.includes("WORKED EXAMPLE") && !multiOff.includes("doubling / vortex"));
// OFF output = ON output minus exactly the appended block (nothing else shifted).
check("OFF: buildProposeSystem() is a strict prefix+suffix match of ON minus the examples block", proposeOn === proposeOff.replace("\n\nRULES:", "\n\n" + kc.DR_PROPOSER_WORKED_EXAMPLES_SINGLE + "\n\nRULES:"));
check("OFF: buildMultiProposeSystem() is a strict prefix+suffix match of ON minus the examples block", multiOn === multiOff.replace("\n\nRULES:", "\n\n" + kc.DR_PROPOSER_WORKED_EXAMPLES_MULTI + "\n\nRULES:"));
delete process.env.M8_DR_PROPOSER_EXAMPLES;

// ── 3.5. POST-DEPLOY FIX — the raw-message fallback in runKernelTest. Live self-verify caught
//    that a bare "test the doubling digital-root claim" never reaches (1) at all: knowledge-
//    intake's proposeDecomposition requires BOTH a kernel AND a leap, and a bare test-request has
//    no leap, so it honestly returns null before the worked-examples fix is ever consulted. Static
//    source coverage only (runKernelTest calls the real, non-injectable ./llm generate(), so this
//    is a "no network" test file by the same discipline as buildR3/CM1/CM2 — the live-test doc
//    covers the actual LLM-call behavior end-to-end). ──
check("runKernelTest() function exists and is exported", typeof kc.runKernelTest === "function");
{
  const kcSrc = fs.readFileSync(path.join(__dirname, "../lib/kernel-conjecture.js"), "utf8");
  const rktStart = kcSrc.indexOf("async function runKernelTest(");
  check("runKernelTest is defined in source", rktStart >= 0);
  const rktBody = rktStart >= 0 ? kcSrc.slice(rktStart, kcSrc.indexOf("\nasync function leanVerifyDigitSumMod9", rktStart)) : "";
  check("runKernelTest's no-kernel branch is gated by drProposerExamplesEnabled()", /if \(!dec \|\| !dec\.kernel\) \{[\s\S]{0,1200}drProposerExamplesEnabled\(\)/.test(rktBody));
  check("runKernelTest's fallback builds a kernel from the RAW message (label AND content)", /rawKernel = \{ label: message, content: message \}/.test(rktBody));
  check("runKernelTest's fallback calls bestKernelConjecture on the raw kernel", /bestKernelConjecture\(rawKernel\)/.test(rktBody));
  check("runKernelTest still falls back to the honest decline if the raw-kernel attempt also yields nothing", /I couldn't turn that into a machine-checkable number-pattern claim/.test(rktBody));
  // POST-DEPLOY FIX #3 — a deterministic (temp=0) single-candidate retry before declining.
  check("runKernelTest retries with the deterministic single-candidate proposer (kernelToConjecture) before declining", /kernelToConjecture\(rawKernel\)/.test(rktBody));
  check("runKernelTest's single-candidate retry only returns early when the claim actually HOLDS", /singleResult\.holds/.test(rktBody));
}

// ── 3.6. POST-DEPLOY FIX #2 — Groq-first provider order for the two kernel-derived proposer
//    calls. Live self-verify showed Gemini (prod's global-default first provider) doesn't
//    reliably make the inference the worked example teaches, while Groq (gpt-oss-120b) does,
//    hand-verified locally (3 valid candidates, deterministic, against the real Groq key). Scoped
//    to ONLY these two calls — the app-wide LLM_PROVIDER_ORDER default is untouched. ──
check("DR_PROPOSER_PROVIDER_ORDER puts groq first", kc.DR_PROPOSER_PROVIDER_ORDER.split(",")[0] === "groq");
check("DR_PROPOSER_PROVIDER_ORDER still lists gemini as a fallback (never drops a configured provider)", kc.DR_PROPOSER_PROVIDER_ORDER.includes("gemini"));
{
  const kcSrc = fs.readFileSync(path.join(__dirname, "../lib/kernel-conjecture.js"), "utf8");
  const ktcStart = kcSrc.indexOf("async function kernelToConjecture(");
  const ktcBody = ktcStart >= 0 ? kcSrc.slice(ktcStart, kcSrc.indexOf("\n// ── Build-47", ktcStart)) : "";
  check("kernelToConjecture() passes the groq-first providerOrder, gated by drProposerExamplesEnabled()", /providerOrder: drProposerExamplesEnabled\(\) \? DR_PROPOSER_PROVIDER_ORDER : undefined/.test(ktcBody));
  const pkcStart = kcSrc.indexOf("async function proposeKernelCandidates(");
  const pkcBody = pkcStart >= 0 ? kcSrc.slice(pkcStart, kcSrc.indexOf("\n// ── Triviality floor", pkcStart)) : "";
  check("proposeKernelCandidates() passes the groq-first providerOrder, gated by drProposerExamplesEnabled()", /providerOrder: drProposerExamplesEnabled\(\) \? DR_PROPOSER_PROVIDER_ORDER : undefined/.test(pkcBody));
}

// ── 4. R3 base-lens vocabulary is completely disjoint from the new block (no collision,
//    no accidental leak of dr_base/kgonal vocab into the E5 examples). ──
check("E5 single-example block carries no R3 base-lens vocab", !kc.DR_PROPOSER_WORKED_EXAMPLES_SINGLE.includes("dr_base") && !kc.DR_PROPOSER_WORKED_EXAMPLES_SINGLE.includes("kgonal"));
check("E5 multi-example block carries no R3 base-lens vocab", !kc.DR_PROPOSER_WORKED_EXAMPLES_MULTI.includes("dr_base") && !kc.DR_PROPOSER_WORKED_EXAMPLES_MULTI.includes("kgonal"));

// ── 5. STATIC WIRE GUARDS ──────────────────────────────────────────
const kcSrc = fs.readFileSync(path.join(__dirname, "../lib/kernel-conjecture.js"), "utf8");
check("kernel-conjecture.js defines M8_DR_PROPOSER_EXAMPLES kill-switch", /M8_DR_PROPOSER_EXAMPLES/.test(kcSrc));
check("kernel-conjecture.js defines drProposerExamplesEnabled", /function\s+drProposerExamplesEnabled\s*\(/.test(kcSrc));
const apiDir = path.join(__dirname, "../api");
const apiCount = fs.existsSync(apiDir) ? fs.readdirSync(apiDir).filter((f) => f.endsWith(".js")).length : 0;
check("E5 fix added no new api/ function (10, post-Session-86 consolidation)", apiCount === 10);
const migDir = path.join(__dirname, "../migrations");
const e5Sql = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => /e5|dr.?propos/i.test(f)) : [];
check("E5 fix added no SQL migration", e5Sql.length === 0);

console.log(`\nE5 digital-root proposer worked examples: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
