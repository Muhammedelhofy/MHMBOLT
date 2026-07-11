/**
 * Build-180 — routing mis-route fix  (tests/build180_routing_fix.test.js)
 *
 * Run: node tests/build180_routing_fix.test.js
 *
 * The two live mis-routes this build kills (NEXT_SESSION_BRIEF Session-68/69):
 *   (1) a bare identity question about a household-wallet member — "who is Sara?",
 *       "is Sara my wife?" — routed to WALLET (memberHit forced wallet=strong) and
 *       never reached the memory compose. It is MEMORY: a person is memory even when
 *       that person owns a wallet.
 *   (2) a business-P&L cost line — "what's my COGS / marketing spend?" — routed to
 *       WALLET (the word "spend" leaked, and finance had no COGS/marketing vocab). It
 *       is FINANCE.
 *
 * The fixture (intent_gate_test.js) covers the resolveIntent() leg. This file covers
 * the LOAD-BEARING legs the fixture can't: the async arbiter (arbitrate/classifyAll —
 * the senior wallet⇄fleet authority whose memberHit->wallet_strong actually drove the
 * live route) and the wallet-gate finance-STRONG deferral predicate.
 */
"use strict";
const assert = require("assert");
const reg = require("../lib/capability-registry");
const arb = require("../lib/domain-arbiter");

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) { pass++; } else { fails.push(label); console.log("  FAIL  " + label); } }

(async () => {
  // ── (1) IDENTITY QUESTION ABOUT A WALLET MEMBER → MEMORY, never wallet ──────────
  // The live condition: Sara IS a household member, so the orchestrator passes
  // memberHit:true. BOTH deciders must refuse to call it wallet.
  for (const msg of ["who is Sara?", "is Sara my wife?"]) {
    const ri = reg.resolveIntent(msg, { memberHit: true });
    ok(`resolveIntent("${msg}",memberHit) → memory (got ${ri.domain}/${ri.band})`, ri.domain === "memory");

    const a = await arb.arbitrate(msg, { memberHit: true });
    ok(`arbitrate("${msg}",memberHit) NOT wallet (got ${a.domain}/${a.why})`, a.domain !== "wallet");

    const ca = await arb.classifyAll(msg, { memberHit: true, useLLM: false });
    ok(`classifyAll("${msg}",memberHit) NOT wallet (got ${ca.domain})`, ca.domain !== "wallet");
  }

  // ── CONTROL: a REAL personal-money question about the same member stays wallet ──
  {
    const msg = "how much did Sara spend in June";
    const ri = reg.resolveIntent(msg, { memberHit: true });
    ok(`resolveIntent("${msg}",memberHit) → wallet (got ${ri.domain})`, ri.domain === "wallet");
    const a = await arb.arbitrate(msg, { memberHit: true });
    ok(`arbitrate("${msg}",memberHit) → wallet (got ${a.domain})`, a.domain === "wallet");
  }

  // ── (2) BUSINESS COST LINE → FINANCE, never wallet ─────────────────────────────
  for (const msg of ["what's my COGS?", "what's my marketing spend?", "what is my cost of goods sold this month"]) {
    const ri = reg.resolveIntent(msg, {});
    ok(`resolveIntent("${msg}") → finance (got ${ri.domain}/${ri.band})`, ri.domain === "finance");
    // The wallet-gate deferral predicate: a finance-STRONG turn is NOT a strong-wallet
    // turn, so the gate returns null and the P&L spine answers.
    ok(`FINANCE_STRONG matches "${msg}"`, reg.FINANCE_STRONG.test(msg));
  }

  // ── CONTROL: a genuine personal-wallet turn is NOT finance-strong (stays wallet) ─
  for (const msg of ["how much did I spend this month", "did I pay the rent", "breakdown of my spending in June"]) {
    ok(`FINANCE_STRONG does NOT match "${msg}"`, !reg.FINANCE_STRONG.test(msg));
  }

  // ── REGRESSION: the existing finance vocab still reads finance ──────────────────
  for (const msg of ["what's the company profit this month", "how is our margin trending"]) {
    ok(`resolveIntent("${msg}") → finance`, reg.resolveIntent(msg, {}).domain === "finance");
  }

  console.log(`\nBuild-180 routing fix: ${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log("\nFailed:"); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
  else console.log("All Build-180 routing-fix assertions passed.\n");
})().catch((e) => { console.error("threw:", e && e.stack || e); process.exit(1); });
