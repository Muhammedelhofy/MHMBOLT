"use strict";
/**
 * codec parity / round-trip / cron-safety test  (Spec 1, 2026-07-04)
 *
 * Guards the single-sourced c1 driver codec (api/bolt/codec.js) against the failure
 * that motivated it: the cron and index.html carried hand-copied packDriver copies
 * that silently drifted (Build-167 lost `cat`). This test asserts:
 *   1. PARITY   — index.html's inline packDriver/unpackDriver produce byte-identical
 *                 output to api/bolt/codec.js for a battery of fixtures. If someone
 *                 edits one copy and not the other, this goes RED.
 *   2. LOSSLESS — unpack(pack(x)) carries the same info as x (pack∘unpack∘pack == pack).
 *   3. REGRESS  — the exact Build-167 bug: `cat` survives packing.
 *   4. CRON-SAFE— codec.packDriver on a lib.js-shaped driver emits no key outside the
 *                 set the cron already emitted, so the live midnight output is unchanged.
 *
 * Run (host Node is bundled in Kimi, not on PATH):
 *   ELECTRON_RUN_AS_NODE=1 "<...>/kimi-desktop/Kimi.exe" tests/codec_parity.test.js
 * or, where node is on PATH:
 *   node tests/codec_parity.test.js
 * Exit code 0 = pass, 1 = fail.
 */

const fs   = require("fs");
const path = require("path");
const assert = require("assert");

const codec = require("../api/bolt/codec.js");

// ── Extract index.html's INLINE packDriver/unpackDriver (kept inline there so the
//    static page has no external-script dependency) and eval them in a sandbox. ──
function loadInlineCodec() {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const iPack   = html.indexOf("function packDriver(d) {");
  const iUnpack = html.indexOf("function unpackDriver(o) {");
  const iEntry  = html.indexOf("function packEntry(h) {");
  if (iPack < 0 || iUnpack < 0 || iEntry < 0 || !(iPack < iUnpack && iUnpack < iEntry)) {
    throw new Error("Could not locate inline packDriver/unpackDriver/packEntry in index.html — the anchors moved; update this test.");
  }
  const packSrc   = html.slice(iPack,   iUnpack);
  const unpackSrc = html.slice(iUnpack, iEntry);
  const body = `
    const _r2 = v => Math.round((v || 0) * 100) / 100;
    ${packSrc}
    ${unpackSrc}
    return { packDriver, unpackDriver };
  `;
  // eslint-disable-next-line no-new-func
  return new Function(body)();
}

const inline = loadInlineCodec();

// ── Fixtures — cover full/active, inactive/zero, and a lib.js-shaped driver ──
const fixtures = {
  fullActive: {
    name: "Ayman Test", driverId: "uuid-1", phone: "+966500000001", email: "a@b.co",
    tier: { level: 3, englishName: "Gold" },
    orders: 42, hoursOnline: 9.5, netEarnings: 812.34, grossEarnings: 1010.5,
    acceptance: 88, rating: 4.9, score: 97, distanceTotal: 321.7, distanceAvg: 7.66,
    cashGap: 25.5, payoutGap: -3.2, projectedPayout: 900, actualPayout: 880.25,
    tips: 15.75, campaign: 50, commission: 120.4, netPerHour: 85.5, utilization: 71.2,
    finishRate: 93.4, fleetCut: 0, driverPayout: 12.5,
    activeCategories: "Economy, XL", isActive: true,
    boltState: "active", boltSuspensionReason: "", boltSuspensionCategory: "", boltSuspendedSince: "",
    vehiclePlate: "ABC-123", vehicleState: "active", vehicleSuspensionReason: "", inactiveCategories: "Pet",
    hasCashPayment: true,
    grossInApp: 500.5, acceptanceTotal: 95, cashEarnings: 210.3, cancellationFees: 4.5,
    tollFees: 6.25, expenseReimbursements: 3.1, bookingFees: 30.6, refundsToRiders: 1.2,
    commissionDiscountInApp: 8.4, commissionDiscountCash: 2.7,
  },
  inactiveZero: {
    name: "Idle Driver", driverId: "uuid-2", phone: "", email: "",
    tier: { level: -1, englishName: "" },
    orders: 0, hoursOnline: 0, netEarnings: 0, grossEarnings: 0,
    acceptance: 0, rating: 0, score: 0, distanceTotal: 0, distanceAvg: 0,
    cashGap: 0, payoutGap: 0, projectedPayout: 0, actualPayout: 0,
    tips: 0, campaign: 0, commission: 0, netPerHour: 0, utilization: 0,
    finishRate: 0, fleetCut: null, driverPayout: null,
    activeCategories: "", isActive: false,
    boltState: "blocked", boltSuspensionReason: "Docs expired", boltSuspensionCategory: "document", boltSuspendedSince: "01 Jul 2026",
    vehiclePlate: "", vehicleState: "", vehicleSuspensionReason: "", inactiveCategories: "",
    hasCashPayment: null,
    grossInApp: 0, acceptanceTotal: 0, cashEarnings: 0, cancellationFees: 0,
    tollFees: 0, expenseReimbursements: 0, bookingFees: 0, refundsToRiders: 0,
    commissionDiscountInApp: 0, commissionDiscountCash: 0,
  },
  // Shaped exactly like a driver produced by api/bolt/lib.js fetchAndAggregateFleet.
  libShaped: {
    name: "Fleet Driver", driverId: "uuid-3", phone: "+966500000003",
    orders: 17, hoursOnline: 6.25, rating: 4.7, score: 88,
    netEarnings: 305.1, grossEarnings: 402.0, tips: 4.5, commission: 60.2,
    bookingFees: 12.0, tollFees: 2.5, cancellationFees: 1.5, cashEarnings: 90.0,
    distanceTotal: 140.2, distanceAvg: 8.24, utilization: 55.5, finishRate: 90.1,
    isActive: true, boltState: "active", boltSuspensionReason: "",
    boltSuspensionCategory: "", boltSuspendedSince: "",
    hasCashPayment: true, vehiclePlate: "XYZ-9", vehicleState: "active",
    vehicleSuspensionReason: "", activeCategories: "Economy", inactiveCategories: "",
  },
};

// The exact key set the cron's OLD inline packDriver could emit (pre-refactor).
// codec.packDriver on a lib-shaped driver must not emit anything outside this set,
// or the live midnight output would have changed.
const CRON_KEYS = new Set([
  "n","i","ph","o","h","ne","ge","ra","sc","dt","da","tp","co","ut","fr",
  "ce","cf","tf","bf","bs","bsr","bsc","bss","cat","vs","vsr","ic","vp","hcp","a",
]);

let passed = 0;
const fail = (msg) => { console.error("  ✗ " + msg); process.exitCode = 1; };
const ok   = (msg) => { passed++; console.log("  ✓ " + msg); };

for (const [fname, f] of Object.entries(fixtures)) {
  // 1. PARITY — codec vs index.html inline, both directions.
  const cP = codec.packDriver(f), iP = inline.packDriver(f);
  try { assert.deepStrictEqual(cP, iP); ok(`parity packDriver — ${fname}`); }
  catch { fail(`parity packDriver MISMATCH — ${fname}\n    codec : ${JSON.stringify(cP)}\n    inline: ${JSON.stringify(iP)}`); }

  const cU = codec.unpackDriver(cP), iU = inline.unpackDriver(cP);
  try { assert.deepStrictEqual(cU, iU); ok(`parity unpackDriver — ${fname}`); }
  catch { fail(`parity unpackDriver MISMATCH — ${fname}`); }

  // 2. LOSSLESS — pack(unpack(pack(x))) === pack(x)  (nothing the codec stores is lost).
  const round = codec.packDriver(codec.unpackDriver(cP));
  try { assert.deepStrictEqual(round, cP); ok(`lossless round-trip — ${fname}`); }
  catch { fail(`lossless round-trip FAILED — ${fname}\n    before: ${JSON.stringify(cP)}\n    after : ${JSON.stringify(round)}`); }
}

// 3. REGRESSION — the Build-167 bug: activeCategories must survive as `cat`.
try {
  assert.strictEqual(codec.packDriver({ activeCategories: "Economy, XL" }).cat, "Economy, XL");
  ok("regression — `cat` (activeCategories) survives packing (Build-167)");
} catch { fail("regression — `cat` was dropped (the exact Build-167 bug is back)"); }

// 4. CRON-SAFE — a lib-shaped driver emits no key the old cron didn't already emit.
{
  const emitted = Object.keys(codec.packDriver(fixtures.libShaped));
  const strays  = emitted.filter(k => !CRON_KEYS.has(k));
  if (strays.length === 0) ok(`cron-safe — lib-shaped driver emits only known cron keys (${emitted.length})`);
  else fail(`cron-safe — codec emits keys the old cron never did: ${strays.join(", ")} (would change live output)`);
}

console.log(`\n${passed} checks passed${process.exitCode ? " — WITH FAILURES" : " — all green"}.`);
