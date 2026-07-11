/**
 * Build-182 — Arabic-aware relation resolution (the B-181 residual)
 *  (tests/build182_ar_relation_resolution.test.js)
 *
 * Run: node tests/build182_ar_relation_resolution.test.js
 *
 * B-181 shipped relationProbeFrom() detecting the Arabic sentence SHAPE
 * ("هل سارة زوجتي؟") fine, but resolveRelationEntity() still failed to
 * resolve the Arabic name TOKEN "سارة" against his own Latin-stored data
 * (profile row "Sara is your wife" — a plain .includes("sara") check misses
 * the Arabic token). This build adds a NARROW AR->Latin equivalence, scoped
 * to ONLY the household roster's own alias table (sara/muhammad) — never a
 * general transliteration table — so an Arabic query resolves the SAME
 * entity as its Latin form without broadening who can resolve.
 *
 * Covers the two new PURE helpers (no DB / LLM / network):
 *
 *   (A) rosterLatinAliasFor(name) — AR name token -> roster Latin base, or
 *       null for anyone not already in his roster alias table.
 *
 *   (B) profileNamesRelationEntity(name, pastMemory) — does a stored PROFILE
 *       row name this entity, checked against the name AND its roster Latin
 *       equivalent. Shared by resolveRelationEntity and the stream-gate echo.
 *
 * Plus resolveRelationEntity() end-to-end with an Arabic probed name, and the
 * §4 PII INVARIANT re-proven for an Arabic STRANGER name (not in the roster):
 * it must still return null so the caller writes ZERO state.
 */
"use strict";
const o = require("../lib/orchestrator");
const { resolveRelationEntity, rosterLatinAliasFor, profileNamesRelationEntity } = o;

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) { pass++; } else { fails.push(label); console.log("  FAIL  " + label); } }

// ── (A) rosterLatinAliasFor — AR name -> roster Latin base ────────────────────
ok("A1 AR 'سارة' -> 'sara'",           rosterLatinAliasFor("سارة") === "sara");
ok("A2 AR alt spelling 'ساره' -> 'sara'", rosterLatinAliasFor("ساره") === "sara");
ok("A3 AR 'محمد' -> 'muhammad'",       rosterLatinAliasFor("محمد") === "muhammad");
ok("A4 Latin 'Sara' -> 'sara' (case-insensitive)", rosterLatinAliasFor("Sara") === "sara");
ok("A5 AR stranger 'جوناثان' -> null",  rosterLatinAliasFor("جوناثان") === null);
ok("A6 empty -> null",                  rosterLatinAliasFor("") === null && rosterLatinAliasFor(null) === null);

// ── (B) profileNamesRelationEntity — AR token matches Latin-stored content ────
{
  const pm = [{ memory_type: "profile", content: "Sara is your wife" }];
  ok("B1 AR name matches Latin profile row via roster alias", profileNamesRelationEntity("سارة", pm) === true);
  ok("B2 Latin name still matches directly (no regression)",  profileNamesRelationEntity("Sara", pm) === true);
}
{
  // An Arabic name NOT in the roster must NOT match, even against unrelated content —
  // this is the §4 invariant surface: no roster alias => no equivalence => no match.
  const pm = [{ memory_type: "profile", content: "Sara is your wife" }];
  ok("B3 AR stranger name does NOT match (no roster alias)", profileNamesRelationEntity("جوناثان", pm) === false);
}
{
  ok("B4 non-array pastMemory -> false, never throws", profileNamesRelationEntity("سارة", null) === false && profileNamesRelationEntity("سارة", undefined) === false);
}
{
  // A non-profile row (e.g. a raw fact/mention) must not count.
  const pm = [{ memory_type: "mention", content: "Sara is your wife" }];
  ok("B5 non-profile memory_type ignored", profileNamesRelationEntity("سارة", pm) === false);
}

// ── resolveRelationEntity end-to-end — the AR name resolves via the SAME ──────
// Latin-stored profile row that already resolves the EN form (B-181 B2).
{
  const pm = [{ memory_type: "profile", content: "Muhammad's wife is Sara" }];
  const r = resolveRelationEntity("سارة", { card: null, member: null, pastMemory: pm });
  ok("C1 AR 'سارة' resolves via stored profile memory", r && r.knownPersonCard === true && r.via === "stored profile memory");
}
// §4 INVARIANT re-proven for an Arabic STRANGER — must stay null (zero state).
{
  const pm = [{ memory_type: "profile", content: "Muhammad's wife is Sara" }];
  const r = resolveRelationEntity("جوناثان", { card: null, member: null, pastMemory: pm });
  ok("C2 §4: AR stranger name ⇒ null (no fabrication, zero state)", r === null);
}
// A household MEMBER match (already Arabic-aware via _MEMBER_ALIASES) still wins first.
{
  const r = resolveRelationEntity("سارة", { card: null, member: { id: 1, name: "Sara" }, pastMemory: [] });
  ok("C3 AR name + member hit ⇒ household member (priority unchanged)", r && r.via === "household member");
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log("\nBuild-182 AR relation resolution: " + pass + " passed, " + fails.length + " failed");
if (fails.length) { console.log("FAILURES:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("All Build-182 AR relation resolution assertions passed.");
