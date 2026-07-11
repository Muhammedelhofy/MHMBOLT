"use strict";
/**
 * lib/do-sentinel.js — Meaning-First v2 (S2 step 3), spec §4.1.
 *
 * The fallback LLM is the one layer that already reads EVERY zero-signal turn with
 * full meaning capability. Give it a structured side-channel: a marker ⟦DO:<domain>⟧
 * over a WRITES-ONLY menu, so it can flag "the user asked me to PERFORM this write"
 * without a new keyword lane (doctrine D1 — no new phrasing needs new regex).
 *
 * PURE + zero deps ⇒ PS-mirror-testable; the orchestrator owns the intercept.
 *
 * M8_DO_SENTINEL (3-state):
 *   "shadow" (default at ship) — the prompt asks for the marker AFTER the prose;
 *            orchestrator STRIPS + logs it (do-sentinel:<domain>), user sees only
 *            prose. Measures recognition precision on real turns before it acts.
 *   "on"     — marker-only protocol; the intercept re-enters the lane (S4).
 *   "off"    — rule absent, byte-identical to today.
 */

const DO_MENU = ["tasks", "wallet", "notes", "driver_profile"]; // WRITES ONLY (§4.1)

// ⟦ ⟧ = U+27E6 / U+27E7. Built from escapes so behaviour is encoding-independent.
const L = "⟦", R = "⟧";
const _DOMS = "(tasks|wallet|notes|driver_profile)";
// C1 tolerance: free models drift (stray spaces, case, ASCII brackets when they
// can't emit U+27E6). A drifted marker must still PARSE (telemetry) and STRIP
// (code-guaranteed, spec C1) — but the net stays DO-shaped, so a legit math ⟦n⟧
// in a research answer is never touched.
const MARKER_ONLY_RE  = new RegExp("^\\s*" + L + "\\s*DO\\s*:\\s*" + _DOMS + "\\s*" + R + "\\s*$", "i"); // on-mode: whole reply IS the marker
const MARKER_TRAIL_RE = new RegExp(L + "\\s*DO\\s*:\\s*" + _DOMS + "\\s*" + R + "\\s*$", "i");           // shadow: marker appended after prose
const MARKER_ANY_RE   = new RegExp(L + "\\s*DO\\s*:[^" + R + "]*" + R, "gi");    // strip: ANY DO-shaped ⟦…⟧, even off-menu/malformed
// ASCII-bracket fallback, TRAILING + menu-bound only (so prose like "(DO: call
// the bank)" at the end of a reply can never be eaten).
const MARKER_ASCII_TRAIL_RE = new RegExp("[\\[({]{1,2}\\s*DO\\s*:\\s*" + _DOMS + "\\s*[\\])}]{1,2}\\s*$", "i");

function doSentinelMode() {
  const v = String(process.env.M8_DO_SENTINEL || "").trim().toLowerCase();
  if (v === "on") return "on";
  if (v === "off" || v === "0") return "off";
  return "shadow"; // default at ship (§4.1)
}

// A bare marker-only reply (the `on`-mode protocol). Returns the domain or null.
function parseDoMarker(text) {
  const m = MARKER_ONLY_RE.exec(String(text || ""));
  return m ? m[1].toLowerCase() : null;
}
// A marker appended after prose (the shadow protocol). Returns the domain or null.
function parseTrailingMarker(text) {
  const s = String(text || "");
  const m = MARKER_TRAIL_RE.exec(s) || MARKER_ASCII_TRAIL_RE.exec(s);
  return m ? m[1].toLowerCase() : null;
}
// Remove ANY DO marker from a string (never let one reach the user or persistence).
function stripDoMarker(text) {
  return String(text || "").replace(MARKER_ANY_RE, "").replace(MARKER_ASCII_TRAIL_RE, "");
}

// The shadow prompt rule, appended to a fall-through turn's system instruction.
// Carries a WORKED EXAMPLE + a COUNTER-EXAMPLE (the LLM-prompt lesson: new prompt
// vocab needs one; the ask-ABOUT boundary needs the negative shown, C1 D1).
function shadowPromptRule() {
  return "\n\nDO-SENTINEL (internal side-channel — the user NEVER sees this tag): " +
    "If this turn is the user asking you to PERFORM a write action — set/change/log/save " +
    "something, not asking ABOUT it — then AFTER your normal reply, as the very LAST line, append " +
    "exactly ONE tag from this fixed menu: " +
    L + "DO:tasks" + R + " | " + L + "DO:wallet" + R + " | " + L + "DO:notes" + R + " | " + L + "DO:driver_profile" + R + ". " +
    "Worked example: user says \"throw 30 egp to groceries\" -> your reply ends with a newline then " + L + "DO:wallet" + R + ". " +
    "Counter-example: user says \"how much did I spend on groceries?\" -> that asks ABOUT money, it performs nothing -> append NO tag. " +
    "If the turn is NOT a write request, append nothing. Never explain or mention the tag.";
}

module.exports = {
  DO_MENU, doSentinelMode, parseDoMarker, parseTrailingMarker, stripDoMarker, shadowPromptRule,
  MARKER_ONLY_RE, MARKER_TRAIL_RE,
};
