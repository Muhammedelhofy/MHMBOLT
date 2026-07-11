/**
 * consolidate-fns-ab-verify.js — Hobby 12-fn consolidation pass 2 (merges A+B).
 *
 * A: api/chat-stream.js  -> folded into api/chat.js router  (?fn=stream)
 * B: api/tasks.js + api/transcribe.js -> api/util.js router (?fn=tasks|transcribe)
 *
 * Verifies (no network, no Supabase, no LLM): router dispatch is correct (handlers
 * are MOCKED via require.cache so the heavy orchestrator/supabase deps never load),
 * the relocated handler files exist with corrected require paths, the deleted
 * standalones are gone, and vercel.json wires every route + preserves all 5 crons.
 *
 * Run:  node tests/consolidate-fns-ab-verify.js
 */
"use strict";
const path = require("path");
const fs   = require("fs");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log("  PASS " + m); };
const bad = (m) => { fail++; console.log("  FAIL " + m); };
function eq(a, b, m) { (a === b) ? ok(m + "  (= " + JSON.stringify(a) + ")") : bad(m + "  (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function truthy(v, m) { v ? ok(m) : bad(m); }

// ── Mock a handler module in require.cache so requiring the router returns our
//    stub instead of loading the real (heavy) handler. Returns a probe.
function mockHandler(relFromRoot) {
  const abs = require.resolve(path.join(ROOT, relFromRoot));
  const probe = { called: 0, lastReq: null };
  const stub = async (req, res) => { probe.called++; probe.lastReq = req; return res.__stub(relFromRoot); };
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: stub };
  return probe;
}
function freshRouter(relFromRoot) {
  const abs = require.resolve(path.join(ROOT, relFromRoot));
  delete require.cache[abs];
  return require(abs);
}
// Minimal res double: records status + which stub answered.
function mkRes() {
  const r = { statusCode: null, jsonBody: null, answeredBy: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json   = (b) => { r.jsonBody = b; return r; };
  r.__stub = (who) => { r.answeredBy = who; return r; };
  return r;
}

console.log("== A: api/chat.js router ==");
{
  const buffered = mockHandler("lib/handlers/chat-buffered.js");
  const stream   = mockHandler("lib/handlers/chat-stream.js");
  const router   = freshRouter("api/chat.js");
  eq(typeof router, "function", "chat router exports a function");
  truthy(router.config && router.config.maxDuration === 180, "chat router config.maxDuration = 180");

  let res = mkRes(); router({ query: { fn: "stream" } }, res);
  eq(res.answeredBy, "lib/handlers/chat-stream.js", "?fn=stream -> chat-stream handler");
  res = mkRes(); router({ query: {} }, res);
  eq(res.answeredBy, "lib/handlers/chat-buffered.js", "no fn -> buffered handler (default)");
  res = mkRes(); router({ query: { fn: "buffered" } }, res);
  eq(res.answeredBy, "lib/handlers/chat-buffered.js", "?fn=buffered -> buffered handler");
  res = mkRes(); router({ query: { fn: "bogus" } }, res);
  eq(res.statusCode, 404, "unknown fn -> 404");
  eq(buffered.called + stream.called, 3, "exactly 3 dispatches reached a real handler slot");
}

console.log("== B: api/util.js router ==");
{
  const tasks      = mockHandler("lib/handlers/tasks.js");
  const transcribe = mockHandler("lib/handlers/transcribe.js");
  const router     = freshRouter("api/util.js");
  eq(typeof router, "function", "util router exports a function");
  truthy(router.config && router.config.maxDuration === 30, "util router config.maxDuration = 30");
  truthy(router.config && router.config.api && router.config.api.bodyParser &&
         router.config.api.bodyParser.sizeLimit === "12mb", "util router bodyParser = 12mb (transcribe)");

  let res = mkRes(); router({ query: { fn: "tasks" } }, res);
  eq(res.answeredBy, "lib/handlers/tasks.js", "?fn=tasks -> tasks handler");
  res = mkRes(); router({ query: { fn: "transcribe" } }, res);
  eq(res.answeredBy, "lib/handlers/transcribe.js", "?fn=transcribe -> transcribe handler");
  res = mkRes(); router({ query: {} }, res);
  eq(res.statusCode, 404, "no fn -> 404");
  void tasks; void transcribe;
}

console.log("== relocated handler files ==");
for (const f of ["lib/handlers/chat-buffered.js", "lib/handlers/chat-stream.js",
                 "lib/handlers/tasks.js", "lib/handlers/transcribe.js"]) {
  const p = path.join(ROOT, f);
  truthy(fs.existsSync(p), f + " exists");
  const src = fs.readFileSync(p, "utf8");
  truthy(!/require\(["']\.\.\/lib\//.test(src), f + " has no stale ../lib/ require (uses ../)");
}

console.log("== deleted standalones ==");
for (const f of ["api/chat-stream.js", "api/tasks.js", "api/transcribe.js"]) {
  truthy(!fs.existsSync(path.join(ROOT, f)), f + " is deleted");
}

console.log("== api function count ==");
{
  const apiFiles = fs.readdirSync(path.join(ROOT, "api")).filter((f) => f.endsWith(".js"));
  eq(apiFiles.length, 10, "api/*.js count = 10 (was 12; 2 slots freed)");
  truthy(apiFiles.includes("chat.js") && apiFiles.includes("util.js"), "chat.js + util.js present");
}

console.log("== vercel.json ==");
{
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const rw = vj.rewrites.map((r) => r.source + " => " + r.destination);
  truthy(rw.includes("/api/chat-stream => /api/chat?fn=stream"), "rewrite chat-stream -> chat?fn=stream");
  truthy(rw.includes("/api/tasks => /api/util?fn=tasks"), "rewrite tasks -> util?fn=tasks");
  truthy(rw.includes("/api/transcribe => /api/util?fn=transcribe"), "rewrite transcribe -> util?fn=transcribe");
  // catch-all must be LAST so the specific rewrites win.
  eq(vj.rewrites[vj.rewrites.length - 1].source, "/api/(.*)", "catch-all rewrite is last");
  // functions block must not reference deleted chat-stream, and every entry must exist.
  truthy(!("api/chat-stream.js" in vj.functions), "functions block no longer lists chat-stream.js");
  for (const key of Object.keys(vj.functions)) {
    truthy(fs.existsSync(path.join(ROOT, key)), "functions[" + key + "] file exists");
  }
  // crons: all 5 preserved, paths + schedules unchanged (the hands-off zone).
  eq(vj.crons.length, 5, "crons length = 5 (unchanged)");
  const cronPaths = vj.crons.map((c) => c.path).sort();
  const wantCron = ["/api/cron-explore", "/api/cron-summarize", "/api/cron-verify",
                    "/api/morning-brief", "/api/push-cron"].sort();
  eq(JSON.stringify(cronPaths), JSON.stringify(wantCron), "cron paths unchanged");
}

console.log("\n== RESULT: " + pass + " passed / " + fail + " failed ==");
process.exit(fail === 0 ? 0 : 1);
