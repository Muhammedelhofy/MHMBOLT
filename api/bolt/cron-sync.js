"use strict";
/**
 * GET /api/bolt/cron-sync  — Build-104
 * Daily Vercel cron (21:00 UTC = midnight Riyadh UTC+3):
 *   1. Fetches today's fleet data from the Bolt API
 *   2. Packs it in c1 format (mirrors dashboard packDriver/packEntry)
 *   3. Reads the existing fleet_data row from Supabase
 *   4. Merges today's entry (upsert by date, keep last 60 days)
 *   5. Writes back — so M8 always has today's data without a manual sync
 *
 * Requires env vars on the dashboard Vercel project:
 *   BOLT_CLIENT_ID, BOLT_CLIENT_SECRET  (already set for manual sync)
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY  (add these — same values as M8)
 *   CRON_SECRET                          (optional but recommended)
 */

const SB_ROW_ID = "fleet";

// ── Bolt OAuth + API (same pattern as sync.js) ──────────────────────────────
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
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Bolt token error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 30) * 1000;
  return cachedToken;
}

async function boltAPI(method, path, payload) {
  const token = await getBoltToken();
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  };
  if (payload) opts.body = JSON.stringify(payload);
  const resp = await fetch(`https://node.bolt.eu/fleet-integration-gateway${path}`, opts);
  if (!resp.ok) throw new Error(`Bolt API ${path}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function paginateAll(path, body, listKey, totalKey) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  let total = Infinity;
  while (all.length < total) {
    const resp  = await boltAPI("POST", path, { ...body, offset, limit });
    const items = resp.data?.[listKey] ?? [];
    total       = Number(resp.data?.[totalKey] ?? 0);
    for (const i of items) all.push(i);
    if (items.length < limit) break;
    offset += items.length;
  }
  return all;
}

// ── c1 pack helpers (ported from index.html packDriver/packEntry) ────────────
const _r2 = v => Math.round((v || 0) * 100) / 100;

function packDriver(d) {
  const o = {};
  const putS = (k, v) => { if (v) o[k] = v; };
  const putN = (k, v) => { const r = _r2(v); if (r) o[k] = r; };
  putS("n", d.name); putS("i", d.driverId); putS("ph", d.phone);
  putN("o", d.orders); putN("h", d.hoursOnline);
  putN("ne", d.netEarnings); putN("ge", d.grossEarnings);
  putN("ra", d.rating); putN("sc", d.score);
  putN("dt", d.distanceTotal); putN("da", d.distanceAvg);
  putN("tp", d.tips); putN("co", d.commission);
  putN("ut", d.utilization); putN("fr", d.finishRate);
  putN("ce", d.cashEarnings); putN("cf", d.cancellationFees);
  putN("tf", d.tollFees); putN("bf", d.bookingFees);
  putS("bs", d.boltState); putS("bsr", d.boltSuspensionReason);
  putS("vp", d.vehiclePlate);
  if (d.hasCashPayment != null) o.hcp = d.hasCashPayment ? 1 : 0;
  if (d.isActive) o.a = 1;
  return o;
}

function packEntry(h) {
  const drivers = (h.drivers || []);
  const activeCount  = drivers.filter(d => d.isActive).length;
  const totalGross   = drivers.reduce((s, d) => s + (d.grossEarnings || 0), 0);
  const totalNet     = drivers.reduce((s, d) => s + (d.netEarnings   || 0), 0);
  return {
    p:  h.period,
    u:  h.uploadedAt,
    dc: drivers.length,
    ac: activeCount,
    to: h.totalOrders || 0,
    tg: _r2(totalGross),
    tn: _r2(totalNet),
    d:  drivers.map(packDriver),
  };
}

// ── Supabase REST helpers (native fetch — no SDK needed) ─────────────────────
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return {
    apikey:        key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function readFleetData() {
  const url = `${process.env.SUPABASE_URL}/rest/v1/fleet_data?id=eq.${SB_ROW_ID}&select=data`;
  const resp = await fetch(url, { headers: sbHeaders() });
  if (!resp.ok) throw new Error(`Supabase read: ${resp.status} ${await resp.text()}`);
  const rows = await resp.json();
  return (Array.isArray(rows) && rows[0]) ? (rows[0].data || {}) : {};
}

async function writeFleetData(record) {
  const url  = `${process.env.SUPABASE_URL}/rest/v1/fleet_data`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      ...sbHeaders(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ id: SB_ROW_ID, data: record, updated_at: new Date().toISOString() }),
  });
  if (!resp.ok) throw new Error(`Supabase write: ${resp.status} ${await resp.text()}`);
}

// ── Supabase: write last_cron result ─────────────────────────────────────────
async function writeCronLog(entry) {
  try {
    const existing = await readFleetData();
    await writeFleetData({ ...existing, last_cron: entry });
  } catch (_) { /* best-effort — don't mask the original error */ }
}

// ── Handler ──────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CRON_SECRET is required — set it in Vercel env vars.
  // Vercel automatically sends it as Bearer <CRON_SECRET> on all cron invocations.
  const auth = (req.headers["authorization"] || "");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  if (!process.env.BOLT_CLIENT_ID || !process.env.BOLT_CLIENT_SECRET) {
    return res.status(503).json({ ok: false, error: "Bolt credentials not configured" });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ ok: false, error: "SUPABASE_URL and SUPABASE_SERVICE_KEY required" });
  }

  // Today's date in Saudi time (UTC+3)
  const now       = new Date();
  const saudiNow  = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const date      = saudiNow.toISOString().slice(0, 10);

  try {
    // 1. Bolt API fetch (same logic as sync.js)
    const d        = new Date(date + "T00:00:00+03:00");
    const startTs  = Math.floor(d.getTime() / 1000);
    const endTs    = startTs + 86400;

    const compResp   = await boltAPI("GET", "/fleetIntegration/v1/getCompanies");
    const companyIds = compResp.data?.company_ids ?? [];
    if (!companyIds.length) throw new Error("getCompanies returned no company IDs");

    const allOrders = await paginateAll(
      "/fleetIntegration/v1/getFleetOrders",
      { company_ids: companyIds, start_ts: startTs, end_ts: endTs, time_range_filter_type: "price_review" },
      "orders", "total_orders"
    );

    // Hours online per driver
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
      } catch (_) {}
    }

    // Aggregate per driver
    const driverMap = {};
    for (const order of allOrders) {
      const uuid = order.driver_uuid;
      if (!driverMap[uuid]) {
        driverMap[uuid] = {
          name: "", driverId: uuid, phone: "",
          orders: 0, hoursOnline: 0, rating: 0, score: 0,
          netEarnings: 0, grossEarnings: 0, tips: 0,
          commission: 0, bookingFees: 0, tollFees: 0,
          cancellationFees: 0, cashEarnings: 0,
          distanceTotal: 0, distanceAvg: 0,
          utilization: 0, finishRate: 0, isActive: false, _cnt: 0,
        };
      }
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

    const r2 = v => Math.round((v || 0) * 100) / 100;
    const drivers = Object.values(driverMap).map(dr => {
      const secs     = hoursOnlineMap[dr.driverId] || 0;
      dr.hoursOnline = r2(secs / 3600);
      dr.utilization = secs > 0 ? r2((dr._rideSeconds || 0) / secs * 100) : 0;
      dr.finishRate  = dr._cnt > 0 ? r2(dr.orders / dr._cnt * 100) : 0;
      delete dr._rideSeconds;
      dr.netEarnings    = r2(dr.netEarnings);
      dr.grossEarnings  = r2(dr.grossEarnings);
      dr.tips           = r2(dr.tips);
      dr.commission     = r2(dr.commission);
      dr.bookingFees    = r2(dr.bookingFees);
      dr.tollFees       = r2(dr.tollFees);
      dr.cashEarnings   = r2(dr.cashEarnings);
      dr.cancellationFees = r2(dr.cancellationFees);
      dr.distanceTotal  = r2(dr.distanceTotal);
      if (dr._cnt > 0) dr.distanceAvg = r2(dr.distanceTotal / dr._cnt);
      dr.isActive = dr.orders > 0 || dr.grossEarnings > 0;
      delete dr._cnt;
      return dr;
    });

    // 2. Pack in c1 format
    const entry = packEntry({ period: date, uploadedAt: now.toISOString(), totalOrders: allOrders.length, drivers });

    // 3. Read + merge + write
    const existing = await readFleetData();
    const history  = Array.isArray(existing.h) ? existing.h : [];
    const idx      = history.findIndex(e => e.p === date);
    if (idx >= 0) history[idx] = entry;
    else history.unshift(entry);
    history.sort((a, b) => (b.p > a.p ? 1 : b.p < a.p ? -1 : 0));
    const trimmed = history.slice(0, 60);

    await writeFleetData({ ...existing, fmt: "c1", h: trimmed });

    await writeCronLog({ ts: now.toISOString(), ok: true, drivers: drivers.length, orders: allOrders.length });

    return res.status(200).json({
      ok: true, date, drivers: drivers.length, orders: allOrders.length,
      message: `Fleet synced for ${date} — ${drivers.length} drivers, ${allOrders.length} orders`,
    });
  } catch (e) {
    console.error("[cron-sync]", e.message);
    await writeCronLog({ ts: new Date().toISOString(), ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
};
