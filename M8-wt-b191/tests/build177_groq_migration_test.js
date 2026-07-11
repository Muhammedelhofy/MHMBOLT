"use strict";
/**
 * build177_groq_migration_test.js — authoritative unit contract for groqQuirks()
 * (B-177 Groq migration). Pure/offline: no network, no key. Requires node_modules
 * (llm.js loads @google/genai at module top). The PS-5.1 mirror
 * (build177_groq_migration.test.ps1) re-implements the SAME logic for the offline
 * battery — a PS-only fail with a JS pass means a MIRROR bug, not a source bug.
 *
 * Run:  node tests/build177_groq_migration_test.js
 */
const assert = require("assert");
const { groqQuirks } = require("../lib/llm.js");

let pass = 0, fail = 0;
function T(label, fn) {
  try { fn(); pass++; console.log("PASS  " + label); }
  catch (e) { fail++; console.log("FAIL  " + label + "  -> " + e.message); }
}

// clean env between cases (tests may set these)
function resetEnv() {
  delete process.env.M8_GROQ_QUIRKS;
  delete process.env.M8_GROQ_REASONING_EFFORT;
  delete process.env.M8_GROQ_MIN_MAXTOKENS;
}

// ── gpt-oss family: the reasoning fix + max_tokens floor ─────────────────────
T("gpt-oss: include_reasoning=false", () => {
  resetEnv();
  const p = groqQuirks("openai/gpt-oss-120b", { model: "x", max_tokens: 60 });
  assert.strictEqual(p.include_reasoning, false);
});
T("gpt-oss: reasoning_effort defaults to low", () => {
  resetEnv();
  const p = groqQuirks("openai/gpt-oss-120b", { max_tokens: 60 });
  assert.strictEqual(p.reasoning_effort, "low");
});
T("gpt-oss: max_tokens floored 60 -> 1024", () => {
  resetEnv();
  const p = groqQuirks("openai/gpt-oss-120b", { max_tokens: 60 });
  assert.strictEqual(p.max_tokens, 1024);
});
T("gpt-oss: floor never LOWERS an already-large max_tokens (2048 stays)", () => {
  resetEnv();
  const p = groqQuirks("openai/gpt-oss-120b", { max_tokens: 2048 });
  assert.strictEqual(p.max_tokens, 2048);
});
T("gpt-oss: absent max_tokens becomes the floor", () => {
  resetEnv();
  const p = groqQuirks("openai/gpt-oss-120b", {});
  assert.strictEqual(p.max_tokens, 1024);
});
T("gpt-oss: M8_GROQ_REASONING_EFFORT overrides effort", () => {
  resetEnv();
  process.env.M8_GROQ_REASONING_EFFORT = "medium";
  const p = groqQuirks("openai/gpt-oss-120b", { max_tokens: 60 });
  assert.strictEqual(p.reasoning_effort, "medium");
  resetEnv();
});
T("gpt-oss: M8_GROQ_MIN_MAXTOKENS overrides the floor", () => {
  resetEnv();
  process.env.M8_GROQ_MIN_MAXTOKENS = "512";
  const p = groqQuirks("openai/gpt-oss-120b", { max_tokens: 60 });
  assert.strictEqual(p.max_tokens, 512);
  resetEnv();
});

// ── qwen family: hidden reasoning + effort none ──────────────────────────────
T("qwen: reasoning_format=hidden, effort=none, floored", () => {
  resetEnv();
  const p = groqQuirks("qwen/qwen3.6-27b", { max_tokens: 100 });
  assert.strictEqual(p.reasoning_format, "hidden");
  assert.strictEqual(p.reasoning_effort, "none");
  assert.strictEqual(p.max_tokens, 1024);
  assert.strictEqual(p.include_reasoning, undefined); // qwen path must NOT set include_reasoning
});

// ── llama / unknown: strict identity (today's behaviour, byte-identical) ──────
T("llama: identity (same object reference)", () => {
  resetEnv();
  const base = { model: "llama-3.3-70b-versatile", max_tokens: 60 };
  assert.strictEqual(groqQuirks("llama-3.3-70b-versatile", base), base);
});
T("llama-3.1-8b-instant: identity", () => {
  resetEnv();
  const base = { max_tokens: 60 };
  assert.strictEqual(groqQuirks("llama-3.1-8b-instant", base), base);
});
T("unknown model: identity", () => {
  resetEnv();
  const base = { max_tokens: 60 };
  assert.strictEqual(groqQuirks("mistral-small-latest", base), base);
});

// ── kill-switch: M8_GROQ_QUIRKS=0 => identity even for gpt-oss ────────────────
T("kill-switch M8_GROQ_QUIRKS=0 => identity for gpt-oss", () => {
  resetEnv();
  process.env.M8_GROQ_QUIRKS = "0";
  const base = { model: "openai/gpt-oss-120b", max_tokens: 60 };
  assert.strictEqual(groqQuirks("openai/gpt-oss-120b", base), base);
  resetEnv();
});
T("kill-switch only '0' disables (any other value = active)", () => {
  resetEnv();
  process.env.M8_GROQ_QUIRKS = "1";
  const p = groqQuirks("openai/gpt-oss-120b", { max_tokens: 60 });
  assert.strictEqual(p.include_reasoning, false);
  resetEnv();
});

// ── purity: the input payload is never mutated ───────────────────────────────
T("purity: input payload untouched (gpt-oss)", () => {
  resetEnv();
  const base = { model: "openai/gpt-oss-120b", max_tokens: 60, response_format: { type: "json_object" } };
  const snap = JSON.stringify(base);
  groqQuirks("openai/gpt-oss-120b", base);
  assert.strictEqual(JSON.stringify(base), snap);
});
T("purity: response_format carried through onto the copy", () => {
  resetEnv();
  const p = groqQuirks("openai/gpt-oss-120b", { max_tokens: 60, response_format: { type: "json_object" } });
  assert.deepStrictEqual(p.response_format, { type: "json_object" });
});

// ── parser-contract: the loose brace-slice the JSON callers use survives clean
//    quirked output, and the invariants that GUARANTEE non-empty content hold ──
function looseJson(text) {
  if (typeof text !== "string") return null;
  const s = text.replace(/```json/gi, "").replace(/```/g, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { return null; }
}
T("parser-contract: loose slice parses clean arbiter JSON", () => {
  assert.deepStrictEqual(looseJson('{"domain":"wallet"}'), { domain: "wallet" });
});
T("parser-contract: loose slice tolerates whitespace/newlines", () => {
  assert.deepStrictEqual(looseJson('{\n  "op": "add",\n  "command": "remind me" }'), { op: "add", command: "remind me" });
});
T("parser-contract: empty content -> null (would fail the extraction contract)", () => {
  assert.strictEqual(looseJson(""), null);
});
T("parser-contract: quirks guarantee the two anti-blank invariants for gpt-oss", () => {
  resetEnv();
  const p = groqQuirks("openai/gpt-oss-120b", { max_tokens: 60 });
  // (a) answer must land in message.content, not reasoning:
  assert.strictEqual(p.include_reasoning, false);
  // (b) max_tokens must not be so small a reasoning burn starves the answer:
  assert.ok(p.max_tokens >= 1024);
});

console.log(`\n=== B-177 groqQuirks: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
