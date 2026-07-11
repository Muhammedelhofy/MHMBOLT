/**
 * tests/buildR1_cited_recall.test.js — Build-R1 "cited source spine" ship gate.
 *
 * Pure-function coverage (no network, no DB, no LLM) for the JOIN+RENDER that R1 closes:
 *   - formatCitation  : full / partial / empty metadata, chapter-locator parsing, null-safety
 *   - renderKgHit     : ON/OFF exact strings (D6 kill-switch identity), class label, 〔…〕 ref,
 *                       citation-FP=0 (no source ⇒ no ref, never guessed)
 *   - buildCitationRecord + parseBookIngestMessage round-trips (D2: translator/url, incomplete flag)
 *   - buildSourceCardShape (D5): established/speculative/pending counts, ≤5 claims, citation
 *   - citedRecallEnabled (D6): default ON, off/0 identity
 * Plus STATIC WIRE GUARDS (grep the real source): D4 directive present at the ONE compose
 * site, kill-switch gates it, keyword select widened, semantic path intact, source-card
 * routed, api/ still exactly 10 functions, no new migration.
 *
 * Run:  node tests/buildR1_cited_recall.test.js   (Kimi runtime: the PS mirror shells it)
 * PASS = every check passes (exit 0). Any FAIL ⇒ exit 1.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const ki   = require("../lib/knowledge-intake");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}
function eq(name, expected, actual) {
  const ok = expected === actual;
  if (!ok) console.log(`        exp=${JSON.stringify(expected)}\n        got=${JSON.stringify(actual)}`);
  check(name, ok);
}

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const KI_SRC   = read("lib/knowledge-intake.js");
const ORCH_SRC = read("lib/orchestrator.js");
const API_SRC  = read("api/knowledge.js");
const HANDLER  = read("lib/handlers/source-card.js");

// ── [1] formatCitation matrix ────────────────────────────────────────────────
console.log("\n[1] formatCitation");
// Base fixture models an R1 citation record WITHOUT a chapter_title, so the locator tests
// exercise the title-split path; the chapter_title-preferred path has its own case below.
const teslaMeta = {
  book_title: "The Problem of Increasing Human Energy", author: "Nikola Tesla", year: "1900",
  citation: { author: "Nikola Tesla", work: "The Problem of Increasing Human Energy", year: "1900", public_domain: true, citation_incomplete: false },
};
eq("full record + chapter locator",
   "Nikola Tesla, The Problem of Increasing Human Energy (1900), III. The Sun's Energy",
   ki.formatCitation(teslaMeta, "The Problem of Increasing Human Energy — III. The Sun's Energy"));
eq("whole-doc: no locator",
   "Nikola Tesla, The Problem of Increasing Human Energy (1900)",
   ki.formatCitation(teslaMeta, "The Problem of Increasing Human Energy"));
eq("legacy metadata (no .citation): author+book_title+year",
   "Ibn Kathir, Al-Bidaya wa al-Nihaya (1370), Chapter 2",
   ki.formatCitation({ author: "Ibn Kathir", book_title: "Al-Bidaya wa al-Nihaya", year: "1370" },
                     "Al-Bidaya wa al-Nihaya — Chapter 2"));
eq("partial: work + year only (no author)",
   "Vortex-Based Mathematics (2010)",
   ki.formatCitation({ citation: { work: "Vortex-Based Mathematics", year: "2010" } }, "Vortex-Based Mathematics"));
eq("partial: author only",
   "Some Author",
   ki.formatCitation({ citation: { author: "Some Author" } }, ""));
eq("nothing citable ⇒ null", null, ki.formatCitation({}, ""));
eq("null metadata + null title ⇒ null", null, ki.formatCitation(null, null));
eq("title-only source is citable as its work", "My CV", ki.formatCitation({}, "My CV"));
// locator prefers metadata.chapter_title (separator-agnostic) over the title split
eq("locator from chapter_title (preferred)",
   "Nikola Tesla, The Problem of Increasing Human Energy (1900), III. The Sun's Energy",
   ki.formatCitation({ ...teslaMeta, chapter_title: "III. The Sun's Energy" }, "The Problem of Increasing Human Energy — anything"));
// REAL DATA: his ingested Ibn Kathir book — legacy metadata + a " - " (hyphen) title that
// the em-dash split can't parse; chapter_title still yields the locator.
eq("real Ibn Kathir book (hyphen title, legacy metadata) still cites with locator",
   "ابن كثير, البداية والنهاية, بدء الخلق (ص 11-13)",
   ki.formatCitation({ author: "ابن كثير", book_title: "البداية والنهاية", chapter_title: "بدء الخلق (ص 11-13)" },
                     "البداية والنهاية - بدء الخلق (ص 11-13)"));
// locator helpers
eq("splitWork strips chapter", "Book", ki.splitWorkFromTitle("Book — Chapter 3"));
eq("splitWork whole-doc identity", "Book", ki.splitWorkFromTitle("Book"));
eq("splitLocator chapter", "Chapter 3", ki.splitLocatorFromTitle("Book — Chapter 3"));
eq("splitLocator whole-doc empty", "", ki.splitLocatorFromTitle("Book"));

// ── [2] renderKgHit ON/OFF (D6 identity) ─────────────────────────────────────
console.log("\n[2] renderKgHit");
const estNode = { kind: "claim", label: "sun-radiant-energy", content: "the sun is a source of radiant energy", source_class: "established", source_doc_id: 99 };
const srcRow  = { id: 99, title: "The Problem of Increasing Human Energy — III. The Sun's Energy", metadata: teslaMeta };
eq("OFF = pre-R1 exact string",
   "[Claim] sun-radiant-energy: the sun is a source of radiant energy",
   ki.renderKgHit(estNode, srcRow, { citedRecallOn: false }));
eq("OFF with no opts arg = identity too",
   "[Claim] sun-radiant-energy: the sun is a source of radiant energy",
   ki.renderKgHit(estNode, srcRow));
eq("ON = class label + verbatim citation",
   "[Claim·established] sun-radiant-energy: the sun is a source of radiant energy 〔Nikola Tesla, The Problem of Increasing Human Energy (1900), III. The Sun's Energy〕",
   ki.renderKgHit(estNode, srcRow, { citedRecallOn: true }));
const specNode = { kind: "claim", label: "vortex-leap", content: "numbers encode the energy geometry of reality", source_class: "speculative" };
eq("ON speculative + NO source ⇒ label but NO ref (FP=0)",
   "[Claim·speculative] vortex-leap: numbers encode the energy geometry of reality",
   ki.renderKgHit(specNode, null, { citedRecallOn: true }));
const noClass = { kind: "entity", label: "tesla", content: "inventor", source_class: null };
eq("ON node with no source_class ⇒ bare [Entity] (as today)",
   "[Entity] tesla: inventor",
   ki.renderKgHit(noClass, null, { citedRecallOn: true }));
// an M2 seed node (source:'external', no class, no doc) must be byte-identical ON and OFF
const seed = { kind: "claim", label: "collatz-known", content: "known result form", source_class: null };
eq("ON M2-seed (no class/source) == OFF identity",
   ki.renderKgHit(seed, null, { citedRecallOn: false }),
   ki.renderKgHit(seed, null, { citedRecallOn: true }));

// ── [3] buildCitationRecord + parseBookIngestMessage (D2) ────────────────────
console.log("\n[3] intake grammar + citation record");
const full = ki.parseBookIngestMessage(
  "ingest this as a book: title=The Problem of Increasing Human Energy, author=Nikola Tesla, year=1900, source_class=established, url=https://gutenberg.org/x, public_domain=true");
eq("parse title",  "The Problem of Increasing Human Energy", full.title);
eq("parse author", "Nikola Tesla", full.author);
eq("parse year",   "1900", full.year);
eq("parse class",  "established", full.source_class);
eq("parse url",    "https://gutenberg.org/x", full.url);
eq("parse public_domain", true, full.public_domain);
const withTranslator = ki.parseBookIngestMessage(
  "ingest this as a book: title=Doubts About Galen, author=al-Razi, year=900, translator=Jane Doe, source_class=established");
eq("parse translator", "Jane Doe", withTranslator.translator);
eq("title not swallowed by later keys", "Doubts About Galen", withTranslator.title);
const rec = ki.buildCitationRecord({ author: "Nikola Tesla", work: "The Problem of Increasing Human Energy", year: "1900", source_url: "https://x", public_domain: true });
eq("record complete ⇒ citation_incomplete=false", false, rec.citation_incomplete);
eq("record drops empty fields (no edition key)", false, Object.prototype.hasOwnProperty.call(rec, "edition"));
eq("record keeps public_domain=true", true, rec.public_domain);
const partial = ki.buildCitationRecord({ author: "Nikola Tesla", work: "", year: "" });
eq("missing work/year ⇒ citation_incomplete=true", true, partial.citation_incomplete);
// D2 short-paste: structured "…, author=…, year=…, url=…, text=<body>" (url's ':' stays in the url)
const sp = ki.parseIngestMessage("ingest this as established, author=Nikola Tesla, year=1900, url=https://gutenberg.org/x, text=The sun is a source of radiant energy that streams to the earth.");
eq("short-paste cite.author", "Nikola Tesla", sp.cite && sp.cite.author);
eq("short-paste cite.year", "1900", sp.cite && sp.cite.year);
eq("short-paste cite.url keeps its colon", "https://gutenberg.org/x", sp.cite && sp.cite.url);
eq("short-paste body delimited by text=", "The sun is a source of radiant energy that streams to the earth.", sp.raw_text);
const spT = ki.parseIngestMessage("ingest as speculative, author=Rodin, title=Vortex Math, text=Numbers encode reality, he claims.");
eq("short-paste explicit title=", "Vortex Math", spT.title);
// backward-compat: a free-text short-paste (no text=) is UNTOUCHED — cite null, body identical
const free = ki.parseIngestMessage("ingest this as established: The sun is a source of energy and light for the earth.");
eq("free-text cite = null (identity)", null, free.cite);
eq("free-text body unchanged", "The sun is a source of energy and light for the earth.", free.raw_text);
// the prose false-positive guard: a body containing "body:" must NOT trigger structured mode
const prose = ki.parseIngestMessage("ingest this as established: The human body: an overview of its energy systems.");
eq("prose 'body:' does NOT trigger structured (cite null)", null, prose.cite);
eq("prose body kept whole", "The human body: an overview of its energy systems.", prose.raw_text);

// ── [4] buildSourceCardShape (D5) ────────────────────────────────────────────
console.log("\n[4] source card shape");
const nodes = [
  { source_class: "established", kind: "claim",  label: "c1", content: "claim one" },
  { source_class: "established", kind: "claim",  label: "c2", content: "claim two" },
  { source_class: "speculative", kind: "entity", label: "e1", content: "entity one" },
  { source_class: "established", kind: "claim",  label: "c3", content: "claim three" },
  { source_class: "established", kind: "claim",  label: "c4", content: "claim four" },
  { source_class: "established", kind: "claim",  label: "c5", content: "claim five" },
  { source_class: "established", kind: "claim",  label: "c6", content: "claim six (overflow)" },
];
const src = { id: 99, title: "The Problem of Increasing Human Energy — III", source_class: "established", metadata: teslaMeta, word_count: 4200, pending_nodes: [1, 2, 3] };
const card = ki.buildSourceCardShape(src, nodes);
eq("card id", 99, card.id);
eq("card source_class", "established", card.source_class);
eq("card citation resolves", "Nikola Tesla, The Problem of Increasing Human Energy (1900), III", card.citation);
eq("card citation_incomplete=false", false, card.citation_incomplete);
eq("count established", 6, card.node_counts.established);
eq("count speculative", 1, card.node_counts.speculative);
eq("count pending", 3, card.node_counts.pending);
eq("sample_claims capped at 5", 5, card.sample_claims.length);
eq("sample_claims are claims only", true, card.sample_claims.every(c => c.label.startsWith("c")));
const bareCard = ki.buildSourceCardShape({ id: 7, title: "Untitled document", source_class: "speculative", metadata: {}, word_count: 30, pending_nodes: null }, []);
eq("no-citation source ⇒ citation_incomplete=true", true, bareCard.citation_incomplete);
eq("empty nodes ⇒ zero counts", 0, bareCard.node_counts.established + bareCard.node_counts.speculative);

// ── [5] citedRecallEnabled (D6) ──────────────────────────────────────────────
console.log("\n[5] kill-switch");
delete process.env.M8_CITED_RECALL;
eq("default (unset) ⇒ ON", true, ki.citedRecallEnabled());
process.env.M8_CITED_RECALL = "off"; eq("off ⇒ disabled", false, ki.citedRecallEnabled());
process.env.M8_CITED_RECALL = "0";   eq("0 ⇒ disabled",   false, ki.citedRecallEnabled());
process.env.M8_CITED_RECALL = "ON";  eq("any other value ⇒ ON", true, ki.citedRecallEnabled());
delete process.env.M8_CITED_RECALL;

// ── [6] static wire guards (the real source) ─────────────────────────────────
console.log("\n[6] wire guards");
// D4 — directive lives in orchestrator, exactly ONE definition + ONE append (one compose site)
check("D4 directive constant defined once", (ORCH_SRC.match(/CITED_RECALL_DIRECTIVE\s*=/g) || []).length === 1);
check("D4 directive appended (single site)", (ORCH_SRC.match(/systemInstruction \+= `\\n\\n\$\{CITED_RECALL_DIRECTIVE\}`/g) || []).length === 1);
check("D4 directive gated on citedRecallEnabled", ORCH_SRC.includes("citedRecallEnabled()") && ORCH_SRC.includes("if (kgContext)"));
check("D4 directive text carries citation-FP=0 rule", /Cite ONLY from those/.test(ORCH_SRC) && /never compose, complete, or embellish/.test(ORCH_SRC));
check("D4 directive forbids \"proven\"", /Never say \"proven\"/.test(ORCH_SRC));
// D3 — keyword select widened, semantic path intact, both render via renderKgHits
check("keyword select widened (id+source_doc_id+source_class)", KI_SRC.includes('.select("id, label, content, kind, confidence, source_doc_id, source_class")'));
check("semantic path renders via renderKgHits", /renderKgHits\(semData, db\)/.test(KI_SRC));
check("keyword path renders via renderKgHits", /renderKgHits\(hits, db\)/.test(KI_SRC));
check("semantic RPC (match_kg_nodes) still called", KI_SRC.includes("match_kg_nodes"));
check("renderKgHits fail-soft (try/catch around fetches)", /renderKgHits/.test(KI_SRC) && /fail-soft/.test(KI_SRC));
// D6 — rendering gated on the SAME kill-switch
check("renderKgHits gated on citedRecallEnabled", /if \(!citedRecallEnabled\(\)\)/.test(KI_SRC));
// D1 — citation into metadata, NO migration
check("ingest writes metadata.citation", /chapter_title: ch\.title, total_chapters: totalChapters, citation/.test(KI_SRC));
check("no new migration file referenced", !/migrations\/.*R1/i.test(KI_SRC));
// D5 — source-card routed inside the existing 12-fn router
check("source-card case in router", API_SRC.includes('case "source-card":'));
check("source-card handler required", API_SRC.includes('require("../lib/handlers/source-card")'));
check("handler is GET-only + read-only (no populateGraph/insert)", /GET only/.test(HANDLER) && !/populateGraph|\.insert\(/.test(HANDLER));
// api/ still exactly 10 serverless functions (cap FULL, untouched)
const apiFiles = fs.readdirSync(path.join(ROOT, "api")).filter(f => f.endsWith(".js"));
eq("api/ still exactly 10 functions", 10, apiFiles.length);
// no migrations added by R1
const migrations = fs.readdirSync(path.join(ROOT, "migrations")).filter(f => /r1|cited/i.test(f));
eq("zero R1 migration files", 0, migrations.length);

// ── result ───────────────────────────────────────────────────────────────────
console.log(`\n================ BUILD-R1 CITED RECALL ================`);
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
if (fail > 0) { console.log("  RESULT: FAIL"); process.exit(1); }
console.log("  RESULT: ALL GREEN"); process.exit(0);
