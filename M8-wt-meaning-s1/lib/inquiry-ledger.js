/**
 * M8 Inquiry Ledger — lib/inquiry-ledger.js  (Build-R6, Research Lane)
 *
 * Gives each STANDING research question a durable, CITED thread so digging
 * COMPOUNDS across months instead of restarting each session. R6 builds NO new
 * datastore: an "inquiry" is a standing question whose evidence / checks / dead
 * ends already live in the research notebook (lib/notebook.js) + curated
 * literature (lib/seed-pack.js). This module ASSEMBLES and SURFACES that thread
 * — it never mints a fact.
 *
 * SAME HONESTY SPINE as the rest of the research lane (the moat): code owns the
 * assembly, the LLM only NARRATES a deterministic packet. Evidence carries its
 * receipts exactly like R1 (established vs speculative, 〔…〕 refs); a check is
 * OBSERVED-through-N / FALSIFIED / verified — never "proven" unless machine-
 * checked. NEVER fabricate a citation or a check that wasn't run.
 *
 * TWO SURFACES, one assembler:
 *   1. Chat — rides the EXISTING notebook read lane (buildNotebookContext calls
 *      buildInquiryThread on an "what's open on X" ask; kill-switch gated).
 *   2. GET /api/knowledge?fn=inquiries — read-only list + &q/&thread assembled thread.
 *
 * Kill-switch M8_INQUIRY_LEDGER (default ON). OFF ⇒ the notebook inquiry-read
 * branch is skipped (behaviour byte-identical to pre-R6) and the handler reports
 * disabled. The pure assembler stays callable in tests regardless of the flag.
 *
 * Fails SAFE everywhere — any Supabase / lookup error degrades to a smaller
 * (never a fabricated) packet; nothing here throws into the notebook or handler.
 */
"use strict";

const { ALL_SEEDS } = require("./seed-pack");

// Bracket glyphs — U+3014 / U+3015, the SAME pair R1 cited recall uses. Built
// from code points so the PS-5.1 ASCII mirror can reproduce them byte-for-byte.
const CITE_L = "〔";
const CITE_R = "〕";

// ─────────────────────────────────────────────────────────────────
// KILL-SWITCH (read at CALL time, mirroring M8_CITED_RECALL / M8_HEALTH_RAIL)
// ─────────────────────────────────────────────────────────────────
function inquiryLedgerEnabled() {
  const v = String(process.env.M8_INQUIRY_LEDGER || "").trim().toLowerCase();
  return v !== "0" && v !== "off";
}

// ─────────────────────────────────────────────────────────────────
// READ DETECTION — the "what's open on X" family (fixture-anchored, minimal).
// This is RETRIEVAL vocabulary (like searchKnowledgeGraph's keyword fallback),
// NOT an action keyword-lane: it only decides that a research READ should be
// assembled as an inquiry thread. Existing notebook reads ("where are we on X")
// are untouched — they keep their own packet.
// ─────────────────────────────────────────────────────────────────
const INQUIRY_READ_RE = new RegExp(
  [
    "\\bwhat(?:'?s|\\s+is)?\\s+(?:still\\s+)?open\\b",  // "what's open on …", "what is still open"
    "\\bwhat(?:'?s|\\s+is)?\\s+the\\s+inquir\\w*\\b",   // "what's/what is the inquiry on …"
    "\\bopen\\s+(?:question|inquir|thread|line)\\w*\\b",// "open question(s)/inquiry/threads on …"
    "\\bstanding\\s+question\\w*\\b",                    // "standing question(s)"
    "\\bwhere\\s+do\\s+we\\s+stand\\b",                 // "where do we stand on …"
    "\\binquiry\\s+(?:ledger|thread|on)\\b",            // "the inquiry ledger", "inquiry on …"
  ].join("|"),
  "i"
);
function looksInquiryRead(message) {
  return INQUIRY_READ_RE.test(String(message || ""));
}

// ─────────────────────────────────────────────────────────────────
// SEED (curated literature) TOPICAL MATCH — pure, sync, DB-free.
// Data-driven: a seed matches when one of ITS OWN keywords (topic-normalized)
// occurs in the question; then we expand once along DISCRIMINATING shared
// features (vortex_369 / doubling_orbit / pisano_period / multiplicative_order)
// so the 3-6-9 thread pulls its kernel + leap + unsourced seeds together —
// never along the broad features (mod9 / digital_root) that would drag in the
// whole pack. Honest: only seeds genuinely on-topic; nothing invented.
// ─────────────────────────────────────────────────────────────────
const BROAD_FEATURES = new Set(["mod9", "digital_root"]);
const SEED_CAP = 8;

// Strip to alphanumerics so "3-6-9", "369", "3 6 9" and "mod 9"/"mod9" all
// collapse to one comparable token.
function topicNorm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function seedMatchesQuestion(seed, qNorm) {
  for (const k of seed.keywords || []) {
    const kn = topicNorm(k);
    if (kn.length >= 3 && qNorm.includes(kn)) return true;
  }
  // the title's discriminating words too (topic-normalized phrase hits)
  return false;
}

/**
 * Curated seeds relevant to a standing question. Pure — returns an ARRAY of the
 * raw seed objects, capped, established/kernel first. Empty when nothing is
 * genuinely on-topic (never a stretch match).
 */
function seedsForQuestion(question) {
  const qNorm = topicNorm(question);
  if (qNorm.length < 3) return [];

  const direct = [];
  for (const s of ALL_SEEDS) if (seedMatchesQuestion(s, qNorm)) direct.push(s);
  if (!direct.length) return [];

  // one-hop expansion along discriminating features of the direct hits
  const expandFeatures = new Set();
  for (const s of direct) {
    for (const f of s.related_features || []) if (!BROAD_FEATURES.has(f)) expandFeatures.add(f);
  }
  const chosen = new Map();
  const add = (s) => { if (s && !chosen.has(s.id)) chosen.set(s.id, s); };
  for (const s of direct) add(s);
  if (expandFeatures.size) {
    for (const s of ALL_SEEDS) {
      if (chosen.has(s.id)) continue;
      if ((s.related_features || []).some((f) => expandFeatures.has(f))) add(s);
    }
  }

  // rank: kernels (established) first, then leap/unsourced, then by id for stability
  const rank = (s) => (s.kernel_leap === "kernel" ? 0 : s.kernel_leap === "leap" ? 2 : s.kernel_leap === "unsourced" ? 2 : 1);
  return [...chosen.values()].sort((a, b) => rank(a) - rank(b) || String(a.id).localeCompare(String(b.id))).slice(0, SEED_CAP);
}

// Trim a long citation string at a word boundary — faithful, never fabricated,
// just bounded so the packet stays readable.
function trimCite(s, max = 200) {
  const str = String(s || "").trim();
  if (str.length <= max) return str;
  const cut = str.lastIndexOf(" ", max);
  return str.slice(0, cut > 40 ? cut : max).replace(/[\s,.;:]+$/, "") + "…";
}

/**
 * One seed → a normalized evidence item. Pure.
 * class:    established (kernel / proved) | speculative (leap / unsourced)
 * citation: the seed's source_citation, or "no primary source on file" for an
 *           unsourced seed (never an invented ref).
 */
function normalizeSeedItem(seed) {
  const kl = seed.kernel_leap;
  const cls = kl === "kernel" ? "established"
            : (kl === "leap" || kl === "unsourced") ? "speculative"
            : (seed.proof_strength === "proved" ? "established" : "speculative");
  const unsourced = kl === "unsourced";
  const citation = unsourced ? "no primary source on file" : trimCite(seed.source_citation);
  return {
    class: cls,
    unsourced,
    kernel_leap: kl || null,
    text: String(seed.title || seed.canonical_statement || "").trim(),
    citation,
    source: "literature",
    seed_id: seed.id,
  };
}

// ─────────────────────────────────────────────────────────────────
// NOTEBOOK NOTE CLASSIFICATION — pure. Buckets a ledger row into the inquiry
// structure. A check is a note that RECORDS A DETERMINISTIC VERDICT (an R3
// base-b period, a kernel/CM1 result, a counterexample) — surfaced honestly as
// OBSERVED / FALSIFIED / verified, never upgraded.
// ─────────────────────────────────────────────────────────────────
const VERDICT_RULES = [
  { verdict: "falsified", re: /\bfalsified\b|\bcounter\s*-?\s*example\b|\bbreaks?\s+(?:down\s+)?at\b|\bfails?\s+at\s+n\b|\bdisprove/i },
  { verdict: "verified",  re: /\blean[_\s-]?verified\b|\bmachine-?checked\b|\bproven\s+in\s+lean\b/i },
  { verdict: "observed",  re: /\bobserved\b|\btested\s+(?:to|through)\b|\bholds?\s+(?:to|through)\b|\bperiod\s+\d+\b|\bthrough\s+n\s*=/i },
];
function noteVerdict(content) {
  const c = String(content || "");
  for (const r of VERDICT_RULES) if (r.re.test(c)) return r.verdict;
  return null;
}
function classifyNote(n) {
  const kind = (n && n.kind) || "";
  const content = (n && n.content) || "";
  if (kind === "status")         return { bucket: "status" };
  if (kind === "next_step")      return { bucket: "next_check" };
  if (kind === "dead_end")       return { bucket: "dead_end" };
  if (kind === "counterexample") return { bucket: "check", verdict: "falsified" };
  if (kind === "conjecture")     return { bucket: "question" };
  if (kind === "evidence" || kind === "note") {
    const v = noteVerdict(content);
    return v ? { bucket: "check", verdict: v } : { bucket: "evidence" };
  }
  return { bucket: "skip" };
}

// ─────────────────────────────────────────────────────────────────
// THE PURE ASSEMBLER — the structured inquiry thread + the rendered packet.
// Inputs are already-fetched (notes) or already-cited (seedItems, graphLines);
// no IO here, so tests exercise it directly and the PS-5.1 mirror reproduces it.
// ─────────────────────────────────────────────────────────────────
const GROUND = "GROUND TRUTH from Muhammad's research notebook + curated literature. Narrate this as ONE cumulative research thread — do NOT invent evidence, checks, citations, dead ends or results, and NEVER upgrade a speculative leap, an unsourced claim, or an observed-to-N check into a proof.";

const VERDICT_LABEL = {
  observed:  "OBSERVED (exhaustive check to N — evidence, not proof)",
  falsified: "FALSIFIED (counterexample on record — known false)",
  verified:  "VERIFIED (machine-checked)",
};

function firstSentence(s) {
  const str = String(s || "").trim();
  const m = str.match(/^(.{20,200}?[.!?])\s/);
  return (m ? m[1] : str.slice(0, 200)).trim();
}

/**
 * assembleInquiry(question, parts) → structured thread + packet. Pure.
 * parts = { thread, title, status, notes, seedItems, graphLines }
 *   - notes:      notebook rows [{ kind, content, stance, status, ... }]
 *   - seedItems:  raw seed objects (seedsForQuestion output)
 *   - graphLines: pre-rendered R1 cited lines (string) or null — ingested sources
 */
function assembleInquiry(question, parts = {}) {
  const notes = Array.isArray(parts.notes) ? parts.notes : [];
  const seeds = (Array.isArray(parts.seedItems) ? parts.seedItems : []).map(normalizeSeedItem);
  const thread = parts.thread || null;
  const title = parts.title || (thread ? thread.replace(/-/g, " ") : null);

  // question resolution: explicit → latest conjecture → title → raw
  let latestConjecture = null;
  for (const n of notes) if (n.kind === "conjecture") latestConjecture = n.content;
  const q = (question && String(question).trim())
    || latestConjecture || title || "this line of inquiry";

  // status (latest status singleton, else derived)
  let status = parts.status || null;
  for (const n of notes) if (n.kind === "status") status = n.status || n.content || status;

  const established = [];     // { class:'established', text, citation }
  const speculative = [];     // { class:'speculative', text, citation, unsourced }
  const recorded    = [];     // notebook evidence (no external source) — plain
  const checks      = [];     // { verdict, text }
  const deadEnds    = [];
  const nextChecks  = [];

  // literature first (carries the receipts)
  for (const it of seeds) (it.class === "established" ? established : speculative).push(it);

  // notebook rows
  for (const n of notes) {
    const c = classifyNote(n);
    const text = String(n.content || "").trim();
    if (!text && c.bucket !== "status") continue;
    switch (c.bucket) {
      case "check":     checks.push({ verdict: c.verdict, text }); break;
      case "dead_end":  deadEnds.push(text); break;
      case "next_check":nextChecks.push(text); break;
      case "evidence":  recorded.push(text); break;
      case "question":  /* latest already captured as q */ break;
      default: break;   // status / skip
    }
  }

  const evidence_so_far = [...established, ...speculative,
    ...recorded.map((t) => ({ class: "recorded", text: t, citation: null, source: "notebook" }))];

  const has_leap = speculative.some((s) => s.kernel_leap === "leap" || s.kernel_leap === "unsourced");
  const not_yet_proven = buildNotProven(established, speculative, checks, has_leap);

  const structured = {
    question: q,
    thread,
    title,
    status: status || "open",
    seed_backed: seeds.length > 0,
    notebook_backed: notes.length > 0,
    graph_backed: !!(parts.graphLines && String(parts.graphLines).trim()),
    evidence_so_far,
    checks_run: checks,
    dead_ends: deadEnds,
    next_checks: nextChecks,
    counts: {
      established: established.length,
      speculative: speculative.length,
      recorded: recorded.length,
      checks: checks.length,
      dead_ends: deadEnds.length,
      next_checks: nextChecks.length,
    },
    not_yet_proven,
  };
  structured.packet = renderInquiryPacket(structured, { established, speculative, recorded, graphLines: parts.graphLines });
  return structured;
}

function buildNotProven(established, speculative, checks, has_leap) {
  const parts = [];
  if (established.length) parts.push("the cited arithmetic kernel is established");
  if (checks.some((c) => c.verdict === "observed")) parts.push("the base-b / pattern checks are OBSERVED to N (evidence, not proof)");
  if (has_leap) parts.push("the energy / cosmic-significance leap and any unsourced quote remain SPECULATIVE with no promotion path");
  const lead = parts.length ? parts.join("; ") + "." : "nothing here is settled yet.";
  return lead + " Nothing is 'proven' unless a machine-checked (Lean) verification says so — and none here is.";
}

function renderInquiryPacket(s, groups) {
  const g = groups || {};
  const cite = (c) => (c ? ` ${CITE_L}${c}${CITE_R}` : "");
  const lines = [];
  const scope = s.thread
    ? `thread "${s.title}", status ${s.status}`
    : "no notebook thread open yet — assembling from curated literature";
  lines.push(`INQUIRY LEDGER — standing question: "${s.question}" (${scope}). ${GROUND}`);

  if ((g.established || []).length) {
    lines.push("ESTABLISHED (cited — checkable facts with a source):");
    for (const it of g.established) lines.push(`- ${it.text}${cite(it.citation)}`);
  }
  if ((g.speculative || []).length) {
    lines.push("SPECULATIVE / UNSOURCED (cited as such — NO promotion path to established):");
    for (const it of g.speculative) lines.push(`- ${it.text}${cite(it.citation)}`);
  }
  if ((g.recorded || []).length) {
    lines.push("RECORDED EVIDENCE (logged in the notebook — observations Boss recorded):");
    for (const t of g.recorded) lines.push(`- ${t}`);
  }
  lines.push("CHECKS RUN (deterministic — a verdict, never a proof):");
  if (s.checks_run.length) {
    for (const c of s.checks_run) lines.push(`- ${VERDICT_LABEL[c.verdict] || c.verdict.toUpperCase()}: ${c.text}`);
  } else {
    lines.push("- none recorded yet — offer to run one (e.g. the base-b lens or a kernel test) and log the verdict.");
  }
  if (s.dead_ends.length) {
    lines.push("DEAD ENDS (already tried — do NOT re-propose these as new ideas):");
    for (const t of s.dead_ends) lines.push(`- ${t}`);
  }
  lines.push("NEXT CHECKS / still open:");
  if (s.next_checks.length) {
    for (const t of s.next_checks) lines.push(`- ${t}`);
  } else {
    lines.push("- none recorded — offer to set one.");
  }
  if (g.graphLines && String(g.graphLines).trim()) {
    lines.push("OTHER CITED CLAIMS (from ingested sources — already carry their refs):");
    lines.push(String(g.graphLines).trim());
  }
  lines.push(`WHAT IS NOT YET PROVEN: ${s.not_yet_proven}`);
  lines.push("Narrate this thread honestly for Boss: keep the established/speculative split, report checks as OBSERVED/FALSIFIED (never proven), and END able to say plainly what is NOT proven. Cite ONLY the " + CITE_L + "…" + CITE_R + " refs above, verbatim — a claim with no ref has no source on file. Never fabricate a citation or a check.");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────
// IMPURE FETCH — resolve a thread, gather notebook + literature (+ optional
// ingested-source lines), then call the pure assembler. Fails SAFE.
// ─────────────────────────────────────────────────────────────────
function getClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

/**
 * buildInquiryThread(question, opts) — the assembled thread for a standing
 * question. opts = { db?, sessionId?, thread?, withGraph? }.
 * Resolves the thread from the live notebook registry (matchKnownThread handles
 * hyphenated slugs like "3-6-9" that parseThread can't), fetches its notes,
 * matches curated seeds, optionally pulls R1 cited graph lines, and assembles.
 * Returns the structured thread, or null when there is genuinely nothing to
 * assemble (no thread AND no on-topic literature) so the caller can fall through.
 */
async function buildInquiryThread(question, opts = {}) {
  const notebook = require("./notebook");
  const db = opts.db || getClient();
  let thread = opts.thread || null;
  let title = null;
  let status = null;

  try {
    const registry = await notebook.getActiveThreads();
    if (!thread) {
      const hit = notebook.matchKnownThread(question, registry) || notebook.parseThread(question);
      if (hit) thread = hit;
    }
    if (thread) {
      const entry = (registry || []).find(
        (t) => t.thread === thread || t.thread.includes(thread) || thread.includes(t.thread)
      );
      if (entry) { thread = entry.thread; title = entry.title; status = entry.status; }
    }
  } catch (_) { /* registry unavailable — assemble from literature only */ }

  let notes = [];
  if (thread) {
    try { notes = await notebook.fetchThreadNotes(db, thread); }
    catch (_) { notes = []; }
  }

  const seedItems = seedsForQuestion(question || title || thread || "");

  // Nothing to say → let the caller fall through to normal routing (no hijack).
  if (!thread && !seedItems.length) return null;

  let graphLines = null;
  if (opts.withGraph !== false) {
    try {
      const { searchKnowledgeGraph } = require("./knowledge-intake");
      graphLines = await searchKnowledgeGraph(question || title || thread, 4);
    } catch (_) { graphLines = null; }
  }

  return assembleInquiry(question, { thread, title, status, notes, seedItems, graphLines });
}

/**
 * listInquiries(opts) — the standing questions on record: every active notebook
 * thread, flagged for whether curated literature backs it. Read-only. opts = { db? }.
 */
async function listInquiries(opts = {}) {
  const notebook = require("./notebook");
  let registry = [];
  try { registry = await notebook.getActiveThreads(); }
  catch (_) { registry = []; }
  const inquiries = (registry || []).map((t) => ({
    thread: t.thread,
    title: t.title || (t.thread || "").replace(/-/g, " "),
    status: t.status || "open",
    entries: t.count || 0,
    last: t.last || null,
    seed_backed: seedsForQuestion(t.title || t.thread).length > 0,
  }));
  return { count: inquiries.length, inquiries };
}

module.exports = {
  inquiryLedgerEnabled,
  INQUIRY_READ_RE, looksInquiryRead,
  // pure (exported for the JS test + PS-5.1 mirror)
  topicNorm, seedsForQuestion, normalizeSeedItem, trimCite,
  noteVerdict, classifyNote, assembleInquiry, firstSentence,
  renderInquiryPacket, buildNotProven,
  CITE_L, CITE_R, BROAD_FEATURES, VERDICT_LABEL,
  // impure
  buildInquiryThread, listInquiries,
};
