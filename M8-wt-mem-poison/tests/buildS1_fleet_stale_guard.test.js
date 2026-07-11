/**
 * tests/buildS1_fleet_stale_guard.test.js — Build-S1 "fleet-staleness guard" ship gate.
 *
 * Pure-function coverage (no network, no DB, no LLM) for what S1 closes:
 *   - detectFleetStale(record, entries): STALE only once the row's last sync
 *     (record._syncedAt) is older than M8_FLEET_STALE_DAYS (default 3). asOfDate
 *     is the newest FLEET-DAY on record (not the sync timestamp). Fails SAFE:
 *     an unknown sync time never marks data stale.
 *   - fleetStaleGuardEnabled(): kill-switch M8_FLEET_STALE_GUARD, default ON,
 *     mirrors healthRailEnabled()'s off/0 case-insensitive semantics.
 *   - fleetStaleDirective(staleInfo): frames the answer as a FROZEN historical
 *     archive (leads with "frozen as of <date>"), forbids today/current/now/live
 *     wording, and explicitly says this is NOT a refusal — the numbers still ship.
 * Plus STATIC WIRE GUARDS: both orchestrator compose sites (buffered + stream)
 * gate the mutation on fleetStaleGuardEnabled() and call fleetStaleDirective(),
 * proving a FRESH read or the kill-switch OFF is a true no-op by construction
 * (the mutation is inside the gated block, not after it).
 *
 * Run:  node tests/buildS1_fleet_stale_guard.test.js
 * PASS = every check passes (exit 0). Any FAIL => exit 1.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const fleet = require("../lib/fleet");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}
function eq(name, expected, actual) {
  const ok = expected === actual;
  if (!ok) console.log(`        expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  check(name, ok);
}
const hoursAgoISO = (h) => new Date(Date.now() - h * 3600000).toISOString();

// ── 0. Kill-switch default + case-insensitivity (mirrors healthRailEnabled) ──
delete process.env.M8_FLEET_STALE_GUARD;
eq("fleetStaleGuardEnabled default ON", true, fleet.fleetStaleGuardEnabled());
process.env.M8_FLEET_STALE_GUARD = "off"; eq("fleetStaleGuardEnabled('off') = false", false, fleet.fleetStaleGuardEnabled());
process.env.M8_FLEET_STALE_GUARD = "0";   eq("fleetStaleGuardEnabled('0') = false", false, fleet.fleetStaleGuardEnabled());
process.env.M8_FLEET_STALE_GUARD = "OFF"; eq("fleetStaleGuardEnabled('OFF') case-insensitive = false", false, fleet.fleetStaleGuardEnabled());
delete process.env.M8_FLEET_STALE_GUARD;

// ── 1. detectFleetStale — the pure detector ──────────────────────────────────
const entries = [
  { period: "3 Jul 2026" }, { period: "4 Jul 2026" }, { period: "5 Jul 2026" },
];

delete process.env.M8_FLEET_STALE_DAYS; // default 3 days
// FRESH mock: synced 2 hours ago.
const freshInfo = fleet.detectFleetStale({ _syncedAt: hoursAgoISO(2) }, entries);
check("FRESH mock (synced 2h ago): stale = false", freshInfo.stale === false);
eq("FRESH mock: asOfDate = newest entry period", "5 Jul 2026", freshInfo.asOfDate);

// STALE mock: synced 100 hours (~4.2 days) ago, default 3-day threshold.
const staleInfo = fleet.detectFleetStale({ _syncedAt: hoursAgoISO(100) }, entries);
check("STALE mock (synced ~4.2 days ago, default 3d threshold): stale = true", staleInfo.stale === true);
eq("STALE mock: asOfDate = newest entry period", "5 Jul 2026", staleInfo.asOfDate);
check("STALE mock: daysStale is a plausible ~4.2", staleInfo.daysStale > 4 && staleInfo.daysStale < 4.5);

// Just-under-threshold mock: synced 60 hours ago (2.5 days) stays NOT stale.
const borderlineInfo = fleet.detectFleetStale({ _syncedAt: hoursAgoISO(60) }, entries);
check("borderline mock (2.5 days, under 3d default): stale = false", borderlineInfo.stale === false);

// Unknown sync time (no _syncedAt at all) fails SAFE — never marks stale.
const unknownInfo = fleet.detectFleetStale({}, entries);
check("unknown sync time (_syncedAt absent): stale = false (fail-safe)", unknownInfo.stale === false);
eq("unknown sync time: daysStale is null", null, unknownInfo.daysStale);

// No entries at all: asOfDate is null, still fails safe on staleness math.
const noEntriesInfo = fleet.detectFleetStale({ _syncedAt: hoursAgoISO(100) }, []);
eq("no entries: asOfDate = null", null, noEntriesInfo.asOfDate);
check("no entries + stale sync: stale still computed from the sync timestamp", noEntriesInfo.stale === true);

// 30h-old sync (1.25 days) is NOT stale at the default 3-day threshold.
// M8_FLEET_STALE_DAYS is read once at module load (mirrors the existing
// STALE_HOURS/LOW_ACCEPT/LOW_UTIL threshold convention in this file — only the
// boolean kill-switch fleetStaleGuardEnabled() re-reads its env var live), so
// this only proves the shipped default; a live env flip needs a fresh require.
const thirtyHoursInfo = fleet.detectFleetStale({ _syncedAt: hoursAgoISO(30) }, entries);
check("30h-old sync: NOT stale at default 3-day threshold", thirtyHoursInfo.stale === false);

// ── 2. fleetStaleDirective — the framing text ────────────────────────────────
const dir = fleet.fleetStaleDirective({ stale: true, asOfDate: "5 Jul 2026", daysStale: 4.2 });
check("directive: leads with the frozen-as-of framing", /frozen as of 5 Jul 2026/.test(dir));
check("directive: names the nightly sync having stopped", /nightly sync has stopped/.test(dir));
check("directive: forbids today/currently/now/live wording", /NEVER describe these numbers as "today", "currently", "now", or "live"/.test(dir));
check("directive: explicitly NOT a refusal — still answers with real figures", /honest ARCHIVE, not a refusal/.test(dir) && /answer using the real figures below/.test(dir));
check("directive: handles a missing asOfDate gracefully (never throws / never blank)",
  /an earlier date/.test(fleet.fleetStaleDirective({ stale: true, asOfDate: null, daysStale: null })));

// ── 3. STATIC WIRE GUARDS (grep the JS source) ───────────────────────────────
const root = path.join(__dirname, "..");
const fleetSrc = fs.readFileSync(path.join(root, "lib/fleet.js"), "utf8");
check("fleet.js defines detectFleetStale", /function\s+detectFleetStale\s*\(/.test(fleetSrc));
check("fleet.js defines fleetStaleGuardEnabled (M8_FLEET_STALE_GUARD)", /M8_FLEET_STALE_GUARD/.test(fleetSrc) && /function\s+fleetStaleGuardEnabled\s*\(/.test(fleetSrc));
check("fleet.js defines fleetStaleDirective", /function\s+fleetStaleDirective\s*\(/.test(fleetSrc));
check("fleet.js reads M8_FLEET_STALE_DAYS (default 3)", /M8_FLEET_STALE_DAYS \|\| 3/.test(fleetSrc));
check("fleet.js EXPORTS the three S1 symbols", /fleetStaleGuardEnabled, detectFleetStale, fleetStaleDirective/.test(fleetSrc));

const orch = fs.readFileSync(path.join(root, "lib/orchestrator.js"), "utf8");
const gateHits = (orch.match(/fleetCtx\.text\s*&&\s*fleetStaleGuardEnabled\(\)/g) || []).length;
eq("orchestrator gates the guard at BOTH compose sites on fleetCtx.text && fleetStaleGuardEnabled()", 2, gateHits);
const directiveHits = (orch.match(/fleetStaleDirective\(/g) || []).length;
eq("orchestrator calls fleetStaleDirective(...) at exactly 2 sites (buffered + stream)", 2, directiveHits);
check("orchestrator imports the S1 symbols from ./fleet",
  /getFleetRecord, decodeHistory, fleetStaleGuardEnabled, detectFleetStale, fleetStaleDirective/.test(orch));
// The mutation of fleetCtx.text must sit INSIDE the gated if-block (proves a
// fresh read or kill-switch OFF is a true structural no-op, not just a
// behavioural one) — check the mutation line follows a `_fsStale.stale` /
// `_fsStaleS.stale` check within the same guarded block.
check("buffered site: mutation is conditioned on _fsStale.stale (inner gate)", /_fsStale\.stale\)\s*\{[\s\S]{0,120}fleetStaleDirective\(_fsStale\)/.test(orch));
check("stream site: mutation is conditioned on _fsStaleS.stale (inner gate)", /_fsStaleS\.stale\)\s*\{[\s\S]{0,120}fleetStaleDirective\(_fsStaleS\)/.test(orch));
// The guard runs LAST among fleetCtx.text mutations, right before it's folded
// into systemInstruction — never before the change-analysis/report overwrites
// that would otherwise silently drop it.
const fleetInjectIdx = orch.indexOf("// ── FLEET DATA: deterministic metric packet (ground truth; explain only) ──");
const guardIdx = orch.indexOf("BUILD-S1: fleet-staleness guard (compose-time narration guard");
check("buffered site: the stale guard runs BEFORE fleetCtx.text is folded into systemInstruction",
  guardIdx > 0 && fleetInjectIdx > 0 && fleetInjectIdx > guardIdx);

console.log(`\nBuild-S1 fleet-staleness guard: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
