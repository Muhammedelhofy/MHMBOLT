/**
 * Build-181 — entity-relation recall  (tests/build181_relation_recall.test.js)
 *
 * Run: node tests/build181_relation_recall.test.js
 *
 * Covers the two PURE, load-bearing halves of B-181 (the async wiring around them is
 * grepped by the PS mirror + proven live in prod self-verify):
 *
 *   (A) relationProbeFrom(message)  — the SHAPE recogniser. A meaning-first sentence
 *       probe ("is X my <relation>?"): copula + name-span + possessive, relation NP as
 *       FREE TEXT. Kill-switch M8_RELATION_RECALL=off/0 ⇒ null everywhere.
 *
 *   (B) resolveRelationEntity(name, {card, member, pastMemory}) — the D2 RESOLUTION
 *       GATE, pure over already-fetched signals. THE §4 PII INVARIANT lives here:
 *       an unresolved name returns null ⇒ the caller writes ZERO state ⇒ a stranger's
 *       name can never reach the B-167 grounding guard, its consent flow, or a search.
 *
 * No DB / LLM / network. Doctrine: NO relation vocabulary is asserted — person-hood is
 * decided by RESOLUTION, never a word list (§7.5 grep enforces the source has none).
 */
"use strict";
const assert = require("assert");
const o = require("../lib/orchestrator");
const { relationProbeFrom, resolveRelationEntity } = o;

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) { pass++; } else { fails.push(label); console.log("  FAIL  " + label); } }

// Ensure the flag is ON (default) for the shape/resolution matrices.
delete process.env.M8_RELATION_RECALL;

// ── (A) SHAPE MATRIX — relationProbeFrom ──────────────────────────────────────
function matches(msg, name, relation) {
  const r = relationProbeFrom(msg);
  return r && r.name === name && r.relation === relation;
}
ok("A1 canonical            'is Sara my wife?'",            matches("is Sara my wife?", "Sara", "wife"));
ok("A2 relation is free text 'is Sara my sister?'",        matches("is Sara my sister?", "Sara", "sister"));
ok("A3 negation contraction 'isn't Sara my wife?'",        matches("isn't Sara my wife?", "Sara", "wife"));
ok("A4 curly-apostrophe neg 'isn’t Sara my wife?'",        matches("isn’t Sara my wife?", "Sara", "wife"));
ok("A5 past copula          'was Sara my wife?'",          matches("was Sara my wife?", "Sara", "wife"));
ok("A6 lowercase (chat)     'is sara my wife'",            matches("is sara my wife", "sara", "wife"));
ok("A7 conversational prefix 'ok, is Sara my wife?'",      matches("ok, is Sara my wife?", "Sara", "wife"));
ok("A8 temporal tail        '...my wife this month?'",     matches("is Sara my wife this month?", "Sara", "wife this month"));
ok("A9 'or' compound        '...my wife or my sister?'",   matches("is Sara my wife or my sister?", "Sara", "wife or my sister"));
ok("A10 'our' possessive    'is Khalid our partner?'",     matches("is Khalid our partner?", "Khalid", "partner"));
ok("A11 two-token name      'is Abu Omar my neighbor?'",   matches("is Abu Omar my neighbor?", "Abu Omar", "neighbor"));
ok("A12 AR 'هل سارة زوجتي؟'",                              matches("هل سارة زوجتي؟", "سارة", "زوجتي"));

// Rejects — the shape must NOT fire (these are the guardrail's cheap first line).
ok("A13 reject: no name-span 'is my wife coming?'",        relationProbeFrom("is my wife coming?") === null);
ok("A14 reject: statement    'Sara is my wife'",           relationProbeFrom("Sara is my wife") === null);
ok("A15 reject: tag-question 'Sara is my wife, right?'",   relationProbeFrom("Sara is my wife, right?") === null);
ok("A16 reject: not a relation 'how much did Sara spend'", relationProbeFrom("how much did Sara spend in June") === null);
ok("A17 reject: digits in name 'is 2024 my year?'",        relationProbeFrom("is 2024 my year?") === null);
ok("A18 reject: empty message",                            relationProbeFrom("") === null);
// Junk that DOES match the shape (resolution — not the regex — is the real gate):
ok("A19 shape-only match     'is the sky my favorite color'", !!relationProbeFrom("is the sky my favorite color"));

// ── Kill-switch: M8_RELATION_RECALL=off/0 ⇒ null everywhere ────────────────────
for (const v of ["off", "0", "OFF", "Off"]) {
  process.env.M8_RELATION_RECALL = v;
  ok("K kill-switch '" + v + "' ⇒ null", relationProbeFrom("is Sara my wife?") === null);
}
process.env.M8_RELATION_RECALL = "on"; // any non-off value ⇒ live
ok("K on ⇒ live again", !!relationProbeFrom("is Sara my wife?"));
delete process.env.M8_RELATION_RECALL;

// ── (B) RESOLUTION GATE — resolveRelationEntity ───────────────────────────────
// Resolved via household member.
{
  const r = resolveRelationEntity("Sara", { card: null, member: { id: 1, name: "Sara" }, pastMemory: [] });
  ok("B1 member hit ⇒ knownPersonCard + via", r && r.knownPersonCard === true && r.entityCard === null && r.via === "household member");
}
// Resolved via a stored PROFILE row.
{
  const pm = [{ memory_type: "profile", content: "Muhammad's wife is Sara" }];
  const r = resolveRelationEntity("Sara", { card: null, member: null, pastMemory: pm });
  ok("B2 profile row hit ⇒ knownPersonCard + via", r && r.knownPersonCard === true && r.via === "stored profile memory");
}
// Resolved via a tracked entity CARD — person/company/organization only.
{
  const r = resolveRelationEntity("Terras", { card: "[company] Terras\n  Summary: rooftop bar", member: null, pastMemory: [] });
  ok("B3 company card ⇒ entityCard + via", r && r.entityCard && r.knownPersonCard === false && r.via === "tracked entity card");
}
{
  const r = resolveRelationEntity("Khalid", { card: "[person] Khalid\n  ...", member: null, pastMemory: [] });
  ok("B4 person card ⇒ entityCard", r && r.entityCard && r.via === "tracked entity card");
}
// entity_type GATE: a place card must NOT resolve ("was Riyadh my best month?").
{
  const r = resolveRelationEntity("Riyadh", { card: "[place] Riyadh\n  ...", member: null, pastMemory: [] });
  ok("B5 place card REJECTED (type gate)", r === null);
}
// §4 INVARIANT — unresolved name ⇒ NULL ⇒ caller writes zero state.
{
  const pm = [{ memory_type: "profile", content: "Muhammad's wife is Sara" }]; // does NOT contain the probed name
  ok("B6 §4: no card, no member, no matching profile ⇒ null",
     resolveRelationEntity("Jonathan", { card: null, member: null, pastMemory: pm }) === null);
  ok("B7 §4: only a non-person card ⇒ null",
     resolveRelationEntity("Jonathan", { card: "[place] Jonathan Park", member: null, pastMemory: pm }) === null);
  ok("B8 §4: undefined signals ⇒ null (never throws)",
     resolveRelationEntity("Jonathan", {}) === null && resolveRelationEntity("Jonathan") === null);
}
// Priority: a valid card wins over a member (mirrors the who-is chain order).
{
  const r = resolveRelationEntity("Sara", { card: "[person] Sara\n  ...", member: { id: 1, name: "Sara" }, pastMemory: [] });
  ok("B9 card outranks member", r && r.via === "tracked entity card");
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log("\nBuild-181 relation-recall: " + pass + " passed, " + fails.length + " failed");
if (fails.length) { console.log("FAILURES:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("All Build-181 relation-recall assertions passed.");
