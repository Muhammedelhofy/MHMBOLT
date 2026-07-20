"use strict";
/**
 * GET /api/bolt/sync-mhm-to-barbary
 *
 * The MIRROR of sync-barbary: pushes OUR OWN fleet's Bolt roster into BARBARY's Google
 * Sheet ("MHM Fleet" tab), so Barbary can check "does this driver already exist on MHM's
 * side?" before they onboard — symmetric to the Barbary-Fleet tab in our own sheet.
 *
 * Barbary needs NO infrastructure: our Vercel does the work and writes into their sheet.
 * They only had to share their sheet with our service account as EDITOR.
 *
 * Thin wrapper reusing `syncRosterToTab` exported from sync-barbary.js (kept there, not in a
 * separate module, to stay under Vercel Hobby's 12-Serverless-Function cap). Reads Bolt with
 * OUR OWN creds (BOLT_CLIENT_ID/SECRET — fetchRoster defaults to them); writes the partner's sheet.
 *
 * Auth: Bearer token — CRON_SECRET (scheduled cron) OR BARBARY_SYNC_KEY (manual/dry-run),
 *       same keys as sync-barbary. Add ?dry=1 to fetch + report WITHOUT writing the sheet.
 *
 * Requires env vars: BOLT_CLIENT_ID, BOLT_CLIENT_SECRET (our own fleet — already set),
 *                    GOOGLE_SHEETS_CREDENTIALS_JSON, CRON_SECRET, BARBARY_SYNC_KEY.
 */

const { syncRosterToTab } = require("./sync-barbary");

// Barbary's spreadsheet (they shared it with our service account as Editor).
const PARTNER_SHEET_ID = "1FUA3usy5lbk8ZBnOPXT3p01AqLuKbZB-DFNPDiyDF3c";
const TAB              = "MHM Fleet";

async function runMhmToBarbarySync({ dry } = {}) {
  if (!process.env.BOLT_CLIENT_ID || !process.env.BOLT_CLIENT_SECRET) {
    const err = new Error("BOLT_CLIENT_ID / BOLT_CLIENT_SECRET not configured"); err.status = 503; throw err;
  }
  // No creds passed → fetchRoster uses our own fleet (env BOLT_*).
  return syncRosterToTab({ creds: undefined, spreadsheetId: PARTNER_SHEET_ID, tab: TAB, label: "MHM", dry });
}

// ── Handler (nightly cron — CRON_SECRET auth; ?dry=1 for verification) ──────────
module.exports = async function handler(req, res) {
  const provided = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  const cronOk   = process.env.CRON_SECRET      && provided === process.env.CRON_SECRET;
  const manualOk = process.env.BARBARY_SYNC_KEY && provided === process.env.BARBARY_SYNC_KEY;
  if (!cronOk && !manualOk) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const dry = req.query?.dry === "1" || req.query?.dry === "true";
  try {
    const result = await runMhmToBarbarySync({ dry });
    return res.status(200).json(result);
  } catch (e) {
    console.error("[sync-mhm-to-barbary]", e.message);
    return res.status(e.status || 500).json({ ok: false, error: e.message });
  }
};

module.exports.runMhmToBarbarySync = runMhmToBarbarySync;
