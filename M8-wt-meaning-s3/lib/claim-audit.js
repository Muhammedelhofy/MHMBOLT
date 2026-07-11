"use strict";
/**
 * lib/claim-audit.js — Meaning-First v2 (S2 step 2), spec §4.4.
 *
 * PURE detectors over a reply STRING — no DB, no LLM, no side effects — so the
 * PS-5.1 mirror (tests/meaning_v2_test.ps1) asserts the exact same behaviour on
 * this Node-less host. TELEMETRY-FIRST: the orchestrator logs a hit only when the
 * reply reaches the user WITHOUT a lane sentinel (TASK/MONEY), i.e. no lane
 * actually acted. Stage 1 = log only, ZERO behaviour change (D4, spec §4.4).
 *
 *  detectDoneClaim(text)      — the reply CLAIMS a write happened ("I've logged…",
 *                               "Done.", "Noted, it's marked…"). A hit + no lane
 *                               sentinel = a false "done" (the reverse capability lie).
 *  detectCapabilityDenial(t)  — the reply DENIES an ability ("I can't add expenses",
 *                               "I don't have the ability to set reminders"). Cross-
 *                               referenced against CAPABILITIES to tell a lie (denies a
 *                               canDo) from an honest limit (a real cantDo).
 *
 * The done-claim pattern is the spec-4.4 regex EXTENDED: the fixture case
 * c-false-done-priority ("Noted… marked as a very high priority") is a REAL false
 * "done" the draft §4.4 regex dropped, so the reference adds noted/marked/"I'll
 * remind|note|keep|track" and "Added … to your …". Keep in sync with the PS mirror.
 */

// ── done-claim (spec §4.4, extended) ──────────────────────────────────────────
const DONE_EN = /\bi(?:'ve| have)?\s+(?:set|added|saved|created|logged|scheduled|recorded)\b|(?:reminder|task|note|expense).{0,20}(?:set|added|saved)|\bdone[.!]|\bnoted[,.!]|\bmarked as\b|\bi'?ll\s+(?:remind|note|keep|track)\b|\badded\b.{0,40}\bto your\b/i;
const DONE_AR = /ضبطت|أضفت|سجلت|حفظت/;

// ── capability-denial (the false "can't" side of D4) ──────────────────────────
const DENY_EN = /\bi\s+(?:can'?t|cannot|can not)\s+(?:directly\s+)?(?:set|add|save|create|log|record|schedule|remind|store|track|access|send|delete|ingest)\b|\bi\s+(?:don'?t|do not)\s+have\s+(?:the ability|access)\b|\bi'?m\s+(?:just\s+)?(?:a|an)\s+(?:text|language|ai)\b|\bas an ai\b|\bnot hooked into\b|\bi'?m not able to\b|\bdon'?t have the ability\b/i;
const DENY_AR = /ما\s*(?:أقدر|اقدر)|لا\s+أستطيع|ما\s*عندي\s+(?:صلاحية|قدرة)/;

function detectDoneClaim(text) {
  const s = String(text || "");
  return DONE_EN.test(s) || DONE_AR.test(s);
}
function detectCapabilityDenial(text) {
  const s = String(text || "");
  return DENY_EN.test(s) || DENY_AR.test(s);
}

module.exports = { detectDoneClaim, detectCapabilityDenial, DONE_EN, DENY_EN };
