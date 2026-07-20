"use strict";
/**
 * Shared Bolt Fleet API helpers used by sync.js and cron-sync.js.
 * Single source of truth — fixes here apply to both manual and auto sync.
 */

// Token cache keyed by client_id so multiple fleets (your own + Barbary) each keep
// their own cached token instead of clobbering a single shared one. Callers that pass
// no creds fall back to the env BOLT_CLIENT_ID/SECRET — i.e. existing behaviour is
// byte-for-byte unchanged; the second-fleet path is purely additive.
const tokenCache = new Map(); // client_id -> { token, expiry }

function resolveCreds(creds) {
  return {
    clientId:     creds?.clientId     || process.env.BOLT_CLIENT_ID,
    clientSecret: creds?.clientSecret || process.env.BOLT_CLIENT_SECRET,
  };
}

async function getBoltToken(creds) {
  const { clientId, clientSecret } = resolveCreds(creds);
  if (!clientId || !clientSecret) throw new Error("Bolt credentials missing (clientId/clientSecret)");
  const cached = tokenCache.get(clientId);
  if (cached && Date.now() < cached.expiry) return cached.token;
  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    grant_type:    "client_credentials",
    scope:         "fleet-integration:api",
  });
  const resp = await fetch("https://oidc.bolt.eu/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });
  if (!resp.ok) throw new Error(`Bolt token error: ${resp.status} ${await resp.text()}`);
  const data  = await resp.json();
  const token = data.access_token;
  tokenCache.set(clientId, { token, expiry: Date.now() + (data.expires_in - 30) * 1000 });
  return token;
}

async function boltAPI(method, path, payload, creds) {
  const token = await getBoltToken(creds);
  const opts  = { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
  if (payload) opts.body = JSON.stringify(payload);
  const resp = await fetch(`https://node.bolt.eu/fleet-integration-gateway${path}`, opts);
  if (!resp.ok) throw new Error(`Bolt API ${path}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// F7/m1: loop on all.length < total (not items.length < limit) — a page smaller than
// requested no longer ends the pull early; a page count guard bounds worst-case requests
// if the API ever misreports its total.
const PAGINATE_MAX_PAGES = 200;

async function paginateAll(path, body, listKey, totalKey, creds) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  let total = Infinity; // unknown until the first response tells us
  for (let page = 0; page < PAGINATE_MAX_PAGES; page++) {
    const resp  = await boltAPI("POST", path, { ...body, offset, limit }, creds);
    const items = resp.data?.[listKey] ?? [];
    total       = Number(resp.data?.[totalKey] ?? 0) || 0;
    for (const i of items) all.push(i);
    offset += items.length;
    if (items.length === 0 || all.length >= total) break;
  }
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
  // The roster is seeded from these getDrivers pulls, so a company whose pull throws
  // (caught here, non-fatal) drops that company's non-ordering drivers → an INCOMPLETE
  // roster. `profileErrors` counts those failures so the caller can tell an authoritative
  // full pull from a degraded one and avoid overwriting a complete stored day with it.
  const profileMap = {};
  let profileErrors = 0;
  for (const cid of companyIds) {
    try {
      const drivers = await paginateAll(
        "/fleetIntegration/v1/getDrivers",
        { company_id: cid, start_ts: startTs, end_ts: endTs },
        "drivers", "total"
      );
      for (const dr of drivers) profileMap[dr.driver_uuid] = dr;
    } catch (e) { profileErrors++; console.warn(`[bolt-lib] profiles company ${cid}:`, e.message); }
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
      // Build-167: the API exposes suspension on the VEHICLE too — a driver can look "active"
      // while their car is blocked. Capture the vehicle's own state + reason so those surface.
      dr.vehicleState            = prof.active_vehicle?.state || "";
      dr.vehicleSuspensionReason = prof.active_vehicle?.suspension_reason || "";
      // Category enablement ("N/M"): the API gives active + inactive category NAME arrays.
      // (The CSV path already fills activeCategories from its own column — only set from the
      // API when it isn't already populated, so we don't clobber a CSV value.)
      if (Array.isArray(prof.active_categories) && prof.active_categories.length)
        dr.activeCategories = prof.active_categories.join(", ");
      dr.inactiveCategories = Array.isArray(prof.inactive_categories) ? prof.inactive_categories.join(", ") : "";
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

  // rosterComplete: true only when EVERY company's getDrivers pull succeeded, i.e. the
  // roster is authoritative and may legitimately be smaller than a prior day (drivers
  // left the fleet). false → a partial-failure pull the cron must not let clobber a
  // larger complete day (audit Finding B).
  return { allOrders, drivers, startTs, endTs, rosterComplete: profileErrors === 0, profileErrors, companyCount: companyIds.length };
}

/**
 * Roster-only pull for a SECOND fleet (e.g. Barbary) using its own credentials.
 * Returns the raw getDrivers profile objects across every company on that account —
 * no orders/earnings aggregation (this feeds the onboarding sheet's lookup tab, which
 * only needs identity: name, email, phone, uuid, state, categories, vehicle).
 *
 * `creds` = { clientId, clientSecret }. Fully paginates, so a fleet with >1000 drivers
 * comes back complete (the probe only saw page 1). De-dupes on driver_uuid across
 * companies. `rosterComplete` is false if any company's pull threw, so the caller can
 * refuse to overwrite a good tab with a partial roster.
 */
async function fetchRoster(creds) {
  const compResp   = await boltAPI("GET", "/fleetIntegration/v1/getCompanies", null, creds);
  const companyIds = compResp.data?.company_ids ?? [];
  if (!companyIds.length) throw new Error("getCompanies returned no company IDs for these credentials");

  const now     = Math.floor(Date.now() / 1000);
  const startTs = now - 30 * 86400; // window; getDrivers returns the full registered roster regardless
  const seen    = new Set();
  const drivers = [];
  let companyErrors = 0;

  for (const cid of companyIds) {
    try {
      const list = await paginateAll(
        "/fleetIntegration/v1/getDrivers",
        { company_id: cid, start_ts: startTs, end_ts: now },
        "drivers", "total", creds
      );
      for (const dr of list) {
        const key = dr.driver_uuid || `${dr.first_name}|${dr.last_name}|${dr.phone}`;
        if (seen.has(key)) continue;
        seen.add(key);
        drivers.push(dr);
      }
    } catch (e) {
      companyErrors++;
      console.warn(`[bolt-lib] roster company ${cid}:`, e.message);
    }
  }
  return { drivers, companyIds, companyErrors, rosterComplete: companyErrors === 0 };
}

module.exports = { fetchAndAggregateFleet, fetchRoster };
