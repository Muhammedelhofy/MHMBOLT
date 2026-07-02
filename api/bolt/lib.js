"use strict";
/**
 * Shared Bolt Fleet API helpers used by sync.js and cron-sync.js.
 * Single source of truth — fixes here apply to both manual and auto sync.
 */

let cachedToken = null;
let tokenExpiry = 0;

async function getBoltToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const body = new URLSearchParams({
    client_id:     process.env.BOLT_CLIENT_ID,
    client_secret: process.env.BOLT_CLIENT_SECRET,
    grant_type:    "client_credentials",
    scope:         "fleet-integration:api",
  });
  const resp = await fetch("https://oidc.bolt.eu/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });
  if (!resp.ok) throw new Error(`Bolt token error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 30) * 1000;
  return cachedToken;
}

async function boltAPI(method, path, payload) {
  const token = await getBoltToken();
  const opts  = { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
  if (payload) opts.body = JSON.stringify(payload);
  const resp = await fetch(`https://node.bolt.eu/fleet-integration-gateway${path}`, opts);
  if (!resp.ok) throw new Error(`Bolt API ${path}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function paginateAll(path, body, listKey, totalKey) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  // Safe fallback: start at 0 so the guard `items.length < limit` is the authoritative exit.
  let total = 0;
  do {
    const resp  = await boltAPI("POST", path, { ...body, offset, limit });
    const items = resp.data?.[listKey] ?? [];
    total       = Number(resp.data?.[totalKey] ?? 0) || 0;
    for (const i of items) all.push(i);
    if (items.length < limit) break;
    offset += items.length;
  } while (all.length < total);
  return all;
}

const r2 = v => Math.round((v || 0) * 100) / 100;

/**
 * Full fleet data fetch for a given date (yyyy-MM-dd, Saudi time).
 * Returns { allOrders, drivers, startTs, endTs }.
 */
async function fetchAndAggregateFleet(date) {
  const d       = new Date(date + "T00:00:00+03:00");
  const startTs = Math.floor(d.getTime() / 1000);
  const endTs   = startTs + 86400;

  // 1. Company IDs
  const compResp   = await boltAPI("GET", "/fleetIntegration/v1/getCompanies");
  const companyIds = compResp.data?.company_ids ?? [];
  if (!companyIds.length) throw new Error("getCompanies returned no company IDs");

  // 2. Orders
  const allOrders = await paginateAll(
    "/fleetIntegration/v1/getFleetOrders",
    { company_ids: companyIds, start_ts: startTs, end_ts: endTs, time_range_filter_type: "price_review" },
    "orders", "total_orders"
  );

  // 3. Hours online per driver (optional — failure per company is logged, not fatal)
  const hoursOnlineMap = {};
  for (const cid of companyIds) {
    try {
      const logs = await paginateAll(
        "/fleetIntegration/v1/getFleetStateLogs",
        { company_id: cid, start_ts: startTs, end_ts: endTs },
        "state_logs", "total_rows"
      );
      const byDriver = {};
      for (const log of logs) {
        if (!byDriver[log.driver_uuid]) byDriver[log.driver_uuid] = [];
        byDriver[log.driver_uuid].push(log);
      }
      for (const [uuid, dLogs] of Object.entries(byDriver)) {
        dLogs.sort((a, b) => a.created - b.created);
        let secs = 0, onlineAt = null;
        for (const log of dLogs) {
          if (log.state !== "inactive") { if (!onlineAt) onlineAt = log.created; }
          else { if (onlineAt) { secs += log.created - onlineAt; onlineAt = null; } }
        }
        if (onlineAt) secs += endTs - onlineAt;
        hoursOnlineMap[uuid] = (hoursOnlineMap[uuid] || 0) + secs;
      }
    } catch (e) { console.warn(`[bolt-lib] state-logs company ${cid}:`, e.message); }
  }

  // 4. Driver profiles → rating, score, vehicle, state (optional per company)
  const profileMap = {};
  for (const cid of companyIds) {
    try {
      const drivers = await paginateAll(
        "/fleetIntegration/v1/getDrivers",
        { company_id: cid, start_ts: startTs, end_ts: endTs },
        "drivers", "total"
      );
      for (const dr of drivers) profileMap[dr.driver_uuid] = dr;
    } catch (e) { console.warn(`[bolt-lib] profiles company ${cid}:`, e.message); }
  }

  // 5. Aggregate orders per driver
  const blankDriver = uuid => ({
    name: "", driverId: uuid, phone: "",
    orders: 0, hoursOnline: 0, rating: 0, score: 0,
    netEarnings: 0, grossEarnings: 0, tips: 0,
    commission: 0, bookingFees: 0, tollFees: 0,
    cancellationFees: 0, cashEarnings: 0,
    distanceTotal: 0, distanceAvg: 0,
    isActive: false, _cnt: 0,
  });

  // Seed the map with EVERY registered driver from the roster (getDrivers),
  // so drivers who had no orders on this date still appear (inactive, all-zero).
  // Without this the synced driver count only reflects drivers who drove that
  // day, undercounting vs the main Bolt dashboard's full roster.
  const driverMap = {};
  for (const uuid of Object.keys(profileMap)) driverMap[uuid] = blankDriver(uuid);

  for (const order of allOrders) {
    const uuid = order.driver_uuid;
    if (!driverMap[uuid]) driverMap[uuid] = blankDriver(uuid);
    const dr = driverMap[uuid];
    if (order.driver_name)  dr.name  = order.driver_name;
    if (order.driver_phone) dr.phone = order.driver_phone;
    const p = order.order_price;
    if (p && p.net_earnings != null) {
      const ridePrice  = Number(p.ride_price)  || 0;
      const bookingFee = Number(p.booking_fee) || 0;
      dr.netEarnings    += Number(p.net_earnings) || 0;
      dr.grossEarnings  += ridePrice + bookingFee;
      dr.tips           += Number(p.tip)           || 0;
      dr.commission     += Number(p.commission)    || 0;
      dr.bookingFees    += bookingFee;
      dr.tollFees       += Number(p.toll_fee)      || 0;
      dr.cancellationFees += Number(p.cancellation_fee) || 0;
      if (order.payment_method === "cash") dr.cashEarnings += ridePrice;
      if (order.order_finished_timestamp && order.order_accepted_timestamp) {
        dr._rideSeconds = (dr._rideSeconds || 0) +
          (order.order_finished_timestamp - order.order_accepted_timestamp);
      }
      dr.orders++;
    }
    dr.distanceTotal += Number(order.ride_distance) || 0;
    dr._cnt++;
  }

  // 6. Finalise: merge hours + profiles, round all money fields
  const drivers = Object.values(driverMap).map(dr => {
    const secs     = hoursOnlineMap[dr.driverId] || 0;
    dr.hoursOnline = r2(secs / 3600);
    dr.utilization = secs > 0 ? r2((dr._rideSeconds || 0) / secs * 100) : 0;
    dr.finishRate  = dr._cnt > 0 ? r2(dr.orders / dr._cnt * 100) : 0;
    delete dr._rideSeconds;

    const prof = profileMap[dr.driverId];
    if (prof) {
      dr.rating = prof.driver_rating || 0;
      dr.score  = prof.driver_score  || 0;
      if (!dr.name && prof.first_name) dr.name = `${prof.first_name} ${prof.last_name || ""}`.trim();
      dr.boltState            = prof.state || "";
      dr.boltSuspensionReason = prof.suspension_reason || "";
      // Additive (Build-166): capture Bolt's OWN suspension category + exact start date IF the
      // Fleet Integration API exposes them (the new portal shows both; the older API we've been
      // reading only returns state + a generic reason). Harmless when absent → stays "". If a
      // future sync fills these, the Blocks tab uses them instead of keyword-classify / sync-date.
      dr.boltSuspensionCategory = prof.suspension_category || prof.block_category || prof.suspension_type || "";
      dr.boltSuspendedSince     = prof.suspended_since || prof.suspension_started_at || prof.blocked_at || prof.state_changed_at || "";
      dr.hasCashPayment       = prof.has_cash_payment ?? null;
      dr.vehiclePlate         = prof.active_vehicle?.reg_number || "";
    }

    if (dr._cnt > 0) dr.distanceAvg = r2(dr.distanceTotal / dr._cnt);
    dr.netEarnings      = r2(dr.netEarnings);
    dr.grossEarnings    = r2(dr.grossEarnings);
    dr.tips             = r2(dr.tips);
    dr.commission       = r2(dr.commission);
    dr.bookingFees      = r2(dr.bookingFees);
    dr.tollFees         = r2(dr.tollFees);
    dr.cashEarnings     = r2(dr.cashEarnings);
    dr.cancellationFees = r2(dr.cancellationFees);
    dr.distanceTotal    = r2(dr.distanceTotal);
    dr.isActive         = dr.orders > 0 || dr.grossEarnings > 0;
    delete dr._cnt;
    return dr;
  });

  return { allOrders, drivers, startTs, endTs };
}

module.exports = { fetchAndAggregateFleet };
