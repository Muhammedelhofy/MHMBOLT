/**
 * B-192 (Meaning-First v3 S1) — the SCORED fixture runner for understand().
 *
 * Run (host has no PATH node; Kimi runtime + main-checkout node_modules):
 *   NODE_PATH="...\Bolt\M8\node_modules" node.exe tests/understand_fixtures_test.js
 *   NODE_PATH="...\Bolt\M8\node_modules" node.exe tests/understand_fixtures_test.js --offline
 *
 * DOCTRINE: this is a SCORED PASS-RATE over Muhammad's real phrasings, not a
 * byte mirror (★ M8 DOCTRINE, 2026-07-08). Two verdicts come out of a run:
 *   1. CONTRACT (hard gate, exit code): every understand() result must carry the
 *      EXACT 7-key shape — a contract break fails the run.
 *   2. MEANING SCORE (reported, soaked): per-case expectation checks; 100% is
 *      NOT required at S1 — this is the shadow baseline we measure against.
 *
 * --offline: no network. Drives the same plumbing (prompt build → parse →
 * normalize → contract assert) through a stubbed generate(), so the contract
 * gate is checkable without a key. Meaning is NOT scored offline.
 *
 * Keys: reads GROQ_API_KEY etc. from the environment, falling back to a
 * gitignored .env.local (this worktree, then ../M8/.env.local). Values are
 * never printed.
 */
"use strict";

const fs = require("fs");
const path = require("path");

// ── minimal .env.local loader (never prints values) ─────────────────────────
function loadEnvLocal() {
  const candidates = [
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", "..", "M8", ".env.local"),
  ];
  for (const f of candidates) {
    try {
      const txt = fs.readFileSync(f, "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch (_) { /* absent is fine */ }
  }
}
loadEnvLocal();

const U = require("../lib/understand");
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "understand_fixtures.json"), "utf8"));
const OFFLINE = process.argv.includes("--offline");

const CONTRACT_KEYS = ["reference", "intent", "capability", "understanding_confidence", "execution_confidence", "reasoning_path", "clarify"];

function contractOk(u) {
  if (!u || typeof u !== "object") return "result is null/non-object";
  const keys = Object.keys(u).sort();
  const want = CONTRACT_KEYS.slice().sort();
  if (keys.length !== want.length || keys.some((k, i) => k !== want[i])) {
    return "keys mismatch: [" + keys.join(",") + "]";
  }
  if (u.reference !== null && typeof u.reference !== "string") return "reference type";
  if (typeof u.intent !== "string" || !u.intent) return "intent type";
  if (typeof u.capability !== "string" || U.CAPABILITY_MENU.indexOf(u.capability) === -1) return "capability off-menu: " + u.capability;
  if (typeof u.understanding_confidence !== "number" || u.understanding_confidence < 0 || u.understanding_confidence > 1) return "uc range";
  if (typeof u.execution_confidence !== "number" || u.execution_confidence < 0 || u.execution_confidence > 1) return "ec range";
  const rp = u.reasoning_path;
  if (!rp || typeof rp !== "object" || typeof rp.because !== "string") return "reasoning_path shape";
  if (typeof u.clarify !== "boolean") return "clarify type";
  return null;
}

// One expectation check → [ok, label] pairs so the report shows WHICH check failed.
function scoreCase(u, expect) {
  const checks = [];
  if (expect.capability) checks.push([expect.capability.indexOf(u.capability) !== -1, "capability∈[" + expect.capability.join("|") + "] got=" + u.capability]);
  if (expect.intent_domain) checks.push([u.intent.split(".")[0] === expect.intent_domain, "intent_domain=" + expect.intent_domain + " got=" + u.intent]);
  if (expect.reference === "required") checks.push([u.reference !== null, "reference required got=" + JSON.stringify(u.reference)]);
  if (expect.reference === "null") checks.push([u.reference === null, "reference null got=" + JSON.stringify(u.reference)]);
  if (expect.uc_min != null) checks.push([u.understanding_confidence >= expect.uc_min, "uc>=" + expect.uc_min + " got=" + u.understanding_confidence]);
  if (expect.uc_max != null) checks.push([u.understanding_confidence <= expect.uc_max, "uc<=" + expect.uc_max + " got=" + u.understanding_confidence]);
  if (expect.ec_min != null) checks.push([u.execution_confidence >= expect.ec_min, "ec>=" + expect.ec_min + " got=" + u.execution_confidence]);
  if (expect.ec_max != null) checks.push([u.execution_confidence <= expect.ec_max, "ec<=" + expect.ec_max + " got=" + u.execution_confidence]);
  if (expect.clarify === true || expect.clarify === false) checks.push([u.clarify === expect.clarify, "clarify=" + expect.clarify + " got=" + u.clarify]);
  return checks;
}

// --offline stub: a fixed, VALID model reply — exercises parse+normalize+contract.
async function stubGenerate() {
  return JSON.stringify({
    reference: null, intent: "chat.reply", capability: "chat",
    understanding_confidence: 0.5, execution_confidence: 0.5,
    reasoning_path: { reference: null, intent: "chat.reply", because: "offline stub" },
    clarify: false,
  });
}

(async () => {
  if (!OFFLINE && !process.env.GROQ_API_KEY) {
    console.error("No GROQ_API_KEY in env or .env.local — run with --offline for the contract-only mode.");
    process.exit(2);
  }

  const deps = OFFLINE ? { generate: stubGenerate } : undefined;
  let contractBreaks = 0, infraSkips = 0, meaningPass = 0, meaningTotal = 0;
  const lines = [];

  // Groq free tier is TPM-limited (~8k tokens/min; each call ≈1.5-2.5k with the
  // gpt-oss reasoning burn) — pace to ~3 calls/min and retry once through the
  // 60s circuit-breaker cooldown. A rate limit is an INFRA skip, never a
  // contract break: the contract gate judges the code, not Groq's quota.
  const GAP_MS = OFFLINE ? 0 : 16000;
  const _isInfra = (m) => /429|rate.?limit|cooling down|providers failed/i.test(String(m || ""));

  for (const c of fixture.cases) {
    let u = null, err = null, ms = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const t0 = Date.now();
      err = null;
      try { u = await U.understand(c.message, c.history, deps); } catch (e) { err = e; }
      ms = Date.now() - t0;
      if (!err || !_isInfra(err.message)) break;
      lines.push("… " + c.id + " rate-limited (attempt " + (attempt + 1) + "), waiting 70s for the cooldown");
      await new Promise((r) => setTimeout(r, 70000));
    }

    if (err && _isInfra(err.message)) {
      infraSkips++;
      lines.push("~ INFRA-SKIP " + c.id + " — provider quota exhausted after retries (not a contract break)");
      continue;
    }
    const cErr = err ? ("threw: " + err.message) : contractOk(u);
    if (cErr) {
      contractBreaks++;
      lines.push("✗ CONTRACT  " + c.id + " — " + cErr);
      continue;
    }

    if (OFFLINE) { lines.push("✓ contract  " + c.id + " (offline, meaning not scored)"); continue; }

    meaningTotal++;
    const checks = scoreCase(u, c.expect);
    const failed = checks.filter((x) => !x[0]);
    if (failed.length === 0) {
      meaningPass++;
      lines.push("✓ " + c.id + "  (" + ms + "ms)  cap=" + u.capability + " uc=" + u.understanding_confidence.toFixed(2) + " ec=" + u.execution_confidence.toFixed(2) + " cl=" + u.clarify + " ref=" + (u.reference ? "y" : "-"));
    } else {
      lines.push("✗ " + c.id + "  (" + ms + "ms)  FAILED: " + failed.map((x) => x[1]).join(" ; "));
      lines.push("    full: " + JSON.stringify(u));
    }

    // Acceptance proof — always dump tonight's case in full.
    if (c.id === "remaining_after_balance") {
      lines.push("  ── ACCEPTANCE (tonight's bug) full output ──");
      lines.push("  " + JSON.stringify(u, null, 2).split("\n").join("\n  "));
    }

    await new Promise((r) => setTimeout(r, GAP_MS)); // pace under the free-tier TPM cap
  }

  console.log(lines.join("\n"));
  console.log("");
  if (OFFLINE) {
    console.log("CONTRACT (offline): " + (fixture.cases.length - contractBreaks) + "/" + fixture.cases.length + " clean");
  } else {
    console.log("CONTRACT: " + (contractBreaks === 0 ? "EXACT 7-key shape on all " + meaningTotal + " scored fixtures ✓" : contractBreaks + " BREAKS ✗") + (infraSkips ? " (" + infraSkips + " infra-skipped on provider quota)" : ""));
    console.log("MEANING PASS-RATE (S1 shadow baseline, 100% NOT required): " + meaningPass + "/" + meaningTotal + " (" + Math.round((meaningPass / Math.max(1, meaningTotal)) * 100) + "%)");
  }
  process.exit(contractBreaks === 0 ? 0 : 1); // the CONTRACT is the hard gate; meaning soaks
})();
