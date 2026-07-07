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
// c1 driver codec is single-sourced in ./codec (shared with the parity-tested inline
// copy in index.html). packEntry stays local — it derives each day's aggregates the
// cron computes itself, whereas the browser's packEntry reads precomputed ones.
const { packDriver, _r2, CLOUD_FMT } = require("./codec");

const SB_ROW_ID = "fleet";

// ── c1 entry helper (packDriver imported above) ───────────────────────────────

const _MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const _MONTH_MAP = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };

// Convert "yyyy-MM-dd" → the period format the dashboard stores/reads ("DD Mon YYYY"),
// identical to runBoltSync() in index.html. The dashboard keys history by this string.
function toDashboardPeriod(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${_MONTHS[m - 1]} ${y}`;
}

// Mirror of index.html periodSortKey for "DD Mon YYYY" so stored history stays newest-first.
function periodSortKey(p) {
  const m = String(p || "").match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return 0;
  return new Date(Number(m[3]), _MONTH_MAP[m[2]] ?? 0, Number(m[1])).getTime();
}

function packEntry(h) {
  const drivers     = h.drivers || [];
  const activeCount = drivers.filter(d => d.isActive).length;
  const totalGross  = drivers.reduce((s, d) => s + (d.grossEarnings || 0), 0);
  const totalNet    = drivers.reduce((s, d) => s + (d.netEarnings   || 0), 0);
  return {
    p:  h.period,
    u:  h.uploadedAt,
    s:  'cron',                 // F1 entry source — this is a full nightly API roster pull
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

async function writeBackup(existingData, date) {
  try {
    const url  = `${process.env.SUPABASE_URL}/rest/v1/fleet_data_backup`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body:   JSON.stringify({ id: SB_ROW_ID, backup_date: date, data: existingData, backed_up_at: new Date().toISOString() }),
    });
    if (!resp.ok) console.warn("[cron-sync] backup write failed:", resp.status, await resp.text());
  } catch (e) { console.warn("[cron-sync] backup failed:", e.message); }
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
  // Cron fires at 21:00 UTC = 00:00 Riyadh. Sync the Riyadh day that just
  // COMPLETED (yesterday) — not the day that just started, which has zero
  // elapsed hours and would store an empty 0-driver/0-order entry.
  const saudiNow   = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const saudiYday  = new Date(saudiNow.getTime() - 86400 * 1000);
  const date       = saudiYday.toISOString().slice(0, 10);

  try {
    const { allOrders, drivers, rosterComplete } = await fetchAndAggregateFleet(date);

    // Write into `khair_history` with the dashboard's "DD Mon YYYY" period — the
    // key + format the dashboard actually reads. (The old `h`/`fmt` keys were
    // never read by the dashboard, so every auto-synced day was invisible.)
    const period   = toDashboardPeriod(date);
    const entry    = packEntry({ period, uploadedAt: now.toISOString(), totalOrders: allOrders.length, drivers });
    const existing = await readFleetData();
    await writeBackup(existing, date);          // snapshot before overwrite
    const history  = Array.isArray(existing.khair_history) ? existing.khair_history : [];
    const idx      = history.findIndex(e => e.p === period);
    // Finding-B guard: this handler REPLACES the stored day for `period` wholesale
    // (unlike the browser's per-driver union-merge). A partial API failure — a
    // company's getDrivers threw and was caught non-fatally in lib → rosterComplete
    // false — yields an INCOMPLETE roster. Letting it replace a LARGER complete day
    // would erode that day until the next cron. So when the pull is known-incomplete
    // AND smaller than what's stored, keep the stored day untouched. A COMPLETE pull
    // (rosterComplete true) stays authoritative and always writes — it may legitimately
    // be smaller when drivers have left the fleet. A later complete run self-heals a
    // day skipped here.
    const existingDc = idx >= 0 ? (Array.isArray(history[idx].d) ? history[idx].d.length : 0) : 0;
    const degraded   = idx >= 0 && !rosterComplete && drivers.length < existingDc;
    if (degraded) {
      // leave history[idx] as-is
    } else if (idx >= 0) {
      history[idx] = entry;
    } else {
      history.unshift(entry);
    }
    history.sort((a, b) => periodSortKey(b.p) - periodSortKey(a.p));

    // Supabase has no 100KB cap → keep the full history, same as the dashboard does.
    await writeFleetData({ ...existing, khair_fmt: CLOUD_FMT, khair_history: history });
    await writeCronLog({ ts: now.toISOString(), ok: true, period, drivers: drivers.length, orders: allOrders.length,
      ...(degraded ? { degraded: true, keptExisting: existingDc } : {}) });

    return res.status(200).json({
      ok: true, date, drivers: drivers.length, orders: allOrders.length, rosterComplete, degraded,
      message: degraded
        ? `Partial roster for ${date} (${drivers.length} drivers) — kept the stored ${existingDc}-driver day; a company roster pull failed`
        : `Fleet synced for ${date} — ${drivers.length} drivers, ${allOrders.length} orders`,
    });
  } catch (e) {
    console.error("[cron-sync]", e.message);
    await writeCronLog({ ts: now.toISOString(), ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
};
