"use strict";
/**
 * POST /api/bolt/sync-sheet-now  — F5 (BOLT_DATA_INTEGRITY_FINDINGS.md)
 *
 * On-demand version of the nightly sync-sheet cron: same core (`runSheetSync`,
 * exported from ./sync-sheet.js) so the on-demand path can never drift from the
 * cron path — one place computes the sheet → Supabase mirror, two callers.
 *
 * Auth: a SEPARATE secret from CRON_SECRET — `DASH_SYNC_KEY` (Bearer). This is the
 * key Muhammad sets in Vercel himself; it is never printed by any session. If it
 * isn't configured yet, the endpoint returns a clean 400 rather than 401/crash, so
 * shipping this ahead of him setting the var is safe.
 *
 * Rate limit: rejects with 429 if the mirror was refreshed less than 60s ago. The
 * "last refreshed" timestamp is read from the existing `sheet_ambassador_sync`
 * table's own `synced_at` column (every successful sync stamps all rows with the
 * same value) — no new table/column needed.
 *
 * Requires env vars: DASH_SYNC_KEY, GOOGLE_SHEETS_CREDENTIALS_JSON,
 * SUPABASE_URL, SUPABASE_SERVICE_KEY (the last three already required by sync-sheet.js).
 */

const { runSheetSync } = require("./sync-sheet");

const RATE_LIMIT_MS = 60 * 1000;

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function getLastSyncedAt() {
  const url = `${process.env.SUPABASE_URL}/rest/v1/sheet_ambassador_sync?select=synced_at&order=synced_at.desc&limit=1`;
  const resp = await fetch(url, { headers: sbHeaders() });
  if (!resp.ok) throw new Error(`Supabase read: ${resp.status} ${await resp.text()}`);
  const rows = await resp.json();
  return rows[0]?.synced_at ? new Date(rows[0].synced_at) : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  if (!process.env.DASH_SYNC_KEY) {
    return res.status(400).json({ ok: false, error: "DASH_SYNC_KEY not configured — on-demand sync unavailable until it's set in Vercel" });
  }
  const auth = req.headers["authorization"] || "";
  if (auth !== `Bearer ${process.env.DASH_SYNC_KEY}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ ok: false, error: "SUPABASE_URL and SUPABASE_SERVICE_KEY required" });
  }

  try {
    const lastSyncedAt = await getLastSyncedAt();
    if (lastSyncedAt) {
      const elapsedMs = Date.now() - lastSyncedAt.getTime();
      if (elapsedMs < RATE_LIMIT_MS) {
        const retryAfterS = Math.ceil((RATE_LIMIT_MS - elapsedMs) / 1000);
        res.setHeader("Retry-After", String(retryAfterS));
        return res.status(429).json({
          ok: false, error: `Mirror was just refreshed ${Math.floor(elapsedMs / 1000)}s ago — try again in ${retryAfterS}s`,
          retryAfterSeconds: retryAfterS, lastSyncedAt: lastSyncedAt.toISOString(),
        });
      }
    }

    const result = await runSheetSync();
    return res.status(200).json({ ...result, syncedAt: new Date().toISOString() });
  } catch (e) {
    console.error("[sync-sheet-now]", e.message);
    return res.status(e.status || 500).json({ ok: false, error: e.message });
  }
};
