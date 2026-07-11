/**
 * B-194 — memory-poisoning fix (regression test)
 *
 * On 2026-07-10 M8 fabricated "yes, the loop proved the lemmas — per the
 * system's internal log." The lie was sourced from memory: a session summary had
 * laundered Muhammad's own LEADING QUESTION ("did the loop prove the lemmas?")
 * into a durable, recallable FACT which recall then served as authoritative.
 *
 * This test proves, WITHOUT touching the network / prod memory:
 *   1. A user question / an unverified system-self-claim is classified as a
 *      user assertion (not a system fact).
 *   2. upsertFact stores such a fact as a NON-authoritative audit row
 *      (is_current=false, trust_level < RECALL_MIN_TRUST) — never recallable,
 *      never superseding a genuine fact.
 *   3. recall-side labelUserAssertions relabels a LEGACY poison row (already at
 *      full trust) so it can never be echoed as "the internal log confirms X".
 *   4. Genuine observed facts are UNTOUCHED (no over-filtering).
 *
 * Run:
 *   NODE_PATH=".../M8/node_modules" <kimi-node> tests/B194-memory-poisoning.test.js
 */
"use strict";

const path = require("path");
const mem = require(path.join(__dirname, "..", "lib", "memory.js"));

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? "  — " + extra : ""}`); }
}
function eq(name, got, want) { ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }

// The exact 07-10 phrasings.
const Q  = "did the loop prove the lemmas?";
const Q2 = "did I close the Alkhair deal";                       // leading Q, no system words, no "?"
const CLAIM = "The loop proved the lemmas, per the system's internal log.";
const LAUNDERED = "The loop proved the lemmas.";                  // what the summary stored as a "fact"

// Genuine, observed facts that MUST keep flowing normally.
const GENUINE_PROFILE = "Muhammad's wife is Sara.";
const GENUINE_OP      = "Muhammad's fleet has 12 cars.";

console.log("\n[1] Detectors ---------------------------------------------------");
eq("isInterrogative: leading question w/ '?'",      mem.isInterrogative(Q), true);
eq("isInterrogative: leading question no '?'",      mem.isInterrogative(Q2), true);
eq("isInterrogative: genuine fact is not a Q",      mem.isInterrogative(GENUINE_PROFILE), false);
eq("isInterrogative: genuine op fact is not a Q",   mem.isInterrogative(GENUINE_OP), false);
eq("isUnverifiedSystemClaim: the poison claim",     mem.isUnverifiedSystemClaim(CLAIM), true);
eq("isUnverifiedSystemClaim: laundered statement",  mem.isUnverifiedSystemClaim(LAUNDERED), true);
eq("isUnverifiedSystemClaim: the raw question",     mem.isUnverifiedSystemClaim(Q), true);
eq("isUnverifiedSystemClaim: spouse fact clean",    mem.isUnverifiedSystemClaim(GENUINE_PROFILE), false);
eq("isUnverifiedSystemClaim: fleet fact clean",     mem.isUnverifiedSystemClaim(GENUINE_OP), false);

console.log("\n[2] classifyFactProvenance -------------------------------------");
eq("laundered system statement -> assertion",   mem.classifyFactProvenance({ statement: LAUNDERED }).assertion, true);
eq("assertion carried from source Q -> assertion", mem.classifyFactProvenance({ statement: "the deal is closed", assertion: true }).assertion, true);
eq("genuine profile -> not assertion",          mem.classifyFactProvenance({ statement: GENUINE_PROFILE }).assertion, false);
eq("genuine op -> not assertion",               mem.classifyFactProvenance({ statement: GENUINE_OP }).assertion, false);
eq("assertion trust is demoted",                mem.classifyFactProvenance({ statement: LAUNDERED }).trust_level, mem.USER_ASSERTION_TRUST);
ok("USER_ASSERTION_TRUST is below recall floor(3)", mem.USER_ASSERTION_TRUST < 3);

console.log("\n[3] upsertFact stores poison as a non-authoritative audit row --");
// Minimal chainable mock of the supabase client. Captures inserts; reports NO
// existing current row so the write path is exercised end to end. casWritesEnabled
// defaults off (no env) -> the pre-E1 path; either path must NOT create a current row.
function makeMockDb() {
  const inserts = [];
  const api = {
    inserts,
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    is() { return this; },
    ilike() { return this; },
    order() { return this; },
    limit() { return Promise.resolve({ data: [], error: null }); },   // no existing current fact
    update() { return { eq() { return { eq() { return { select() { return Promise.resolve({ data: [{ id: "x" }], error: null }); } }; }, select() { return Promise.resolve({ data: [{ id: "x" }], error: null }); } }; } }; },
    insert(rows) { inserts.push(...rows); return Promise.resolve({ error: null }); },
  };
  return api;
}

(async () => {
  // 3a: the laundered poison fact goes through the REAL upsertFact write path.
  const db1 = makeMockDb();
  await mem.upsertFact(db1, "sess-real-1", { key: "loop_lemmas", statement: LAUNDERED, memory_type: "operational", importance: 5 });
  ok("poison fact produced exactly one insert", db1.inserts.length === 1, `inserts=${db1.inserts.length}`);
  const poisonRow = db1.inserts[0] || {};
  eq("poison stored is_current=false (never recalled)", poisonRow.is_current, false);
  eq("poison stored at demoted trust", poisonRow.trust_level, mem.USER_ASSERTION_TRUST);
  ok("poison stored source_type within CHECK set",
    ["user_session", "eval_probe", "cron_session", "summary"].includes(poisonRow.source_type),
    `source_type=${poisonRow.source_type}`);
  ok("poison audit row is provenance-tagged", poisonRow.metadata && poisonRow.metadata.b194_user_assertion === true);

  // 3b: a leading question laundered by the extractor into a plain statement — the
  // interrogative provenance is carried via assertion:true and still demoted.
  const db2 = makeMockDb();
  await mem.upsertFact(db2, "sess-real-2", { key: "alkhair_deal", statement: "The Alkhair deal is closed.", memory_type: "operational", assertion: true });
  eq("laundered-question fact stored is_current=false", (db2.inserts[0] || {}).is_current, false);

  // 3c: a GENUINE observed fact takes the normal path — one CURRENT row at full trust.
  const db3 = makeMockDb();
  await mem.upsertFact(db3, "sess-real-3", { key: "spouse_name", statement: GENUINE_PROFILE, memory_type: "profile", importance: 5 });
  ok("genuine fact produced an insert", db3.inserts.length === 1, `inserts=${db3.inserts.length}`);
  eq("genuine fact stored is_current=true", (db3.inserts[0] || {}).is_current, true);
  ok("genuine fact keeps full trust (>=3)", (db3.inserts[0] || {}).trust_level >= 3, `trust=${(db3.inserts[0]||{}).trust_level}`);

  console.log("\n[4] Recall labeling (last line of defence) ---------------------");
  // A legitimate descriptive fact about M8's OWN engine — contains a system
  // subject + a verify predicate, yet is perfectly valid memory. The recall net
  // must NOT touch it (this is the over-filtering bug caught during live verify).
  const GENUINE_SYSTEM_DESC = "M8's unsolved-problem engine autonomously generates and verifies Collatz conjectures nightly.";
  // Simulate what recallMemory merges: a LEGACY question-as-fact at full trust, a
  // demoted audit row, a declarative laundered claim at full trust, and 3 genuine
  // facts (profile, operational, and a system-capability description).
  const merged = [
    { id: "p1",      content: GENUINE_PROFILE,     memory_type: "profile",     trust_level: 4, created_at: "2026-07-01T00:00:00Z" },
    { id: "q_fact",  content: Q,                   memory_type: "operational", trust_level: 4, created_at: "2026-07-10T00:00:00Z" }, // literal question stored as a fact
    { id: "op1",     content: GENUINE_OP,          memory_type: "operational", trust_level: 4, created_at: "2026-07-02T00:00:00Z" },
    { id: "sysdesc", content: GENUINE_SYSTEM_DESC, memory_type: "operational", trust_level: 4, created_at: "2026-07-03T00:00:00Z" },
    { id: "declar",  content: LAUNDERED,           memory_type: "operational", trust_level: 4, created_at: "2026-07-10T00:00:00Z" }, // declarative, full trust
    { id: "demoted", content: LAUNDERED,           memory_type: "operational", trust_level: mem.USER_ASSERTION_TRUST, created_at: "2026-07-10T00:00:00Z" },
  ];
  const labeled = mem.labelUserAssertions(merged);
  const byId = Object.fromEntries(labeled.map((r) => [r.id, r]));

  ok("literal-question-as-fact is relabeled UNVERIFIED",
    byId.q_fact.content.startsWith(mem.USER_ASSERTION_LABEL) && byId.q_fact.content.includes(Q));
  ok("demoted-trust row is relabeled UNVERIFIED",
    byId.demoted.content.startsWith(mem.USER_ASSERTION_LABEL));
  eq("genuine profile fact is UNCHANGED", byId.p1.content, GENUINE_PROFILE);
  eq("genuine operational fact is UNCHANGED", byId.op1.content, GENUINE_OP);
  eq("genuine SYSTEM-CAPABILITY fact is UNCHANGED (no over-filtering)", byId.sysdesc.content, GENUINE_SYSTEM_DESC);
  // A declarative laundered claim at full trust is handled at STORE time (demoted);
  // the recall net intentionally does NOT relabel it, to avoid over-filtering.
  eq("declarative full-trust row is NOT relabeled by recall (store-side owns it)", byId.declar.content, LAUNDERED);
  ok("labeling is idempotent", (() => {
    const twice = mem.labelUserAssertions(labeled);
    return twice.find((r) => r.id === "q_fact").content ===
           labeled.find((r) => r.id === "q_fact").content;
  })());

  // The acceptance condition, stated directly: a stored question cannot be
  // surfaced as bare authoritative text — its recalled form now literally says it
  // is UNVERIFIED, so the model cannot echo "yes, per the internal log, X happened."
  ok("ACCEPTANCE: a stored question can no longer be presented as a confirmed fact",
    byId.q_fact.content.includes("UNVERIFIED") && byId.q_fact.content.includes(Q));

  console.log("\n[5] isUserAssertionRow classification --------------------------");
  eq("literal-question-as-fact flagged", mem.isUserAssertionRow({ content: Q, memory_type: "operational", trust_level: 4 }), true);
  eq("demoted-trust row flagged",      mem.isUserAssertionRow({ content: "anything", trust_level: 2 }), true);
  eq("question-as-fact flagged",       mem.isUserAssertionRow({ content: "did I close it?", memory_type: "operational", trust_level: 4 }), true);
  eq("genuine profile NOT flagged",    mem.isUserAssertionRow({ content: GENUINE_PROFILE, memory_type: "profile", trust_level: 4 }), false);
  eq("genuine op NOT flagged",         mem.isUserAssertionRow({ content: GENUINE_OP, memory_type: "operational", trust_level: 4 }), false);
  eq("genuine SYSTEM-CAPABILITY fact NOT flagged (regression guard)",
     mem.isUserAssertionRow({ content: GENUINE_SYSTEM_DESC, memory_type: "operational", trust_level: 4 }), false);
  eq("declarative full-trust laundered claim NOT flagged by recall",
     mem.isUserAssertionRow({ content: LAUNDERED, memory_type: "operational", trust_level: 4 }), false);

  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
