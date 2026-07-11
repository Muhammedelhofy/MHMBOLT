"use strict";
/**
 * lean_formalize_truncation_probe.js — Step-1 repro for the Lean formalize
 * truncation bug (live Path-0 finding, 2026-07-06): "formalize and verify in
 * Lean: for all natural a b, (10a+b) % 9 = (a+b) % 9" came back lean_rejected
 * with a Lean parse error because the drafted code was truncated mid-statement.
 *
 * Calls the EXACT same path as lib/lean.js's draft() call: generateOnce with
 * provider="gemini", model=null (→ configured GEMINI_MODEL), LEAN_SYSTEM as the
 * system instruction, genConfig {temperature:0, maxOutputTokens:700}. Reports
 * the raw text, its length, and the RAW Gemini response's usageMetadata
 * (promptTokenCount / candidatesTokenCount / thoughtsTokenCount / finishReason)
 * so we can see whether thinking tokens are being spent even though
 * GEMINI_THINKING_BUDGET is unset (confirmed absent from prod env, per
 * reports/build-177-env-audit.md and a live 2026-07-06 dashboard check).
 *
 * Key loading mirrors tests/ctx_cache_probe.js: env var first, then
 * .env.local (gitignored), value never printed. This repo's .env.local has
 * the test key stored as `gemini_api_key_3` (a disposable AI-Studio key, NOT
 * the prod GEMINI_API_KEY, which Vercel has flagged Sensitive/unrecoverable).
 *
 * Run:  node tests/lean_formalize_truncation_probe.js   (from M8-wt-lean-fix/)
 */
const fs = require("fs");
const path = require("path");

function loadKey(envName, fileName) {
  if (process.env[envName]) return true;
  try {
    const txt = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = new RegExp("^\\s*" + fileName + "\\s*=\\s*(.+?)\\s*$", "i").exec(line);
      if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (v) { process.env[envName] = v; return true; }
      }
    }
  } catch (_) { /* no .env.local */ }
  return !!process.env[envName];
}

async function main() {
  const haveKey = loadKey("GEMINI_API_KEY", "gemini_api_key_3");
  console.log("GEMINI_API_KEY loaded from .env.local (gemini_api_key_3):", haveKey);
  if (!haveKey) { console.log("FATAL: no key available."); process.exit(1); }

  console.log("GEMINI_MODEL env:", process.env.GEMINI_MODEL || "(unset -> code default gemini-1.5-flash)");
  console.log("GEMINI_THINKING_BUDGET env:", process.env.GEMINI_THINKING_BUDGET || "(unset)");

  // Reach into the SAME buildGeminiConfig path llm.js uses, but call the SDK
  // directly here so we can inspect the RAW response (generateOnce only
  // returns extracted text, hiding usageMetadata/finishReason from the caller).
  const { GoogleGenAI } = require("@google/genai");
  const { LEAN_SYSTEM, buildLeanDirective } = require("../lib/lean.js");

  const claim = "for all natural numbers a and b, (10*a + b) % 9 = (a + b) % 9";
  const { system, user } = buildLeanDirective({ goal: `formalize and verify in Lean: ${claim}` });

  // Test BOTH the prod model (gemini-2.5-flash, per memory) and 1.5-flash for
  // contrast, so we can see whether the truncation is 2.5-specific.
  const modelsToTest = [
    process.env.GEMINI_MODEL || "gemini-2.5-flash",
    "gemini-1.5-flash",
  ];

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  for (const model of modelsToTest) {
    console.log("\n=== model:", model, "===");
    const config = {
      systemInstruction: system,
      temperature: 0,
      maxOutputTokens: 700,
      // NOTE: thinkingConfig intentionally OMITTED here, exactly as
      // buildGeminiConfig does when thinkingBudget resolves to 0 — this is
      // the exact prod code path (llm.js:78-85).
    };
    try {
      const result = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: user }] }],
        config,
      });
      const cand = result?.candidates?.[0];
      const usage = result?.usageMetadata || {};
      let text = "";
      try { text = result.text || ""; } catch (_) { /* getter can throw */ }
      console.log("finishReason:", cand?.finishReason);
      console.log("usageMetadata:", JSON.stringify(usage));
      console.log("text length:", text.length);
      console.log("text (raw):\n" + text);
      console.log("--- truncated mid-statement? ---", !/\bomega\b|\bdecide\b|\bnorm_num\b|\bsimp\b|\bring\b|\brfl\b|\bsorry\b|UNFORMALIZABLE/.test(text));
    } catch (err) {
      console.log("ERROR calling model", model, ":", err.message);
    }
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
