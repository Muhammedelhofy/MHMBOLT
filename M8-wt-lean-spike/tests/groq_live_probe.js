"use strict";
/**
 * groq_live_probe.js — B-177 Groq migration GO/NO-GO gate (SPEC §5).
 *
 * Calls the REAL lib/llm.js generate() with providerOrder:"groq" and GROQ_MODEL
 * swapped per run, so the exact prod parser path (payload build -> fetch ->
 * content extraction) is what's tested — NOT a lookalike. The groqQuirks() hook
 * (already wired into generateGroq) supplies the reasoning-model params; the
 * BARE gpt-oss run flips M8_GROQ_QUIRKS=0 to document the 2026-06-30 blank trap.
 *
 * NETWORK + KEY required — this is why the file is NOT named *.test.ps1 (it must
 * never enter the offline battery). Set the key locally, never commit/echo it:
 *   $env:GROQ_API_KEY = "..."         (PowerShell, current shell)   OR
 *   put  GROQ_API_KEY=...  in  M8/.env.local  (gitignored)
 * The script prints only  "key: set" / "key: missing"  — never the value.
 *
 * Run:  node tests/groq_live_probe.js      (from the M8/ dir)
 *   or:  powershell -File tests/groq_live_probe.ps1   (PATH->Kimi node fallback)
 *
 * Output: a verdict table (model x shape, PASS/FAIL + latency) to stdout AND to
 *   reports/build-177-probe.json + reports/build-177-probe.md  (C1 evidence).
 */
const fs   = require("fs");
const path = require("path");

// ── key loading (env first, then gitignored .env.local) — value never printed ──
function loadKey() {
  if (process.env.GROQ_API_KEY) return true;
  const envPath = path.join(__dirname, "..", ".env.local");
  try {
    const txt = fs.readFileSync(envPath, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = /^\s*GROQ_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
      if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (v) { process.env.GROQ_API_KEY = v; return true; }
      }
    }
  } catch (_) { /* no .env.local */ }
  return !!process.env.GROQ_API_KEY;
}

// Fresh generate() per call — resets the in-memory circuit breaker so a blank/429
// on one model can't mask the next model as "cooling down" (a test artifact).
function freshGenerate() {
  delete require.cache[require.resolve("../lib/llm.js")];
  return require("../lib/llm.js").generate;
}

// Loose brace-slice JSON parse — byte-mirror of orchestrator _looseJson / the
// arbiter+intent-router _extractJson, the real consumers of the JSON shapes.
function looseJson(text) {
  if (typeof text !== "string") return null;
  const s = text.replace(/```json/gi, "").replace(/```/g, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { return null; }
}

const hasThink = (t) => /<think|<\|/i.test(String(t || ""));
const sleep    = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the three shapes (mirror the live call sites byte-for-byte) ──────────────
const ARB_SYS = [
  "You are a domain router for a personal assistant. Classify the user's message",
  "into EXACTLY ONE domain from: wallet, fleet, tasks, chat.",
  "Numbers are masked as # for privacy. Output ONLY JSON, no prose, no markdown:",
  '{"domain":"wallet"|"fleet"|"tasks"|"chat"}',
  '"spent # on groceries" => {"domain":"wallet"}',
  '"how is the fleet doing" => {"domain":"fleet"}',
].join("\n");

const TASK_SYS = [
  "You normalise a user's message into ONE canonical task command. Output ONLY JSON —",
  'no prose, no markdown, no code fences. Schema: {"op":"add"|"list"|"done"|"delete"|"none","command":string}',
  '- op=add: a NEW reminder/task. command = "remind me to <what> <when>" — keep their EXACT time/date words.',
  '- op=none: NOT a task request. command = "".',
  '"note down to renew the iqama next week" => {"op":"add","command":"remind me to renew the iqama next week"}',
].join("\n");

const SHAPES = [
  {
    id: "A-chat", mirrors: "orchestrator chat",
    genConfig: { temperature: 0, maxOutputTokens: 2048 },
    canaries: [
      { name: "EN", sys: "", user: "Reply with exactly one word: the capital of France.",
        ok: (t) => !!t && !hasThink(t) && /paris/i.test(t) },
      { name: "AR", sys: "", user: "أجب بكلمة واحدة فقط: ما هي عاصمة فرنسا؟",
        ok: (t) => !!t && !hasThink(t) && /باريس|paris/i.test(t) },
    ],
  },
  {
    id: "B-arbiter", mirrors: "domain-arbiter (60 tok, json)",
    genConfig: { temperature: 0, maxOutputTokens: 60, responseFormat: { type: "json_object" } },
    canaries: [
      // Unambiguous wallet (groceries) so EVERY competent model agrees — isolating
      // the PARSER as the only variable (an ambiguous "fuel for the camry" tests
      // model judgment, not parser compatibility, and split llama vs qwen on run 1).
      { name: "wallet", sys: ARB_SYS, user: "spent # on groceries at the supermarket this week",
        ok: (t) => { const j = looseJson(t); return !!j && String(j.domain).toLowerCase() === "wallet"; } },
    ],
  },
  {
    id: "C-task", mirrors: "task extractor (100 tok, json)",
    genConfig: { temperature: 0, maxOutputTokens: 100, responseFormat: { type: "json_object" } },
    canaries: [
      { name: "EN", sys: TASK_SYS, user: "remind me to check the oil tomorrow at 9am",
        ok: (t) => { const j = looseJson(t); return !!j && j.op === "add" && typeof j.command === "string" && j.command.length > 0; } },
      { name: "AR", sys: TASK_SYS, user: "ذكرني أفحص الزيت بكرة الساعة ٩",
        ok: (t) => { const j = looseJson(t); return !!j && j.op === "add" && typeof j.command === "string" && j.command.length > 0; } },
    ],
  },
];

// model runs (SPEC §5 protocol order). quirksOff => flip M8_GROQ_QUIRKS=0.
const RUNS = [
  { key: "llama-3.3-baseline", model: "llama-3.3-70b-versatile", quirksOff: false, note: "BASELINE (alive until 2026-08-16)" },
  { key: "gpt-oss-120b-bare",  model: "openai/gpt-oss-120b",     quirksOff: true,  note: "documents the 06-30 blank trap" },
  { key: "gpt-oss-120b-quirks",model: "openai/gpt-oss-120b",     quirksOff: false, note: "PRIMARY candidate + quirks" },
  { key: "qwen3.6-27b-quirks", model: "qwen/qwen3.6-27b",        quirksOff: false, note: "fallback #1 + quirks" },
  { key: "llama-3.1-8b",       model: "llama-3.1-8b-instant",    quirksOff: false, note: "fallback #2 (floor, no quirks)" },
];

async function runOne(runCfg, shape, canary) {
  process.env.GROQ_MODEL = runCfg.model;
  if (runCfg.quirksOff) process.env.M8_GROQ_QUIRKS = "0"; else delete process.env.M8_GROQ_QUIRKS;
  // Retry ONLY on 429 (transient free-tier throttle — gpt-oss has the tightest
  // TPM). A 400/blank is a real parser result and is NOT retried (that's the trap
  // signal we must record faithfully). Fresh generate() per attempt resets the
  // in-memory circuit breaker so a prior 429 can't mask this call as "cooling down".
  let last = { pass: false, ms: 0, sample: "", reason: "" };
  for (let attempt = 0; attempt < 4; attempt++) {
    const generate = freshGenerate();
    const t0 = Date.now();
    try {
      const text = await generate({
        systemInstruction: canary.sys || undefined,
        contents: [{ role: "user", parts: [{ text: canary.user }] }],
        providerOrder: "groq",
        genConfig: shape.genConfig,
      });
      const ms = Date.now() - t0;
      const pass = !!canary.ok(text);
      return { pass, ms, sample: String(text || "").replace(/\s+/g, " ").slice(0, 80), reason: pass ? "ok" : "wrong-answer" };
    } catch (e) {
      const ms = Date.now() - t0;
      const msg = String(e && e.message || e).replace(/\s+/g, " ");
      const is429 = /429|rate.?limit/i.test(msg);
      last = { pass: false, ms, sample: "ERR: " + msg.slice(0, 90), reason: is429 ? "rate-limited" : (/400|validate JSON|no text|empty/i.test(msg) ? "parser-fail" : "error") };
      if (is429 && attempt < 3) { await sleep(3000 * (attempt + 1)); continue; } // 3s,6s,9s backoff
      return last;
    }
  }
  return last;
}

(async () => {
  const keySet = loadKey();
  console.log("── B-177 Groq live probe ──");
  console.log("key: " + (keySet ? "set" : "missing"));
  console.log("date: " + new Date().toISOString());
  if (!keySet) {
    console.log("\nNO KEY — set $env:GROQ_API_KEY or add GROQ_API_KEY=... to M8/.env.local, then re-run.");
    process.exit(2);
  }

  const results = {}; // key -> { note, shapes: { shapeId: { canaries:[{name,pass,ms,sample}], pass } }, allPass }
  for (const runCfg of RUNS) {
    const rec = { note: runCfg.note, model: runCfg.model, shapes: {}, allPass: true };
    for (const shape of SHAPES) {
      const cans = [];
      let shapePass = true;
      for (const canary of shape.canaries) {
        const r = await runOne(runCfg, shape, canary);
        cans.push({ name: canary.name, ...r });
        if (!r.pass) shapePass = false;
        await sleep(2000); // wider spacing — gpt-oss has the tightest free-tier TPM
      }
      rec.shapes[shape.id] = { canaries: cans, pass: shapePass };
      if (!shapePass) rec.allPass = false;
    }
    results[runCfg.key] = rec;
    console.log(`  ran ${runCfg.key.padEnd(22)} -> ${rec.allPass ? "ALL PASS" : "has fail"}`);
  }

  // ── verdict table ──
  const shapeIds = SHAPES.map((s) => s.id);
  const head = "| model run | " + shapeIds.join(" | ") + " | verdict |";
  const sep  = "|" + "---|".repeat(shapeIds.length + 2);
  const rows = RUNS.map((rc) => {
    const rec = results[rc.key];
    const cells = shapeIds.map((sid) => {
      const s = rec.shapes[sid];
      const maxMs = Math.max(...s.canaries.map((c) => c.ms));
      if (s.pass) return `PASS (${maxMs}ms)`;
      // annotate WHY a shape failed so a transient rate-limit is never mistaken for a parser fail
      const reasons = [...new Set(s.canaries.filter((c) => !c.pass).map((c) => c.reason))].join(",");
      return `FAIL:${reasons} (${maxMs}ms)`;
    });
    return `| ${rc.key} | ` + cells.join(" | ") + ` | ${rec.allPass ? "ADOPTABLE" : "reject"} |`;
  });
  const table = [head, sep, ...rows].join("\n");

  // decision per §3 tree
  const pick =
    results["gpt-oss-120b-quirks"].allPass ? "openai/gpt-oss-120b  (branch 1 — expected)" :
    results["qwen3.6-27b-quirks"].allPass  ? "qwen/qwen3.6-27b  (branch 2 — preview risk, note in BUILD_LOG)" :
    results["llama-3.1-8b"].allPass        ? "llama-3.1-8b-instant  (branch 3 — prepend gemini,gemini2 to ROUTING LOOKUP/LIVE_DATA)" :
                                             "NONE — STOP, escalate to FABLE (§3 branch 4) with this table";

  console.log("\n" + table);
  console.log("\nbaseline (llama-3.3) allPass: " + results["llama-3.3-baseline"].allPass);
  console.log("gpt-oss BARE (trap) allPass:   " + results["gpt-oss-120b-bare"].allPass + "  (expected: false)");
  console.log("DECISION (§3 tree): " + pick);

  // ── persist to reports/ ──
  const reportsDir = path.join(__dirname, "..", "reports");
  try { fs.mkdirSync(reportsDir, { recursive: true }); } catch (_) {}
  const stamp = new Date().toISOString();
  fs.writeFileSync(path.join(reportsDir, "build-177-probe.json"),
    JSON.stringify({ date: stamp, decision: pick, results }, null, 2));
  const md = [
    "# B-177 Groq migration — live probe verdict",
    "", `Date: ${stamp}`, "",
    "Each shape runs through the REAL `lib/llm.js generate()` (providerOrder:\"groq\"),",
    "GROQ_MODEL swapped per run; gpt-oss BARE flips M8_GROQ_QUIRKS=0 to show the trap.",
    "", table, "",
    `- baseline llama-3.3 all shapes pass: **${results["llama-3.3-baseline"].allPass}**`,
    `- gpt-oss-120b BARE all pass: **${results["gpt-oss-120b-bare"].allPass}** (expected false — the 06-30 trap)`,
    "", `**DECISION (§3 tree): ${pick}**`, "",
    "<details><summary>samples</summary>", "", "```json",
    JSON.stringify(results, null, 2), "```", "</details>", "",
  ].join("\n");
  fs.writeFileSync(path.join(reportsDir, "build-177-probe.md"), md);
  console.log("\nsaved: reports/build-177-probe.json + reports/build-177-probe.md");

  // exit 0 if a model is adoptable, 3 if we must escalate
  process.exit(pick.startsWith("NONE") ? 3 : 0);
})().catch((e) => { console.error("probe crashed:", e); process.exit(1); });
