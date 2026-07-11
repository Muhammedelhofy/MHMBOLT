/**
 * tests/buildR4_health_rail.test.js — Build-R4 "Health rail + historical-text mode" ship gate.
 *
 * Pure-function coverage (no network, no DB, no LLM) for what R4 closes:
 *   - detectHealthContext : the TOPICAL trigger over the research-context window (this turn +
 *     last few USER turns), mirroring detectUpgradePressure. Fires on the health canary and on
 *     a planted-context follow-up; DOES NOT fire on fleet / wallet / generic-collision turns
 *     ("fleet health", "vehicle body", "pain point") or on the 3-6-9 number-theory lane — the
 *     rail must never contaminate the fleet/wallet or R1-R3 research lanes.
 *   - HEALTH_RAIL_DIRECTIVE : Muhammad's signed-off wording is LOCKED here — historical framing
 *     mandatory, the full operational NEVER-LIST (dosing / start-stop-replace-med / diagnosis /
 *     "this works"), historical-consensus-is-not-clinical-evidence, modern-evidence honesty, the
 *     privacy seam, and the EXACT standing-close sentence (em-dash and all). A future edit that
 *     weakens any clause fails this gate.
 *   - §2b two-truths extraction : a "world-claim" item is FORCED speculative even from an
 *     established source; a "text-fact" (and everything when the rail is OFF) inherits the source
 *     class. selectExtractionSystem / buildGeneralExtractionPrompt gain the layer + a WORKED
 *     EXAMPLE only when healthTextMode (the R3 build lesson).
 *   - M8_HEALTH_RAIL kill-switch (default ON) : OFF ⇒ parseExtractionOutput / selectExtractionSystem
 *     / buildGeneralExtractionPrompt are BYTE-IDENTICAL to pre-R4, and (grep guard) both compose
 *     sites gate the directive on healthRailEnabled() so the directive line is absent.
 * Plus STATIC WIRE GUARDS: detector+directive+switch defined & exported, both orchestrator inject
 * sites present and switch-gated, no new api/ fn, no SQL migration.
 *
 * Run:  node tests/buildR4_health_rail.test.js   (Kimi runtime; NODE_PATH -> the M8 node_modules)
 * PASS = every check passes (exit 0). Any FAIL ⇒ exit 1.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const d    = require("../lib/discovery");
const ki   = require("../lib/knowledge-intake");

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
const EMDASH = String.fromCharCode(0x2014); // built from char code, never embedded raw (B-182/184 discipline)

// ── 0. Kill-switch default + purity separation ────────────────────
delete process.env.M8_HEALTH_RAIL;
eq("healthRailEnabled default ON", true, d.healthRailEnabled());
process.env.M8_HEALTH_RAIL = "off"; eq("healthRailEnabled('off') = false", false, d.healthRailEnabled());
process.env.M8_HEALTH_RAIL = "0";   eq("healthRailEnabled('0') = false", false, d.healthRailEnabled());
process.env.M8_HEALTH_RAIL = "OFF"; eq("healthRailEnabled('OFF') case-insensitive = false", false, d.healthRailEnabled());
// the DETECTOR is pure — it fires on topic regardless of the switch (the orchestrator gates on
// healthRailEnabled(), NOT the detector). Prove the separation: switch off, detector still fires.
check("detector is switch-INDEPENDENT (fires with rail OFF; orchestrator owns the gate)",
  d.detectHealthContext("should I take what Ibn Sina recommended for my fever?", []) === true);
delete process.env.M8_HEALTH_RAIL;

// ── 1. detectHealthContext — the topical trigger ──────────────────
// FIRES:
check("canary fires: 'Ibn Sina recommended X for headaches — should I take it?'",
  d.detectHealthContext("Ibn Sina recommended X for headaches " + EMDASH + " should I take it?", []));
check("al-Razi treatment turn fires",
  d.detectHealthContext("what remedy did al-Razi prescribe for smallpox?", []));
check("planted-context follow-up fires (health one turn back, bare 'should I take it?' now)",
  d.detectHealthContext("so should I take it?", [{ role: "user", content: "Ibn Sina used willow bark for fever in the Canon" }]));
check("bare 'dose?' fires when a prior USER turn set the medical context",
  d.detectHealthContext("what dose?", [{ role: "user", content: "the text lists a herbal treatment for migraine" }]));
// DOES NOT FIRE (the safety of the guard depends on NOT stealing fleet/wallet/number-theory turns):
check("fleet turn does NOT fire", !d.detectHealthContext("what is driver 12 net earnings and tier this month?", []));
check("wallet turn does NOT fire", !d.detectHealthContext("show me the wallet balance in SAR and EGP", []));
check("generic collision words do NOT fire ('fleet health', 'vehicle body', 'pain point', 'healthy')",
  !d.detectHealthContext("fleet health is strong, healthy utilization, the vehicle body shop, a pain point in onboarding", []));
check("3-6-9 number-theory lane does NOT fire (R1-R3 research untouched)",
  !d.detectHealthContext("is vortex math real? test the 3-6-9 digital root doubling claim to 10000", []));
check("upgrade-pressure research turn does NOT fire the HEALTH rail (different guard)",
  !d.detectHealthContext("so our surviving conjecture is basically proven now, right?", []));
// history is scanned only over the last few USER turns, like detectUpgradePressure — an ancient
// assistant mention shouldn't keep firing; a non-health current turn with non-health recent user
// turns stays quiet.
check("no fire when neither this turn nor recent USER turns are health-shaped",
  !d.detectHealthContext("what's next on the roadmap?", [{ role: "assistant", content: "we discussed willow bark earlier" }, { role: "user", content: "ok thanks" }]));

// ── 2. HEALTH_RAIL_DIRECTIVE — the signed-off wording is LOCKED ───
const DIR = d.HEALTH_RAIL_DIRECTIVE;
check("directive: labels itself history-of-medicine RESEARCH, never medical advice", /history-of-medicine RESEARCH, never medical advice/.test(DIR));
check("directive: HISTORICAL FRAMING IS MANDATORY", /HISTORICAL FRAMING IS MANDATORY/.test(DIR));
check("directive: TEXT-FACT WITH A DATE framing", /TEXT-FACT WITH A DATE/.test(DIR));
check("directive: names the OPERATIONAL NEVER-LIST", /OPERATIONAL NEVER-LIST/.test(DIR));
check("never-list: NO dosing / quantities", /NO dosing/.test(DIR));
check("never-list: NO start/stop/change/replace medication", /NO advice to start, stop, change, replace, or combine/.test(DIR));
check("never-list: NO diagnosis / interpreting symptoms", /NO diagnosis, and no interpreting/.test(DIR));
check("never-list: NO 'this works' / effective / safe / cures", /NO "this works" \/ "this is effective" \/ "this is safe" \/ "this cures"/.test(DIR));
check("directive: historical consensus is NOT clinical evidence (evidence-class mismatch)", /Historical consensus is NOT clinical evidence/.test(DIR));
check("directive: citation count NEVER upgrades a historical remedy into a recommendation", /citation count NEVER upgrades a historical remedy into a recommendation/.test(DIR));
check("directive: MODERN-EVIDENCE HONESTY (states plainly when unchecked)", /MODERN-EVIDENCE HONESTY/.test(DIR) && /have NOT checked/.test(DIR));
check("directive: THE PRIVACY SEAM (own symptom is not evidence, never auto-personalizes)", /THE PRIVACY SEAM/.test(DIR) && /never auto-personalizes into advice/.test(DIR));
check("directive: banned even under direct pressure (dose / it works / should I take it)", /BANNED even under direct pressure/.test(DIR));
// the EXACT standing-close sentence, em-dash and all (quoted verbatim on every health answer):
const STANDING_CLOSE = "This is history-of-medicine research, not medical advice " + EMDASH + " a clinician decides treatment.";
check("directive: contains the EXACT standing-close sentence (with em-dash)", DIR.includes(STANDING_CLOSE));
check("directive: instructs to END every answer with exactly that sentence", /End every health-adjacent answer with exactly this sentence/.test(DIR));
// single source of truth: the exported sentence const IS what the directive quotes
eq("HEALTH_CLOSE_SENTENCE === the exact blessed sentence", STANDING_CLOSE, d.HEALTH_CLOSE_SENTENCE);
check("directive quotes HEALTH_CLOSE_SENTENCE (one source of truth)", DIR.includes(d.HEALTH_CLOSE_SENTENCE));

// ── 2b. ensureHealthClose — the DETERMINISTIC coda (guarantee, not a hope) ──
// Prod self-verify caught the free-stack model paraphrasing the close on long answers;
// the coda guarantees the exact sentence in code, idempotently, gated on switch+detector.
delete process.env.M8_HEALTH_RAIL;
const longAnswer = "Ibn Sina's Canon (11th century) records willow bark for headache. There is no modern evidence for it; see a clinician.";
const coded = d.ensureHealthClose(longAnswer, "should I take what Ibn Sina recommended for headaches?", []);
check("coda: appends the verbatim close when the model omitted it (health turn)", coded.endsWith(d.HEALTH_CLOSE_SENTENCE) && coded.startsWith(longAnswer));
check("coda: is idempotent — no duplicate when the model already emitted it verbatim",
  (() => { const already = "Some answer.\n\n" + d.HEALTH_CLOSE_SENTENCE; const r = d.ensureHealthClose(already, "al-Razi remedy for fever?", []); return r === already && (r.match(/a clinician decides treatment/g) || []).length === 1; })());
check("coda: NON-health turn is untouched (no clinician close leaks onto fleet/wallet)",
  d.ensureHealthClose("Your fleet earned 47,079 SAR this week.", "how are my drivers doing today?", []) === "Your fleet earned 47,079 SAR this week.");
check("coda: null/empty response on a health turn returns just the sentence (never throws)",
  d.ensureHealthClose("", "what dose did Ibn Sina give for headache?", []) === d.HEALTH_CLOSE_SENTENCE &&
  d.ensureHealthClose(null, "what dose did Ibn Sina give for headache?", []) === d.HEALTH_CLOSE_SENTENCE);
process.env.M8_HEALTH_RAIL = "off";
check("coda: OFF-identity — rail off returns the response byte-untouched (no coda)",
  d.ensureHealthClose(longAnswer, "should I take what Ibn Sina recommended for headaches?", []) === longAnswer);
delete process.env.M8_HEALTH_RAIL;

// ── 3. §2b two-truths extraction — world-claim forced speculative ──
const rawMixed = JSON.stringify([
  { label: "ibn_sina_willow_headache", content: "Ibn Sina's Canon records willow bark for headache.", type: "fact",  layer: "text-fact"  },
  { label: "willow_effective",         content: "Willow bark is an effective analgesic.",             type: "claim", layer: "world-claim" },
]);
const on = ki.parseExtractionOutput(rawMixed, "established", 7, "general", { healthTextMode: true });
eq("two-truths ON: text-fact INHERITS the established source class", "established", on[0].source_class);
eq("two-truths ON: world-claim FORCED speculative (never inherits established)", "speculative", on[1].source_class);
// a world-claim from a speculative source is already speculative — no change, no upgrade path.
const onSpec = ki.parseExtractionOutput(rawMixed, "speculative", 7, "general", { healthTextMode: true });
eq("two-truths ON: world-claim from a speculative source stays speculative", "speculative", onSpec[1].source_class);
eq("two-truths ON: text-fact from a speculative source stays speculative (inherits)", "speculative", onSpec[0].source_class);
// missing / unknown layer defaults to text-fact (conservative — never invents a world-claim downgrade)
const rawNoLayer = JSON.stringify([{ label: "a_dated_event", content: "The Canon was completed c. 1025.", type: "date" }]);
eq("two-truths ON: absent layer defaults to text-fact (inherits established)", "established",
  ki.parseExtractionOutput(rawNoLayer, "established", 7, "general", { healthTextMode: true })[0].source_class);

// ── 4. Kill-switch / opts-absent BYTE-IDENTITY (the R1/R2/R3 pattern) ──
const offNodes = ki.parseExtractionOutput(rawMixed, "established", 7, "general");             // opts absent
const offNodesExplicit = ki.parseExtractionOutput(rawMixed, "established", 7, "general", {}); // opts empty
check("OFF-identity: opts absent ⇒ world-claim inherits established (pre-R4 behaviour)",
  offNodes[0].source_class === "established" && offNodes[1].source_class === "established");
check("OFF-identity: opts absent === opts {} (byte-identical node arrays)",
  JSON.stringify(offNodes) === JSON.stringify(offNodesExplicit));
// prove the whole node object is unchanged shape vs a pristine pre-R4 expectation
eq("OFF-identity: node object shape unchanged (no layer field leaks onto the node)",
  JSON.stringify({ node_type: "claim", label: "willow_effective", content: "Willow bark is an effective analgesic.", extraction_confidence: "high", source_class: "established", source_doc_id: 7 }),
  JSON.stringify(offNodes[1]));
// system prompt identity: OFF path returns the UNCHANGED exported constant; ON path appends the layer.
check("OFF-identity: selectExtractionSystem('general') === the pristine GENERAL_EXTRACTION_SYSTEM",
  ki.selectExtractionSystem("general") === ki.GENERAL_EXTRACTION_SYSTEM);
check("OFF-identity: selectExtractionSystem('general', {}) === GENERAL_EXTRACTION_SYSTEM",
  ki.selectExtractionSystem("general", {}) === ki.GENERAL_EXTRACTION_SYSTEM);
check("OFF-identity: GENERAL_EXTRACTION_SYSTEM carries NO two-truths vocab when the layer is off",
  !ki.GENERAL_EXTRACTION_SYSTEM.includes("TWO-TRUTHS") && !ki.GENERAL_EXTRACTION_SYSTEM.includes("world-claim"));
check("ON: selectExtractionSystem('general', {healthTextMode}) === base + HEALTH_TEXT_LAYER_SYSTEM",
  ki.selectExtractionSystem("general", { healthTextMode: true }) === ki.GENERAL_EXTRACTION_SYSTEM + ki.HEALTH_TEXT_LAYER_SYSTEM);
check("ON: layered system prompt defines the text-fact / world-claim layer", /TWO-TRUTHS LAYER/.test(ki.HEALTH_TEXT_LAYER_SYSTEM) && /world-claim/.test(ki.HEALTH_TEXT_LAYER_SYSTEM));
// user prompt identity + the mandatory worked example (R3 lesson)
check("OFF-identity: buildGeneralExtractionPrompt(no opts) === with {} (byte-identical)",
  ki.buildGeneralExtractionPrompt("t", "T", 0) === ki.buildGeneralExtractionPrompt("t", "T", 0, {}));
check("OFF-identity: base user prompt has NO worked example",
  !ki.buildGeneralExtractionPrompt("t", "T", 0).includes("WORKED EXAMPLE"));
check("ON: user prompt appends the two-truths WORKED EXAMPLE (R3 build lesson: new vocab ships an example)",
  ki.buildGeneralExtractionPrompt("t", "T", 0, { healthTextMode: true }).includes("WORKED EXAMPLE") &&
  ki.HEALTH_TEXT_LAYER_EXAMPLE.includes("willow bark") &&
  ki.HEALTH_TEXT_LAYER_EXAMPLE.includes('"layer":"text-fact"') &&
  ki.HEALTH_TEXT_LAYER_EXAMPLE.includes('"layer":"world-claim"'));
// math mode never gets the layer (it has its own extractor)
check("math mode ignores healthTextMode (uses the math extractor unchanged)",
  ki.selectExtractionSystem("math", { healthTextMode: true }) === ki.selectExtractionSystem("math"));
// healthTextModeFor: general + rail ON ⇒ true; math ⇒ false; general + rail OFF ⇒ false
delete process.env.M8_HEALTH_RAIL;
eq("healthTextModeFor('general') = true when rail ON", true, ki.healthTextModeFor("general"));
eq("healthTextModeFor('math') = false (never on the math path)", false, ki.healthTextModeFor("math"));
process.env.M8_HEALTH_RAIL = "off";
eq("healthTextModeFor('general') = false when rail OFF (extraction reverts to pre-R4)", false, ki.healthTextModeFor("general"));
delete process.env.M8_HEALTH_RAIL;

// ── 5. STATIC WIRE GUARDS (grep the JS source) ────────────────────
const root = path.join(__dirname, "..");
const disc = fs.readFileSync(path.join(root, "lib/discovery.js"), "utf8");
check("discovery.js defines HEALTH_SHAPE_RE", /const\s+HEALTH_SHAPE_RE\s*=/.test(disc));
check("discovery.js defines detectHealthContext", /function\s+detectHealthContext\s*\(/.test(disc));
check("discovery.js defines HEALTH_RAIL_DIRECTIVE", /const\s+HEALTH_RAIL_DIRECTIVE\s*=/.test(disc));
check("discovery.js defines M8_HEALTH_RAIL kill-switch (healthRailEnabled)", /M8_HEALTH_RAIL/.test(disc) && /function\s+healthRailEnabled\s*\(/.test(disc));
check("discovery.js EXPORTS the four R4 symbols",
  /detectHealthContext/.test(disc) && /HEALTH_RAIL_DIRECTIVE/.test(disc) && /HEALTH_SHAPE_RE/.test(disc) && /healthRailEnabled/.test(disc));

const orch = fs.readFileSync(path.join(root, "lib/orchestrator.js"), "utf8");
const gateHits = (orch.match(/healthRailEnabled\(\)\s*&&\s*detectHealthContext\(message,\s*history\)/g) || []).length;
eq("orchestrator injects the rail at BOTH compose sites, each switch-gated (healthRailEnabled() && detectHealthContext)", 2, gateHits);
const injectHits = (orch.match(/\$\{HEALTH_RAIL_DIRECTIVE\}/g) || []).length;
eq("orchestrator appends HEALTH_RAIL_DIRECTIVE at exactly 2 sites (buffered + stream)", 2, injectHits);
check("orchestrator imports the R4 symbols from ./discovery", /detectHealthContext, HEALTH_RAIL_DIRECTIVE, healthRailEnabled/.test(orch) && /ensureHealthClose/.test(orch));
const codaHits = (orch.match(/ensureHealthClose\(response, message, history\)/g) || []).length;
eq("orchestrator applies the deterministic coda at BOTH paths (buffered + stream)", 2, codaHits);

const kiSrc = fs.readFileSync(path.join(root, "lib/knowledge-intake.js"), "utf8");
check("knowledge-intake.js defines HEALTH_TEXT_LAYER_SYSTEM + HEALTH_TEXT_LAYER_EXAMPLE",
  /const\s+HEALTH_TEXT_LAYER_SYSTEM\s*=/.test(kiSrc) && /const\s+HEALTH_TEXT_LAYER_EXAMPLE\s*=/.test(kiSrc));
check("knowledge-intake.js defines healthTextModeFor (lazy ./discovery require, no cycle)",
  /function\s+healthTextModeFor\s*\(/.test(kiSrc) && /require\(["']\.\/discovery["']\)\.healthRailEnabled\(\)/.test(kiSrc));
check("knowledge-intake.js parseExtractionOutput threads the opts arg",
  /function\s+parseExtractionOutput\(raw,\s*source_class,\s*source_doc_id,\s*mode\s*=\s*"math",\s*opts\s*=\s*\{\}\)/.test(kiSrc));

const apiDir = path.join(root, "api");
const apiCount = fs.existsSync(apiDir) ? fs.readdirSync(apiDir).filter((f) => f.endsWith(".js")).length : 0;
eq("R4 added no new api/ function (10-fn cap FULL — still 10)", 10, apiCount);
const migDir = path.join(root, "migrations");
const r4Sql = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => /r4|health.?rail|two.?truths/i.test(f)) : [];
eq("R4 added no SQL migration", 0, r4Sql.length);

console.log(`\nBuild-R4 health rail + historical-text mode: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
