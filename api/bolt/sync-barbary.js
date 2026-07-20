"use strict";
/**
 * GET /api/bolt/sync-barbary
 *
 * Mirrors the BARBARY fleet's Bolt roster into OUR onboarding sheet's "Barbary Fleet"
 * lookup tab, so the "does this driver already exist?" check runs against a fresh daily
 * list instead of a manual paste from the Barbary dashboard.
 *
 * Thin wrapper over roster-sheet-core.js (shared with sync-mhm-to-barbary.js so the two
 * mirror directions can't drift). Reads Bolt with the SECOND credential set
 * (BARBARY_CLIENT_ID/SECRET); writes with the service account (must be EDITOR on the sheet).
 *
 * Auth: Bearer token — accepts EITHER
 *   - CRON_SECRET      (Vercel sends this automatically on the scheduled cron), OR
 *   - BARBARY_SYNC_KEY (a value YOU set in Vercel yourself, for manual/dry-run triggers —
 *                       CRON_SECRET can't be read back once saved).
 * Add ?dry=1 to fetch + report WITHOUT writing the sheet (safe verification).
 *
 * Requires env vars: BARBARY_CLIENT_ID, BARBARY_CLIENT_SECRET, GOOGLE_SHEETS_CREDENTIALS_JSON,
 *                    CRON_SECRET (cron), BARBARY_SYNC_KEY (manual triggers).
 */

const { syncRosterToTab } = require("./roster-sheet-core");

const SPREADSHEET_ID = "17-GCTaqEiCvCrcCrDvBm9DcCtljPcAJ3RpJTBkAJs0s"; // our onboarding sheet
const TAB            = "Barbary Fleet";

async function runBarbarySync({ dry } = {}) {
  if (!process.env.BARBARY_CLIENT_ID || !process.env.BARBARY_CLIENT_SECRET) {
    const err = new Error("BARBARY_CLIENT_ID / BARBARY_CLIENT_SECRET not configured"); err.status = 503; throw err;
  }
  const creds = { clientId: process.env.BARBARY_CLIENT_ID, clientSecret: process.env.BARBARY_CLIENT_SECRET };
  return syncRosterToTab({ creds, spreadsheetId: SPREADSHEET_ID, tab: TAB, label: "Barbary", dry });
}

// ── Handler (nightly cron — CRON_SECRET auth; ?dry=1 for verification) ──────────
module.exports = async function handler(req, res) {
  const provided = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  const cronOk   = process.env.CRON_SECRET      && provided === process.env.CRON_SECRET;      // the daily cron
  const manualOk = process.env.BARBARY_SYNC_KEY && provided === process.env.BARBARY_SYNC_KEY; // your manual trigger
  if (!cronOk && !manualOk) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const dry = req.query?.dry === "1" || req.query?.dry === "true";
  try {
    const result = await runBarbarySync({ dry });
    return res.status(200).json(result);
  } catch (e) {
    console.error("[sync-barbary]", e.message);
    return res.status(e.status || 500).json({ ok: false, error: e.message });
  }
};

module.exports.runBarbarySync = runBarbarySync;
