#!/usr/bin/env node
/**
 * Build-179 Amendment A1 — tools/vault-ingest.js  (LOCAL, one-way vault → M8)
 *
 * Reads Muhammad's Obsidian vault (`Muhammad-OS`) markdown and feeds CHANGED
 * notes through M8's EXISTING knowledge-intake pipeline (ingestDocument →
 * embeddings → the same KG/recall Build-179 ranks). It is deliberately a LOCAL
 * CLI, not an api/ function: Vercel serverless cannot read his PC, and the
 * 12-function cap is full. "Refresh, not live" — run it when the vault changes.
 *
 * ── NON-NEGOTIABLES (spec A1) ─────────────────────────────────────────────────
 *   • ONE-WAY. This tool only READS the vault and WRITES to M8's store. It NEVER
 *     writes back to the vault — the vault stays his single human-owned truth.
 *   • PRIVACY. A committing run sends vault note TEXT to the LLM/embedding
 *     providers (M8's wall masks numbers, not words). So it is DOUBLE-GATED:
 *       (1) env  M8_VAULT_INGEST=on   AND   (2) the explicit  --commit  flag.
 *     Without BOTH it is a READ-ONLY DRY RUN — it lists what WOULD ingest and
 *     writes nothing. Default = dry run.
 *   • FRESHNESS. Ingested vault rows rank through the D3 selector like any other
 *     memory; the freshness half-life flags a stale local copy automatically.
 *
 * Usage:
 *   node tools/vault-ingest.js                 # dry run over $M8_VAULT_DIR
 *   node tools/vault-ingest.js --dir "C:\...\Muhammad-OS"
 *   node tools/vault-ingest.js --commit        # ACTUALLY ingest (needs M8_VAULT_INGEST=on)
 *   node tools/vault-ingest.js --since 2026-07-01   # only notes modified on/after
 *
 * Node = PATH first, then the Kimi bundled runtime (host convention). Keys +
 * SUPABASE_* come from his shell — never committed, never echoed.
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const a = { commit: false, dir: process.env.M8_VAULT_DIR || "", since: null, limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--commit") a.commit = true;
    else if (t === "--dir") a.dir = argv[++i] || "";
    else if (t === "--since") a.since = argv[++i] || null;
    else if (t === "--limit") a.limit = parseInt(argv[++i] || "0", 10) || 0;
  }
  return a;
}

/** Recursively list *.md under dir (skips dot-dirs + attachments). Pure-ish (fs read only). */
function listMarkdown(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (/^(attachments|assets|\.obsidian|\.trash)$/i.test(e.name)) continue;
        walk(full);
      } else if (e.isFile() && /\.md$/i.test(e.name)) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const csig = require("../lib/context-signal");

  if (!args.dir) {
    console.error("[vault-ingest] No vault dir. Pass --dir or set M8_VAULT_DIR.");
    process.exit(2);
  }
  const sinceMs = args.since ? Date.parse(args.since) : 0;
  let files = listMarkdown(args.dir)
    .map((f) => { let st; try { st = fs.statSync(f); } catch { st = null; } return { f, mtime: st ? st.mtimeMs : 0, size: st ? st.size : 0 }; })
    .filter((r) => r.mtime >= sinceMs && r.size > 0)
    .sort((a, b) => b.mtime - a.mtime);
  if (args.limit > 0) files = files.slice(0, args.limit);

  const totalChars = files.reduce((s, r) => s + r.size, 0);
  console.log(`[vault-ingest] dir = ${args.dir}`);
  console.log(`[vault-ingest] ${files.length} markdown note(s)${args.since ? ` modified >= ${args.since}` : ""}, ~${totalChars} bytes total`);
  for (const r of files.slice(0, 25)) {
    console.log(`   • ${path.relative(args.dir, r.f)}  (${r.size}b, ${new Date(r.mtime).toISOString().slice(0, 10)})`);
  }
  if (files.length > 25) console.log(`   … +${files.length - 25} more`);

  const gateOn = csig.vaultIngestEnabled();
  if (!args.commit || !gateOn) {
    console.log("");
    console.log("[vault-ingest] DRY RUN — nothing written.");
    console.log(`               commit flag: ${args.commit ? "yes" : "no"} · M8_VAULT_INGEST: ${gateOn ? "on" : "off"}`);
    console.log("               To ingest for real: set M8_VAULT_INGEST=on AND pass --commit.");
    console.log("               (A committing run sends note TEXT to the LLM providers — a conscious opt-in.)");
    return;
  }

  // ── COMMIT PATH (double-gated) — reuse the EXISTING knowledge-intake pipeline ──
  const { ingestDocument, extractConcepts, populateGraph } = require("../lib/knowledge-intake");
  let ok = 0, fail = 0;
  for (const r of files) {
    let text = "";
    try { text = fs.readFileSync(r.f, "utf8"); } catch { continue; }
    if (!text.trim()) continue;
    const title = "vault:" + path.relative(args.dir, r.f).replace(/\\/g, "/");
    try {
      const res = await ingestDocument({
        title, text,
        source_class: "established",       // his own notes = established, not speculative
        notes: `Obsidian vault one-way ingest (B-179 A1); mtime ${new Date(r.mtime).toISOString()}`,
      });
      // Best-effort concept/graph population (same as the chat ingest path).
      try { const c = await extractConcepts(res.source_id, text); if (c && populateGraph) await populateGraph(res.source_id, c); } catch (_) {}
      ok++;
      console.log(`   ✓ ${title}  (source_id ${res.source_id})`);
    } catch (e) {
      fail++;
      console.log(`   ✗ ${title}  — ${e && e.message}`);
    }
  }
  console.log(`\n[vault-ingest] committed ${ok} note(s), ${fail} failed.`);
}

main().catch((e) => { console.error("[vault-ingest] fatal:", e && e.message); process.exit(1); });
