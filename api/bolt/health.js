"use strict";
/**
 * GET /api/bolt/health
 * Tests live connectivity to Bolt API + Supabase.
 * Returns last cron run result from fleet_data.last_cron.
 * Used by the dashboard System Status card.
 */

const TIMEOUT_MS = 8000;

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function withTimeout(promise, ms) {
  let tid;
  const timer = new Promise((_, rej) => { tid = setTimeout(() => rej(new Error("timeout")), ms); });
  try { return await Promise.race([promise, timer]); }
  finally { clearTimeout(tid); }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const result = { ok: false, bolt: null, supabase: null, lastCron: null };

  // ── 1. Bolt API ──────────────────────────────────────────────────────────
  if (!process.env.BOLT_CLIENT_ID || !process.env.BOLT_CLIENT_SECRET) {
    result.bolt = { ok: false, error: "BOLT_CLIENT_ID / BOLT_CLIENT_SECRET not set in Vercel env vars" };
  } else {
    try {
      const body = new URLSearchParams({
        client_id:     process.env.BOLT_CLIENT_ID,
        client_secret: process.env.BOLT_CLIENT_SECRET,
        grant_type:    "client_credentials",
        scope:         "fleet-integration:api",
      });
      const resp = await withTimeout(
        fetch("https://oidc.bolt.eu/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        }),
        TIMEOUT_MS
      );
      if (resp.ok) {
        result.bolt = { ok: true };
      } else {
        const text = await resp.text().catch(() => "");
        result.bolt = { ok: false, error: `${resp.status} — ${text.slice(0, 120)}` };
      }
    } catch (e) {
      result.bolt = { ok: false, error: e.message };
    }
  }

  // ── 2. Supabase + last_cron ───────────────────────────────────────────────
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    result.supabase = { ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_KEY not set in Vercel env vars" };
  } else {
    try {
      const url  = `${process.env.SUPABASE_URL}/rest/v1/fleet_data?id=eq.fleet&select=data`;
      const resp = await withTimeout(fetch(url, { headers: sbHeaders() }), TIMEOUT_MS);
      if (resp.ok) {
        result.supabase = { ok: true };
        const rows = await resp.json();
        const data = rows[0]?.data;
        if (data?.last_cron) result.lastCron = data.last_cron;
      } else {
        const text = await resp.text().catch(() => "");
        result.supabase = { ok: false, error: `${resp.status} — ${text.slice(0, 120)}` };
      }
    } catch (e) {
      result.supabase = { ok: false, error: e.message };
    }
  }

  result.ok = !!(result.bolt?.ok && result.supabase?.ok);
  res.status(result.ok ? 200 : 503).json(result);
};
