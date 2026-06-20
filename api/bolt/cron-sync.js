"use strict";
/**
 * GET /api/bolt/cron-sync  — Build-104 / Build-106
 * Daily Vercel cron (21:00 UTC = midnight Riyadh UTC+3):
 *   1. Fetches today's fleet data via shared lib (same logic as manual sync)
 *   2. Packs it in c1 format
 *   3. Reads the existing fleet_data row from Supabase
 *   4. Merges today's entry (upsert by date, keep last 60 days)
 *   5. Writes back + logs last_cron result
 *
 * Requires env vars on this Vercel project:
 *   BOLT_CLIENT_ID, BOLT_CLIENT_SECRET
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   CRON_SECRET  (Vercel sends this automatically on cron invocations)
 */

const { fetchAndAggregateFleet } = require("./lib");

const SB_ROW_ID = "fleet";

// ── c1 pack helpers (mirrors index.html packDriver/packEntry) ─────────────────
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
  const drivers     = h.drivers || [];
  const activeCount = drivers.filter(d => d.isActive).length;
  const totalGross  = drivers.reduce((s, d) => s + (d.grossEarnings || 0), 0);
  const totalNet    = drivers.reduce((s, d) => s + (d.netEarnings   || 0), 0);
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

// ── Supabase REST helpers ─────────────────────────────────────────────────────
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function readFleetData() {
  const url  = `${process.env.SUPABASE_URL}/rest/v1/fleet_data?id=eq.${SB_ROW_ID}&select=data`;
  const resp = await fetch(url, { headers: sbHeaders() });
  if (!resp.ok) throw new Error(`Supabase read: ${resp.status} ${await resp.text()}`);
  const rows = await resp.json();
  return (Array.isArray(rows) && rows[0]) ? (rows[0].data || {}) : {};
}

async function writeFleetData(record) {
  const url  = `${process.env.SUPABASE_URL}/rest/v1/fleet_data`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body:   JSON.stringify({ id: SB_ROW_ID, data: record, updated_at: new Date().toISOString() }),
  });
  if (!resp.ok) throw new Error(`Supabase write: ${resp.status} ${await resp.text()}`);
}

async function writeCronLog(entry) {
  try {
    const existing = await readFleetData();
    await writeFleetData({ ...existing, last_cron: entry });
  } catch (_) { /* best-effort — don't mask the original error */ }
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  const auth = req.headers["authorization"] || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (!process.env.BOLT_CLIENT_ID || !process.env.BOLT_CLIENT_SECRET) {
    return res.status(503).json({ ok: false, error: "Bolt credentials not configured" });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ ok: false, error: "SUPABASE_URL and SUPABASE_SERVICE_KEY required" });
  }

  const now      = new Date();
  const saudiNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const date     = saudiNow.toISOString().slice(0, 10);

  try {
    const { allOrders, drivers } = await fetchAndAggregateFleet(date);

    const entry   = packEntry({ period: date, uploadedAt: now.toISOString(), totalOrders: allOrders.length, drivers });
    const existing = await readFleetData();
    const history  = Array.isArray(existing.h) ? existing.h : [];
    const idx      = history.findIndex(e => e.p === date);
    if (idx >= 0) history[idx] = entry; else history.unshift(entry);
    history.sort((a, b) => (b.p > a.p ? 1 : b.p < a.p ? -1 : 0));

    await writeFleetData({ ...existing, fmt: "c1", h: history.slice(0, 60) });
    await writeCronLog({ ts: now.toISOString(), ok: true, drivers: drivers.length, orders: allOrders.length });

    return res.status(200).json({
      ok: true, date, drivers: drivers.length, orders: allOrders.length,
      message: `Fleet synced for ${date} — ${drivers.length} drivers, ${allOrders.length} orders`,
    });
  } catch (e) {
    console.error("[cron-sync]", e.message);
    await writeCronLog({ ts: now.toISOString(), ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
};
