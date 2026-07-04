"use strict";
/**
 * Shared c1 cloud-compression codec — SINGLE SOURCE OF TRUTH for driver packing.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `packDriver`/`unpackDriver` used to be hand-copied into BOTH index.html and
 * api/bolt/cron-sync.js. They drifted (Build-167: the cron copy was silently
 * missing `cat`, so every auto-synced day lost the active-categories field).
 * cron-sync.js now `require("./codec")` instead of carrying its own copy, and a
 * parity test (tests/codec_parity.test.js) asserts index.html's inline copy still
 * matches THIS file field-for-field — so a future field can't be added to one and
 * forgotten in the other without the test going red.
 *
 * ADDING A DRIVER FIELD: edit packDriver + unpackDriver HERE, then mirror the same
 * two lines into index.html's packDriver/unpackDriver (kept inline there so the
 * static page has zero external-script dependency). Run the parity test to confirm.
 *
 * The format is 'c1': 1-3 char keys, zero/empty fields omitted, numbers rounded to
 * 2 dp. Lossless for every field any view reads — unpackDriver restores full shape
 * with defaults. This module is intentionally dependency-free (matches lib.js style)
 * so Vercel bundles it with the function via the local require.
 *
 * NOTE: packEntry/unpackEntry are deliberately NOT shared. The browser's packEntry
 * reads precomputed aggregates (h.driverCount/totalGross/…) while the cron derives
 * them from the drivers array — genuinely different input contracts, and only ~10
 * stable top-level keys (low drift risk). Only the 40-field packDriver, which is
 * where the drift actually happened, is single-sourced here.
 */

const CLOUD_FMT = 'c1';
const _r2 = v => Math.round((v || 0) * 100) / 100;  // round to 2 decimals

function packDriver(d) {
  const o = {};
  const putS = (k, v) => { if (v) o[k] = v; };                 // omit '' / null
  const putN = (k, v) => { const r = _r2(v); if (r) o[k] = r; }; // omit 0
  putS('n', d.name); putS('i', d.driverId); putS('ph', d.phone); putS('em', d.email);
  putN('o', d.orders); putN('h', d.hoursOnline); putN('ne', d.netEarnings); putN('ge', d.grossEarnings);
  putN('ac', d.acceptance); putN('ra', d.rating); putN('sc', d.score); putN('dt', d.distanceTotal); putN('da', d.distanceAvg);
  putN('cg', d.cashGap); putN('pg', d.payoutGap); putN('pp', d.projectedPayout); putN('ap', d.actualPayout);
  putN('tp', d.tips); putN('cm', d.campaign); putN('co', d.commission); putN('nph', d.netPerHour); putN('ut', d.utilization);
  putN('fr', d.finishRate);
  if (d.fleetCut     != null) o.fc = _r2(d.fleetCut);      // 0 is meaningful here → keep
  if (d.driverPayout != null) o.dp = _r2(d.driverPayout);
  putS('cat', d.activeCategories);
  putS('bs', d.boltState);
  putS('bsr', d.boltSuspensionReason);
  putS('bsc', d.boltSuspensionCategory);
  putS('bss', d.boltSuspendedSince);
  putS('vp', d.vehiclePlate);
  putS('vs', d.vehicleState);              // Build-167: vehicle suspension
  putS('vsr', d.vehicleSuspensionReason);
  putS('ic', d.inactiveCategories);        // disabled ride categories
  if (d.hasCashPayment != null) o.hcp = d.hasCashPayment ? 1 : 0;
  if (d.isActive) o.a = 1;
  putN('gia', d.grossInApp); putN('act', d.acceptanceTotal); putN('ce', d.cashEarnings); putN('cf', d.cancellationFees);
  putN('tf', d.tollFees); putN('er', d.expenseReimbursements); putN('bf', d.bookingFees); putN('rr', d.refundsToRiders);
  putN('cdi', d.commissionDiscountInApp); putN('cdc', d.commissionDiscountCash);
  const lvl = d.tier?.level ?? -1; if (lvl !== -1) o.tl = lvl;
  const tnm = d.tier?.englishName || ''; if (tnm) o.tn = tnm;
  return o;
}

function unpackDriver(o) {
  return {
    name: o.n || '', driverId: o.i || '', phone: o.ph || '', email: o.em || '',
    tier: { level: o.tl ?? -1, englishName: o.tn || '' },
    orders: o.o || 0, hoursOnline: o.h || 0, netEarnings: o.ne || 0, grossEarnings: o.ge || 0,
    acceptance: o.ac || 0, rating: o.ra || 0, score: o.sc || 0, distanceTotal: o.dt || 0, distanceAvg: o.da || 0,
    cashGap: o.cg || 0, payoutGap: o.pg || 0, projectedPayout: o.pp || 0, actualPayout: o.ap || 0,
    tips: o.tp || 0, campaign: o.cm || 0, commission: o.co || 0, netPerHour: o.nph || 0, utilization: o.ut || 0,
    finishRate: o.fr || 0,
    fleetCut: o.fc ?? null, driverPayout: o.dp ?? null,
    activeCategories: o.cat || '', isActive: !!o.a,
    boltState: o.bs || '', boltSuspensionReason: o.bsr || '',
    boltSuspensionCategory: o.bsc || '', boltSuspendedSince: o.bss || '',
    vehiclePlate: o.vp || '', vehicleState: o.vs || '', vehicleSuspensionReason: o.vsr || '', inactiveCategories: o.ic || '',
    hasCashPayment: o.hcp != null ? !!o.hcp : null,
    grossInApp: o.gia || 0, acceptanceTotal: o.act || 0, cashEarnings: o.ce || 0, cancellationFees: o.cf || 0,
    tollFees: o.tf || 0, expenseReimbursements: o.er || 0, bookingFees: o.bf || 0, refundsToRiders: o.rr || 0,
    commissionDiscountInApp: o.cdi || 0, commissionDiscountCash: o.cdc || 0,
  };
}

module.exports = { packDriver, unpackDriver, _r2, CLOUD_FMT };
