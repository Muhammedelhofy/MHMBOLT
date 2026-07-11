/**
 * M8 Meaning-First v2 — the last-keyword-gap fixture test  (tests/meaning_v2_test.js)
 *
 * Run: node tests/meaning_v2_test.js
 *      (host has no PATH node; use the Kimi runtime:
 *       & "$env:LOCALAPPDATA\Programs\kimi-desktop\resources\resources\runtime\node.exe" tests/meaning_v2_test.js)
 *
 * The AUTHORITATIVE contract for M8_MEANING_FIRST_V2_SPEC.md, build step 0 (S1).
 * Drives the v2 contract over Muhammad's REAL phrasings and REAL replies
 * (tests/fixtures/meaning_v2_phrasings.json — mined from m8_conversations, real
 * app sessions only). The PS 5.1 mirror (meaning_v2_test.ps1) re-implements the
 * SAME pure detectors so the contract is checkable on this Node-less host — per
 * the PS-mirror rule, PS-fail + JS-pass = a mirror bug, not a source bug.
 *
 * WRITTEN TO FAIL until S2-S5 land (exactly like intent_gate_test was red until
 * resolveIntent() shipped). The v2 modules do not exist yet:
 *   lib/do-sentinel.js      (S2 step 3) — DO_MENU, parseDoMarker, stripDoMarker
 *   lib/claim-audit.js      (S2 step 2) — detectDoneClaim, detectCapabilityDenial
 *   lib/pending-action.js   (S4 step 5) — isAcceptance, isRefusal
 *   capability-registry.js  (S2 step 1) — CAPABILITIES, buildAbilitiesPrompt
 * Each absent module makes its PART red; the greens climb as the builds land.
 *
 * PART 0 (fixture integrity) uses the ALREADY-shipped registry to PROVE every
 * zero_keyword_action really scores 0 on the write lanes — it passes today and
 * guards against a mislabelled ("invented") phrasing sneaking into the fixture.
 */

const fs = require("fs");
const path = require("path");

const reg = require("../lib/capability-registry"); // shipped — resolveIntent/scoreMessage exist
function safeRequire(p) { try { return require(p); } catch (e) { return null; } }
const doSent  = safeRequire("../lib/do-sentinel");     // null until S2 step 3
const audit   = safeRequire("../lib/claim-audit");     // null until S2 step 2
const pending = safeRequire("../lib/pending-action");  // null until S4 step 5

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "meaning_v2_phrasings.json"), "utf8"));
const cases = fixture.cases;

const WRITE_LANES = ["tasks", "wallet", "notes", "driver_profile"];
const EXPECTED_DO_MENU = ["driver_profile", "notes", "tasks", "wallet"]; // sorted, writes-only (spec 4.1)

function writeMax(msg) {
  const sc = reg.scoreMessage(msg);
  return Math.max.apply(null, WRITE_LANES.map(function (d) { return sc[d] || 0; }));
}

let passed = 0, total = 0;
const failures = [];
function check(id, label, ok, reason) {
  total++;
  if (ok) { passed++; }
  else { failures.push({ id: id, label: label, reason: reason || label }); }
}

console.log("\nM8 Meaning-First v2 — last-keyword-gap fixture (" + cases.length + " real cases)");
console.log("=".repeat(78));

// ── PART 0 — fixture integrity (GREEN NOW): the (a) cases are truly zero-keyword ──
for (const c of cases) {
  if (c.cat !== "zero_keyword_action") continue;
  const wm = writeMax(c.msg);
  const r = reg.resolveIntent(c.msg, {});
  check(c.id, "P0 zero-keyword",
    wm === 0 && (r.band === "none" || r.band === "weak"),
    "expected writeMax 0 & band none/weak, got writeMax=" + wm + " band=" + r.band + " (label may be wrong — is this really zero-keyword?)");
  // and the intended DO target is a valid write lane
  check(c.id, "P0 do_domain valid", WRITE_LANES.indexOf(c.do_domain) !== -1,
    "do_domain '" + c.do_domain + "' is not a write lane");
}

// ── PART 1 — DO-sentinel marker protocol (RED until lib/do-sentinel.js) ───────────
if (!doSent) {
  check("do-sentinel", "P1 module", false, "lib/do-sentinel.js not built yet (expected until S2 step 3)");
} else {
  const menu = (doSent.DO_MENU || []).slice().sort();
  check("do-sentinel", "P1 DO_MENU writes-only",
    JSON.stringify(menu) === JSON.stringify(EXPECTED_DO_MENU),
    "DO_MENU should be " + JSON.stringify(EXPECTED_DO_MENU) + ", got " + JSON.stringify(menu));
  // reads must NOT be in the menu (spec 4.1: menu is writes-only)
  for (const rd of ["fleet", "finance", "knowledge", "web", "memory", "travel"]) {
    check("do-sentinel", "P1 read '" + rd + "' excluded", (doSent.DO_MENU || []).indexOf(rd) === -1,
      "read domain '" + rd + "' must not be in DO_MENU");
  }
  for (const c of cases) {
    if (c.cat !== "zero_keyword_action") continue;
    const marker = "⟦DO:" + c.do_domain + "⟧"; // ⟦DO:<domain>⟧
    check(c.id, "P1 parseDoMarker", doSent.parseDoMarker(marker) === c.do_domain,
      "parseDoMarker('" + marker + "') should be '" + c.do_domain + "'");
    check(c.id, "P1 stripDoMarker", String(doSent.stripDoMarker(marker + " ")).trim() === "",
      "stripDoMarker must remove the marker entirely (code-guaranteed strip, spec C1)");
  }
  // a plain prose reply carries no marker
  check("do-sentinel", "P1 no false marker", doSent.parseDoMarker("Sure, what time?") === null,
    "parseDoMarker must return null on prose");

  // ── C1 tweaks: the strip is code-GUARANTEED even when the model drifts ──────
  // whitespace inside the marker still parses AND strips
  check("do-sentinel", "P1 tolerant ws", doSent.parseTrailingMarker("ok\n⟦DO: wallet ⟧") === "wallet"
    && String(doSent.stripDoMarker("ok\n⟦DO: wallet ⟧")).trim() === "ok",
    "a whitespace-drifted marker must still parse + strip (C1 D2)");
  // case drift still parses AND strips
  check("do-sentinel", "P1 tolerant case", doSent.parseTrailingMarker("ok\n⟦do:Wallet⟧") === "wallet"
    && String(doSent.stripDoMarker("ok\n⟦do:Wallet⟧")).trim() === "ok",
    "a case-drifted marker must still parse + strip (C1 D2)");
  // ASCII-bracket fallback (model can't emit U+27E6): trailing + menu-bound only
  check("do-sentinel", "P1 ascii fallback", doSent.parseTrailingMarker("ok\n[DO:tasks]") === "tasks"
    && String(doSent.stripDoMarker("ok\n[DO:tasks]")).trim() === "ok",
    "a trailing ASCII-bracket menu marker must parse + strip (C1 D2)");
  // ...but trailing ASCII prose that merely LOOKS DO-ish survives (menu-bound guard)
  check("do-sentinel", "P1 ascii prose safe", doSent.stripDoMarker("Next step (DO: call the bank)") === "Next step (DO: call the bank)",
    "off-menu ASCII text must never be eaten by the fallback strip");
  // a malformed/off-menu WHITE-bracket marker still strips (it is DO-shaped for sure)
  check("do-sentinel", "P1 malformed strips", String(doSent.stripDoMarker("ok ⟦DO:fleet|wallet⟧ done")).replace(/\s+/g, " ").trim() === "ok done",
    "any DO-shaped ⟦…⟧ must strip, even off-menu/malformed (C1 D2 leak class)");
  // legit math white-brackets are untouched (research lane uses ⟦n⟧ denotation)
  check("do-sentinel", "P1 math brackets safe", doSent.stripDoMarker("the semantics ⟦n⟧ = n") === "the semantics ⟦n⟧ = n",
    "non-DO ⟦…⟧ content must never be stripped");
  // the prompt rule carries the NEGATIVE worked example (C1 D1)
  check("do-sentinel", "P1 counter-example present", /Counter-example/.test(doSent.shadowPromptRule()) && /append NO tag/.test(doSent.shadowPromptRule()),
    "shadowPromptRule must carry the ask-ABOUT counter-example (C1 D1)");
}

// ── PART 2 — claim-audit: false_done + false_cant detectors (RED until lib/claim-audit.js) ─
const CAPS = reg.CAPABILITIES || null; // also RED until S2 step 1
if (!audit) {
  check("claim-audit", "P2 module", false, "lib/claim-audit.js not built yet (expected until S2 step 2)");
} else {
  for (const c of cases) {
    if (c.cat !== "false_claim") continue;
    const done = !!audit.detectDoneClaim(c.reply);
    const deny = !!audit.detectCapabilityDenial(c.reply);
    const wouldLogDone = done && !c.had_sentinel; // spec 4.4: only when NO lane sentinel
    if (c.sub === "false_done") {
      check(c.id, "P2 false_done", wouldLogDone === true,
        "detectDoneClaim must fire on a done-claim WITHOUT a lane sentinel (got done=" + done + " sentinel=" + c.had_sentinel + ")");
    } else if (c.sub === "false_cant") {
      check(c.id, "P2 false_cant deny", deny === true,
        "detectCapabilityDenial must fire on '" + c.reply.slice(0, 40) + "...'");
      if (CAPS && c.domain && CAPS[c.domain]) {
        check(c.id, "P2 false_cant is-a-lie", (CAPS[c.domain].canDo || []).indexOf(c.denied_ability) !== -1,
          "denied_ability '" + c.denied_ability + "' should be in CAPABILITIES." + c.domain + ".canDo (proves it's a false denial)");
      }
    } else if (c.sub === "honest_cant") {
      check(c.id, "P2 honest_cant no-done", done === false,
        "an honest can't must not read as a done-claim");
      if (CAPS && c.domain && CAPS[c.domain]) {
        check(c.id, "P2 honest_cant is-legit", (CAPS[c.domain].cantDo || []).indexOf(c.denied_ability) !== -1,
          "denied_ability '" + c.denied_ability + "' should be in CAPABILITIES." + c.domain + ".cantDo (proves the denial is honest)");
      }
    } else if (c.sub === "normal") {
      check(c.id, "P2 normal-quiet", done === false && deny === false,
        "neither detector may fire on a normal answer (got done=" + done + " deny=" + deny + ")");
    } else if (c.sub === "normal_done_with_lane") {
      check(c.id, "P2 sentinel-gated", done === true && c.had_sentinel === true && wouldLogDone === false,
        "a real 'Added…' with a lane sentinel must NOT be logged as false_done (audit gates on the sentinel, not the wording)");
    }
  }
}

// ── PART 3 — pendingAction acceptance/refusal (RED until lib/pending-action.js) ───
if (!pending) {
  check("pending-action", "P3 module", false, "lib/pending-action.js not built yet (expected until S4 step 5)");
} else {
  for (const c of cases) {
    if (c.cat !== "pending_action") continue;
    const acc = !!pending.isAcceptance(c.msg);
    const ref = !!pending.isRefusal(c.msg);
    if (c.expect === "accept") {
      check(c.id, "P3 accept", acc === true && ref === false, "isAcceptance true / isRefusal false for '" + c.msg + "'");
    } else if (c.expect === "refuse") {
      check(c.id, "P3 refuse", ref === true && acc === false, "isRefusal true / isAcceptance false for '" + c.msg + "'");
    } else { // "neither" — slot_answer / deflection: must NEVER be read as a yes
      check(c.id, "P3 neither", acc === false && ref === false,
        "a slot-answer/deflection must be neither accept nor refuse (so it lands via the lane, never as a phantom yes) — '" + c.msg + "'");
    }
  }
}

// ── PART 4 — CAPABILITIES single source + composed abilities prompt (RED until step 1) ─
if (!CAPS) {
  check("capabilities", "P4 CAPABILITIES", false, "capability-registry.js CAPABILITIES not exported yet (S2 step 1)");
} else {
  for (const d of WRITE_LANES) {
    check("capabilities", "P4 caps." + d, CAPS[d] && Array.isArray(CAPS[d].canDo) && CAPS[d].canDo.length > 0,
      "CAPABILITIES." + d + ".canDo must be a non-empty array");
  }
}
if (typeof reg.buildAbilitiesPrompt !== "function") {
  check("capabilities", "P4 buildAbilitiesPrompt", false, "buildAbilitiesPrompt() not exported yet (S2 step 1)");
} else {
  const prompt = String(reg.buildAbilitiesPrompt());
  // spec §6 step 1: static-head byte-stability — two composes must be identical
  // (so the abilities ¶ stays a stable cache prefix, B-178 unaffected).
  check("capabilities", "P4 prompt byte-stable", reg.buildAbilitiesPrompt() === prompt,
    "buildAbilitiesPrompt() must be deterministic (byte-identical across composes)");
  check("capabilities", "P4 prompt mentions travel", /travel/i.test(prompt),
    "the composed abilities prompt must name the travel lane (fixes G6 — the hand-typed constant omits it)");
  check("capabilities", "P4 prompt never-claim-done",
    /never\s+(say|claim|tell)[^.]{0,50}(set|add|sav|log|schedul|creat)/i.test(prompt),
    "the composed prompt must carry the D4 never-claim-done rule");
  for (const d of WRITE_LANES) {
    check("capabilities", "P4 prompt names " + d, new RegExp(d.replace("_", "[ _]"), "i").test(prompt),
      "the composed prompt should name the '" + d + "' lane");
  }
}

console.log("=".repeat(78));
console.log("\nResults: " + passed + "/" + total + " passed, " + failures.length + " failed\n");
if (failures.length) {
  // group by the leading PART tag for a readable red report
  console.log("Failing (red until the matching build lands):");
  for (const f of failures) console.log("  - [" + f.id + "] " + f.reason);
  console.log("\n(Expected RED at S1: PART 0 should be GREEN; PARTS 1-4 go green as S2-S5 build the contract modules.)\n");
  process.exit(1);
} else {
  console.log("All meaning-v2 contract cases passed — S2-S5 are complete.\n");
}
