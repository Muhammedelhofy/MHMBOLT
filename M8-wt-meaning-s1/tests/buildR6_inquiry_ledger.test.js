/**
 * tests/buildR6_inquiry_ledger.test.js — Build-R6 "Inquiry ledger" ship gate.
 *
 * Pure-function coverage (no network, no DB, no LLM) for the ASSEMBLY R6 closes:
 *   - inquiryLedgerEnabled : default ON, off/0 identity
 *   - looksInquiryRead     : fires on the "what's open on X" family; NEVER on fleet/wallet/casual
 *   - seedsForQuestion     : 3-6-9 pulls its kernel + leap + unsourced seeds; off-topic ⇒ []
 *   - normalizeSeedItem    : kernel→established+cite, leap→speculative, unsourced→"no primary source on file"
 *   - classifyNote/verdict : observed / falsified / verified / soft-evidence buckets
 *   - assembleInquiry      : flagship structure — established leads, speculative labelled, checks_run,
 *                            dead_ends, next_checks, honest not_yet_proven; 〔…〕 refs; NO fabrication
 *   - additive write vocab : "open question" → conjecture; every pre-R6 phrasing byte-identical
 * Plus STATIC WIRE GUARDS (grep the real source): notebook branch gated + ephemeral-skip + lazy
 * require; ?fn=inquiries routed; handler GET-only + read-only; kill-switch present; rides the
 * EXISTING seed-pack (no new datastore); api/ still exactly 10 functions; no new migration.
 *
 * Run:  node tests/buildR6_inquiry_ledger.test.js   (Kimi runtime: the PS mirror shells it)
 * PASS = every check passes (exit 0). Any FAIL ⇒ exit 1.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const inq  = require("../lib/inquiry-ledger");
const nb   = require("../lib/notebook");

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
const LEDGER_SRC = read("lib/inquiry-ledger.js");
const NB_SRC     = read("lib/notebook.js");
const API_SRC    = read("api/knowledge.js");
const HANDLER    = read("lib/handlers/inquiries.js");

// ── [1] kill-switch (default ON, off/0 identity) ─────────────────────────────
console.log("\n[1] kill-switch M8_INQUIRY_LEDGER");
delete process.env.M8_INQUIRY_LEDGER;
check("default ON", inq.inquiryLedgerEnabled() === true);
process.env.M8_INQUIRY_LEDGER = "off"; check("off ⇒ disabled", inq.inquiryLedgerEnabled() === false);
process.env.M8_INQUIRY_LEDGER = "0";   check("0 ⇒ disabled",   inq.inquiryLedgerEnabled() === false);
process.env.M8_INQUIRY_LEDGER = "on";  check("on ⇒ enabled",   inq.inquiryLedgerEnabled() === true);
delete process.env.M8_INQUIRY_LEDGER;

// ── [2] looksInquiryRead — fires on the family, never on other domains ───────
console.log("\n[2] looksInquiryRead");
for (const m of [
  "what's open on the 3-6-9 question?",
  "what is still open on collatz?",
  "any open questions on digital roots?",
  "where do we stand on the vortex idea?",
  "what's the inquiry on 3-6-9?",
  "show me the inquiry ledger",
]) check("fires: " + m, inq.looksInquiryRead(m) === true);
for (const m of [
  "how are my drivers doing today",
  "send my wallet balance",
  "what time is it",
  "open the door",
  "log a conjecture on collatz: every orbit terminates",
]) check("silent: " + m, inq.looksInquiryRead(m) === false);

// ── [3] seedsForQuestion — the 3-6-9 literature, honest scope ─────────────────
console.log("\n[3] seedsForQuestion");
const s369 = inq.seedsForQuestion("what's open on the 3-6-9 question?");
const ids369 = s369.map((s) => s.id);
check("3-6-9 matches curated seeds", s369.length >= 5 && s369.length <= 8);
check("includes the doubling-orbit kernel (period 6)", ids369.includes("doubling-orbit-124875"));
check("includes the 3-6-9 non-units kernel", ids369.includes("three-six-nine-are-the-non-units"));
check("includes the Tesla-quote UNSOURCED seed", ids369.includes("tesla-369-quote-unsourced"));
check("includes the Rodin energy LEAP seed", ids369.includes("rodin-vortex-energy-leap"));
check("kernels rank before leap/unsourced", s369[0].kernel_leap === "kernel");
check("off-topic question ⇒ no stretch match", inq.seedsForQuestion("what's open on the office lease renewal?").length === 0);
check("does NOT drag the whole pack via mod9/digital_root", s369.length < 14);

// ── [4] normalizeSeedItem — class + citation, no fabrication ──────────────────
console.log("\n[4] normalizeSeedItem");
const byId = (id) => inq.seedsForQuestion("3-6-9 vortex tesla").find((s) => s.id === id);
const kernel = inq.normalizeSeedItem(byId("doubling-orbit-124875"));
eq("kernel ⇒ established", "established", kernel.class);
check("kernel carries a citation", !!kernel.citation && kernel.citation !== "no primary source on file");
const leap = inq.normalizeSeedItem(byId("rodin-vortex-energy-leap"));
eq("leap ⇒ speculative", "speculative", leap.class);
const unsourced = inq.normalizeSeedItem(byId("tesla-369-quote-unsourced"));
eq("unsourced ⇒ speculative", "speculative", unsourced.class);
eq("unsourced citation is honest 'no primary source on file'", "no primary source on file", unsourced.citation);
check("unsourced flag set", unsourced.unsourced === true);

// ── [5] classifyNote / noteVerdict ───────────────────────────────────────────
console.log("\n[5] classifyNote");
eq("OBSERVED evidence ⇒ check/observed", "observed",
   inq.classifyNote({ kind: "evidence", content: "OBSERVED through n=10000, period 6 in base 10" }).verdict);
eq("counterexample ⇒ check/falsified", "falsified",
   inq.classifyNote({ kind: "counterexample", content: "fails at n=27" }).verdict);
eq("lean-verified ⇒ check/verified", "verified",
   inq.classifyNote({ kind: "evidence", content: "lean_verified: n ≡ digitSum(n) mod 9" }).verdict);
eq("soft evidence ⇒ evidence bucket", "evidence",
   inq.classifyNote({ kind: "evidence", content: "3,6,9 are the non-units mod 9" }).bucket);
eq("dead_end ⇒ dead_end bucket", "dead_end", inq.classifyNote({ kind: "dead_end", content: "x" }).bucket);
eq("next_step ⇒ next_check bucket", "next_check", inq.classifyNote({ kind: "next_step", content: "x" }).bucket);
eq("conjecture ⇒ question bucket", "question", inq.classifyNote({ kind: "conjecture", content: "x" }).bucket);

// ── [6] assembleInquiry — the flagship thread ────────────────────────────────
console.log("\n[6] assembleInquiry (flagship 3-6-9)");
const notes = [
  { kind: "conjecture", content: "Is 9 fundamental, or a base-10 artifact of mod-9 arithmetic?" },
  { kind: "evidence",   content: "Base-b lens OBSERVED: doubling digital-root period 6 in base 10, period 10 in base 12, period 4 in base 16." },
  { kind: "evidence",   content: "3, 6, 9 are the non-units mod 9 (recorded)." },
  { kind: "dead_end",   content: "Reading energy claims as literal physics — no mathematical content beyond the pattern." },
  { kind: "next_step",  content: "Run the base-16 non-unit orbit and log the verdict." },
  { kind: "status",     status: "open" },
];
const t = inq.assembleInquiry("what's open on the 3-6-9 question?", {
  thread: "3-6-9", title: "3-6-9", notes, seedItems: s369, graphLines: null,
});
check("established evidence present + cited", t.counts.established >= 4);
check("speculative evidence present (leap + unsourced)", t.counts.speculative >= 2);
check("base-b result classified as a CHECK (OBSERVED)", t.checks_run.some((c) => c.verdict === "observed"));
check("dead end captured", t.dead_ends.length === 1);
check("next check captured", t.next_checks.length === 1);
check("not_yet_proven names the speculative leap", /SPECULATIVE|speculative/.test(t.not_yet_proven));
check("not_yet_proven refuses 'proven' without Lean", /Lean/.test(t.not_yet_proven));
check("packet carries at least one 〔…〕 cited ref", t.packet.includes(inq.CITE_L) && t.packet.includes(inq.CITE_R));
check("packet labels the established/speculative split", /ESTABLISHED \(cited/.test(t.packet) && /SPECULATIVE \/ UNSOURCED/.test(t.packet));
check("packet forbids fabricated citations", /Never fabricate a citation or a check/.test(t.packet));
check("packet contains the honest 'unsourced Tesla' line", t.packet.includes("no primary source on file"));

// no-fabrication: a notebook-only evidence line carries NO invented citation, and the
// recorded line never gets a 〔ref〕 stapled to it (the only 〔…〕 in the packet is the
// closing directive that names the convention).
const soft = inq.assembleInquiry("q", { thread: "x", notes: [{ kind: "evidence", content: "some observation" }], seedItems: [], graphLines: null });
const recItem = soft.evidence_so_far.find((e) => e.text === "some observation");
check("notebook-only evidence has null citation (never invented)", recItem && recItem.citation === null && recItem.class === "recorded");
check("recorded line rendered WITHOUT a stapled 〔ref〕", !soft.packet.includes("some observation " + inq.CITE_L));

// seed-only assembly (no notebook thread yet) still produces a cited thread
const seedOnly = inq.assembleInquiry("3-6-9", { thread: null, notes: [], seedItems: s369, graphLines: null });
check("seed-only thread assembles (literature-backed)", seedOnly.counts.established >= 4 && seedOnly.seed_backed === true);
check("seed-only packet notes no thread open yet", /no notebook thread open yet/.test(seedOnly.packet));

// ── [7] trimCite bound ───────────────────────────────────────────────────────
console.log("\n[7] trimCite");
const longC = "x".repeat(50) + " " + "y".repeat(300);
check("trims to <= ~200 + ellipsis", inq.trimCite(longC).length <= 210 && inq.trimCite(longC).endsWith("…"));
eq("short citation untouched", "OEIS A000079", inq.trimCite("OEIS A000079"));

// ── [8] additive write vocab: open question → conjecture, pre-R6 unchanged ────
console.log("\n[8] notebook write vocab (additive)");
eq("'open question: …' ⇒ conjecture", "conjecture", nb.detectNotebook("open question: is the 24-cycle base-independent?").kind);
eq("'log an open question on X: …' ⇒ conjecture", "conjecture",
   nb.detectNotebook("log an open question on collatz: does it always terminate?").kind);
// pre-R6 regression: existing phrasings byte-identical
eq("existing conjecture unchanged", "conjecture", nb.detectNotebook("log a conjecture on collatz: every orbit terminates").kind);
eq("existing evidence unchanged", "evidence", nb.detectNotebook("evidence for: the bound holds to 10^9").kind);
eq("existing dead-end unchanged", "dead_end", nb.detectNotebook("dead end: tried induction, stuck").kind);
eq("'note: buy milk' still NOT hijacked (null)", null, nb.detectNotebook("note: buy milk").mode);

// ── [9] STATIC WIRE GUARDS ───────────────────────────────────────────────────
console.log("\n[9] static wire guards");
// notebook read branch: gated by the switch + ephemeral-skip + lazy require
check("notebook lazy-requires inquiry-ledger", /require\("\.\/inquiry-ledger"\)/.test(NB_SRC));
check("notebook branch gated on inquiryLedgerEnabled()", /inq\.inquiryLedgerEnabled\(\)/.test(NB_SRC));
check("notebook branch skips ephemeral sessions", /!isEphemeralSession\(sessionId\)/.test(NB_SRC) && /looksInquiryRead/.test(NB_SRC));
check("notebook branch fails safe (try/catch)", /inquiry-ledger read error \(non-fatal\)/.test(NB_SRC));
// rides the EXISTING seed-pack — no new datastore
check("ledger reads the existing seed-pack (ALL_SEEDS)", /require\("\.\/seed-pack"\)/.test(LEDGER_SRC) && /ALL_SEEDS/.test(LEDGER_SRC));
check("ledger reuses the notebook store (no new table)", /require\("\.\/notebook"\)/.test(LEDGER_SRC) && !/create table/i.test(LEDGER_SRC));
check("kill-switch name is M8_INQUIRY_LEDGER", /M8_INQUIRY_LEDGER/.test(LEDGER_SRC));
// ?fn=inquiries routed inside the EXISTING 12-fn router
check("inquiries case in router", API_SRC.includes('case "inquiries":'));
check("inquiries handler required", API_SRC.includes('require("../lib/handlers/inquiries")'));
check("handler GET-only + read-only (no insert/persist/populate)",
      /GET only/.test(HANDLER) && !/\.insert\(|persistNote|populateGraph/.test(HANDLER));
check("handler honours the kill-switch (disabled response)", /disabled: true/.test(HANDLER) && /inquiryLedgerEnabled/.test(HANDLER));
// api/ still exactly 10 serverless functions (cap FULL, untouched)
const apiFiles = fs.readdirSync(path.join(ROOT, "api")).filter((f) => f.endsWith(".js"));
eq("api/ still exactly 10 functions", 10, apiFiles.length);
// no migration added by R6 (zero-migration build)
const migrations = fs.readdirSync(path.join(ROOT, "migrations")).filter((f) => /r6|inquiry/i.test(f));
eq("zero R6 migration files", 0, migrations.length);

// ── result ───────────────────────────────────────────────────────────────────
console.log(`\n================ BUILD-R6 INQUIRY LEDGER ================`);
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
if (fail > 0) { console.log("  RESULT: FAIL"); process.exit(1); }
console.log("  RESULT: ALL GREEN"); process.exit(0);
