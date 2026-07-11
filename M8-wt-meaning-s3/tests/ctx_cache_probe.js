"use strict";
/**
 * ctx_cache_probe.js — B-178 (spec §5 Probe B): does provider prompt-caching
 * actually fire, and does lib/llm.js now SEE it via meta.usage?
 *
 * Sends the SAME ~14k-char stable "static head" twice through the REAL
 * lib/llm.js generate() (so the exact prod payload-build path is exercised),
 * with two DIFFERENT one-line user turns, a few seconds apart (< the ~2h Groq /
 * minutes-scale Gemini cache TTL). Reads meta.usage on each run.
 *
 *   Expected: run-2 cached_tokens > 0 on Groq (automatic prompt caching).
 *             run-2 cachedContentTokenCount > 0 on Gemini IFF GEMINI_MODEL is
 *             2.5-family-or-newer AND systemInstruction participates in the
 *             implicit-cache prefix.  Both are OBSERVED, never assumed.
 *
 * NETWORK + KEYS required — NOT named *.test.ps1 so it never enters the offline
 * battery. Set keys locally, never commit/echo them:
 *   $env:GROQ_API_KEY / $env:GEMINI_API_KEY   (current shell)   OR
 *   put them in  M8/.env.local  (gitignored). The script prints only set/missing.
 *
 * Run:  node tests/ctx_cache_probe.js         (from M8/, needs node_modules)
 *   or:  powershell -File tests/ctx_cache_probe.ps1   (PATH->Kimi node fallback)
 *
 * Gate semantics (spec §5): INFORMATIVE, not blocking — the D2 layout ships
 * either way. This only records what was measured; no cache claim is ever made
 * beyond this table + the post-deploy prod ctx:cache rows.
 */
const fs = require("fs");
const path = require("path");

// ── key loading (env first, then gitignored .env.local) — value never printed ──
function loadKey(name) {
  if (process.env[name]) return true;
  try {
    const txt = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = new RegExp("^\\s*" + name + "\\s*=\\s*(.+?)\\s*$").exec(line);
      if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (v) { process.env[name] = v; return true; }
      }
    }
  } catch (_) { /* no .env.local */ }
  return !!process.env[name];
}

// A STABLE ~14k-char head (the same bytes on both runs — the cacheable prefix).
// Content is inert filler + a stable instruction; the point is prefix identity,
// not the wording. Kept > Gemini's 4,096-token (3.x) / 2,048-token (2.5) floor.
function buildStableHead() {
  const para =
    "You are a careful assistant. This is a fixed, unchanging system preamble used " +
    "to measure prompt-cache behaviour. It contains no user data and no numbers. " +
    "Answer the user's one-line question in a single word, nothing else. ";
  let head = "CACHE PROBE — STABLE HEAD (do not vary between runs).\n\n";
  let i = 0;
  while (head.length < 14000) { head += "[" + (i++) + "] " + para + "\n"; }
  return head;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function freshGenerate() {
  delete require.cache[require.resolve("../lib/llm.js")];
  return require("../lib/llm.js").generate;
}

async function runProvider(provider, head) {
  const out = { provider, runs: [], note: "" };
  for (let r = 1; r <= 2; r++) {
    const generate = freshGenerate();
    const meta = {};
    const t0 = Date.now();
    try {
      const text = await generate({
        systemInstruction: head,
        contents: [{ role: "user", parts: [{ text: r === 1 ? "Reply with the single word: one." : "Reply with the single word: two." }] }],
        providerOrder: provider,
        genConfig: { temperature: 0, maxOutputTokens: 16 },
        meta,
      });
      out.runs.push({
        run: r, ms: Date.now() - t0, ok: !!text,
        provider: meta.provider || null,
        prompt: meta.usage ? meta.usage.promptTokens : null,
        cached: meta.usage ? meta.usage.cachedTokens : null,
        sample: String(text || "").replace(/\s+/g, " ").slice(0, 40),
      });
    } catch (e) {
      out.runs.push({ run: r, ms: Date.now() - t0, ok: false, error: String(e && e.message || e).replace(/\s+/g, " ").slice(0, 120) });
    }
    if (r === 1) await sleep(4000); // 2nd request within TTL, a few seconds later
  }
  const r2 = out.runs.find((x) => x.run === 2);
  out.cacheObserved = !!(r2 && typeof r2.cached === "number" && r2.cached > 0);
  return out;
}

(async () => {
  const stamp = new Date().toISOString();
  console.log("── B-178 context-cache live probe ──");
  console.log("date: " + stamp);
  const providers = [
    { id: "groq",   keys: ["GROQ_API_KEY"] },
    { id: "gemini", keys: ["GEMINI_API_KEY"] },
  ];
  const head = buildStableHead();
  console.log("stable head chars: " + head.length);

  const results = [];
  for (const p of providers) {
    const haveKey = p.keys.every((k) => loadKey(k));
    console.log(`${p.id} key: ${haveKey ? "set" : "missing"}`);
    if (!haveKey) { results.push({ provider: p.id, skipped: "no key", runs: [], cacheObserved: false }); continue; }
    results.push(await runProvider(p.id, head));
  }

  // verdict table
  const rows = results.map((res) => {
    if (res.skipped) return `| ${res.provider} | skipped (${res.skipped}) | — | — |`;
    const r1 = res.runs.find((x) => x.run === 1) || {};
    const r2 = res.runs.find((x) => x.run === 2) || {};
    const cell = (r) => r.error ? ("ERR " + r.error.slice(0, 40)) : `prompt=${r.prompt} cached=${r.cached} (${r.ms}ms)`;
    return `| ${res.provider} | ${cell(r1)} | ${cell(r2)} | ${res.cacheObserved ? "CACHE OBSERVED" : "no cache seen"} |`;
  });
  const table = ["| provider | run 1 | run 2 | verdict |", "|---|---|---|---|", ...rows].join("\n");
  console.log("\n" + table);

  const md = [
    "# B-178 context-cache — live probe (spec §5 Probe B)", "",
    `Date: ${stamp}`, "",
    "Same ~14k-char stable head sent twice through the REAL `lib/llm.js generate()`,",
    "two different one-line user turns, ~4s apart. `meta.usage` read per run.",
    "Gate semantics: INFORMATIVE, not blocking (the D2 layout ships regardless).", "",
    `Stable head: **${head.length} chars**.`, "", table, "",
    "> No cache claim is made beyond this table + the post-deploy prod `ctx:cache`",
    "> rows. `cached>0` on run 2 is the only evidence of a real cache hit.", "",
  ].join("\n");
  const dir = path.join(__dirname, "..", "reports");
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  fs.writeFileSync(path.join(dir, "build-178-cache-probe.json"), JSON.stringify({ date: stamp, headChars: head.length, results }, null, 2));
  // NOTE: the .md is authored separately (records the "not run locally" state when
  // keys are absent); only overwrite it when we actually measured something.
  if (results.some((r) => !r.skipped)) fs.writeFileSync(path.join(dir, "build-178-cache-probe.md"), md);
  console.log("\nsaved: reports/build-178-cache-probe.json" + (results.some((r) => !r.skipped) ? " + .md" : " (md left as-authored — nothing measured)"));
  process.exit(0);
})().catch((e) => { console.error("probe crashed:", e); process.exit(1); });
