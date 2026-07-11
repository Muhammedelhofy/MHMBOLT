/**
 * lean_thinking_budget.test.js — offline regression for the Lean formalize
 * truncation fix (2026-07-06). No network, no keys.
 *
 * Bug: gemini-2.5-flash spends dynamic/auto "thinking" tokens whenever
 * thinkingConfig is omitted from the request (confirmed live: ~650-670 of a
 * 700-token cap), truncating the Lean draft mid-statement. buildGeminiConfig's
 * old guard `if (thinkingBudget > 0) config.thinkingConfig = ...` silently
 * dropped an EXPLICIT thinkingBudget:0 too, so lib/lean.js's genConfig couldn't
 * actually disable it. Fix: send thinkingConfig whenever a budget was
 * explicitly requested (including 0); only omit the field when nothing was
 * specified at all (needed so 2.0/1.5-flash, which reject the field outright,
 * don't 400).
 *
 * Run: node tests/lean_thinking_budget.test.js
 */
const assert = require("assert");
const { buildGeminiConfig } = require("../lib/llm");

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + name); }
}

const savedEnv = process.env.GEMINI_THINKING_BUDGET;
delete process.env.GEMINI_THINKING_BUDGET;

// 1) explicit 0 (the Lean draft call, and domain-arbiter/intent-router/orchestrator's
//    fast-JSON calls) MUST send thinkingConfig:{thinkingBudget:0} — this is the bug.
{
  const cfg = buildGeminiConfig("sys", { temperature: 0, maxOutputTokens: 700, thinkingBudget: 0 });
  ok("explicit thinkingBudget:0 sends thinkingConfig", !!cfg.thinkingConfig);
  ok("explicit thinkingBudget:0 value is 0", cfg.thinkingConfig && cfg.thinkingConfig.thinkingBudget === 0);
}

// 2) explicit positive budget (deep-reasoning mode) still works as before.
{
  const cfg = buildGeminiConfig("sys", { temperature: 0.3, maxOutputTokens: 2000, thinkingBudget: 4096 });
  ok("explicit positive thinkingBudget sends thinkingConfig", !!cfg.thinkingConfig);
  ok("explicit positive thinkingBudget value preserved", cfg.thinkingConfig && cfg.thinkingConfig.thinkingBudget === 4096);
}

// 3) nothing specified at all (no genConfig.thinkingBudget, no env) -> field
//    OMITTED entirely, unchanged from before (needed for 2.0/1.5-flash, which
//    400 if thinkingConfig is present at all).
{
  const cfg = buildGeminiConfig("sys", { temperature: 0, maxOutputTokens: 300 });
  ok("unset thinkingBudget omits thinkingConfig entirely", cfg.thinkingConfig === undefined);
}

// 4) GEMINI_THINKING_BUDGET env set (opt-in upgrade path) still works, including
//    the env explicitly being "0" (should also now send, not omit).
{
  process.env.GEMINI_THINKING_BUDGET = "8192";
  const cfg = buildGeminiConfig("sys", { temperature: 0, maxOutputTokens: 300 });
  ok("env thinkingBudget sends thinkingConfig", cfg.thinkingConfig && cfg.thinkingConfig.thinkingBudget === 8192);
  delete process.env.GEMINI_THINKING_BUDGET;
}

// 5) per-call genConfig.thinkingBudget:0 wins over a positive env value (the
//    Lean draft call must be able to force thinking off even if some future
//    env opts other lanes into deep reasoning).
{
  process.env.GEMINI_THINKING_BUDGET = "8192";
  const cfg = buildGeminiConfig("sys", { temperature: 0, maxOutputTokens: 700, thinkingBudget: 0 });
  ok("per-call 0 overrides positive env", cfg.thinkingConfig && cfg.thinkingConfig.thinkingBudget === 0);
  delete process.env.GEMINI_THINKING_BUDGET;
}

if (savedEnv !== undefined) process.env.GEMINI_THINKING_BUDGET = savedEnv;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
