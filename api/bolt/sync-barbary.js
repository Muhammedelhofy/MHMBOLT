"use strict";
/**
 * GET /api/bolt/sync-barbary
 *
 * Mirrors the BARBARY fleet's Bolt roster into OUR onboarding sheet's "Barbary Fleet"
 * lookup tab, so the "does this driver already exist?" check runs against a fresh daily
 * list instead of a manual paste from the Barbary dashboard.
 *
 * This file ALSO owns the shared `syncRosterToTab` core (Google write + field mapping +
 * guards) and exports it, so sync-mhm-to-barbary.js can reuse it WITHOUT adding a separate
 * module file — Vercel Hobby caps a deployment at 12 Serverless Functions and every .js in
 * api/ counts, so we keep the shared logic here (same pattern sync-sheet-now.js uses with
 * sync-sheet.js) rather than in a 13th file.
 *
 * Read side : Bolt Fleet API via lib.js `fetchRoster(creds)` (creds omitted = our own fleet).
 * Write side: Google Sheets values API, READ-WRITE scope, full-overwrite of the target tab.
 * Bolt's getDrivers has NO iqama field (confirmed live) → lookup key is phone + UUID; email included.
 *
 * Auth: Bearer token — CRON_SECRET (scheduled cron) OR BARBARY_SYNC_KEY (manual/dry-run,
 *       because CRON_SECRET can't be read back once saved). ?dry=1 fetches + reports, no write.
 *
 * Requires env vars: BARBARY_CLIENT_ID, BARBARY_CLIENT_SECRET, GOOGLE_SHEETS_CREDENTIALS_JSON,
 *                    CRON_SECRET, BARBARY_SYNC_KEY.
 */

const crypto = require("crypto");
const { fetchRoster } = require("./lib");

const HEADER = ["Driver", "Status", "Active categories", "Email", "Phone", "Driver ID", "Last synced"];

// ── Google service-account auth (JWT Bearer grant) — WRITE scope ────────────────
let cachedGoogleToken = null;
let googleTokenExpiry = 0;

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGoogleSheetsToken() {
  if (cachedGoogleToken && Date.now() < googleTokenExpiry) return cachedGoogleToken;

  const raw = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
  if (!raw) throw new Error("GOOGLE_SHEETS_CREDENTIALS_JSON not configured");
  const creds = JSON.parse(raw);

  const now    = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss:   creds.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets", // read-WRITE
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  }));
  const unsigned  = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), creds.private_key)
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${unsigned}.${signature}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }).toString(),
  });
  if (!resp.ok) throw new Error(`Google token error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  cachedGoogleToken = data.access_token;
  googleTokenExpiry = Date.now() + (data.expires_in - 30) * 1000;
  return cachedGoogleToken;
}

async function clearRange(spreadsheetId, range) {
  const token = await getGoogleSheetsToken();
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`;
  const resp  = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheets clear ${range}: ${resp.status} ${await resp.text()}`);
}

async function writeRange(spreadsheetId, range, values) {
  const token = await getGoogleSheetsToken();
  // RAW so "3/3" stays literal text (USER_ENTERED would mangle it into a date, e.g. "3-Mar").
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const resp  = await fetch(url, {
    method:  "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ values }),
  });
  if (!resp.ok) throw new Error(`Sheets write ${range}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// ── Field mapping (Bolt getDrivers → sheet row) ────────────────────────────────
// Normalize KSA phone to the 9-digit local form the tabs use: "+966593136757" → "593136757".
function normalizePhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("966")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  return d;
}
function titleState(s) {
  const v = String(s || "").trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : "";
}
// "3/3" = active categories / (active + inactive) — the count style the dashboard shows.
function categoriesCount(dr) {
  const a = Array.isArray(dr.active_categories)   ? dr.active_categories.length   : 0;
  const i = Array.isArray(dr.inactive_categories) ? dr.inactive_categories.length : 0;
  const total = a + i;
  return total ? `${a}/${total}` : "";
}
function driverName(dr) {
  return `${dr.first_name || ""} ${dr.last_name || ""}`.trim();
}
function toRow(dr, syncedAt) {
  return [
    driverName(dr),
    titleState(dr.state),
    categoriesCount(dr),
    dr.email || "",
    normalizePhone(dr.phone),
    dr.driver_uuid || "",
    syncedAt,
  ];
}

/**
 * SHARED core (exported): pull a fleet's roster and full-overwrite a Google Sheet tab.
 * @param {object=} opts.creds          Bolt { clientId, clientSecret }; omit to use OUR own fleet (env BOLT_*).
 * @param {string}  opts.spreadsheetId  Google spreadsheet ID to write into.
 * @param {string}  opts.tab            Exact tab name (may contain spaces).
 * @param {string}  opts.label          Human label for messages, e.g. "Barbary" / "MHM".
 * @param {boolean=} opts.dry           If true, fetch + report but DON'T write the sheet.
 */
async function syncRosterToTab({ creds, spreadsheetId, tab, label, dry } = {}) {
  if (!process.env.GOOGLE_SHEETS_CREDENTIALS_JSON) {
    const err = new Error("GOOGLE_SHEETS_CREDENTIALS_JSON not configured"); err.status = 503; throw err;
  }
  if (!spreadsheetId || !tab) {
    const err = new Error("spreadsheetId and tab are required"); err.status = 500; throw err;
  }

  const { drivers, companyIds, rosterComplete, companyErrors, apiTotal } = await fetchRoster(creds);

  // Never overwrite a good tab with an empty or partial roster.
  if (!drivers.length) {
    const err = new Error(`${label} roster came back empty — refusing to overwrite the tab`); err.status = 502; throw err;
  }
  if (!rosterComplete) {
    const err = new Error(`${label} roster partial (${companyErrors} company pull(s) failed) — refusing to overwrite the tab`); err.status = 502; throw err;
  }

  const syncedAt = new Date().toLocaleString("en-GB", { timeZone: "Asia/Riyadh", hour12: false });
  const rows = drivers.map(d => toRow(d, syncedAt)).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const sample = rows.slice(0, 3);
  const Q = `'${tab}'`; // quoted for A1 notation (tab names may contain spaces)

  if (dry) {
    return {
      ok: true, dryRun: true, companies: companyIds.length, drivers: rows.length, apiTotalReported: apiTotal, sample,
      message: `DRY RUN — fetched ${rows.length} ${label} drivers; sheet NOT written`,
    };
  }

  await clearRange(spreadsheetId, `${Q}!A:H`);
  await writeRange(spreadsheetId, `${Q}!A1`, [HEADER, ...rows]);
  return {
    ok: true, dryRun: false, companies: companyIds.length, drivers: rows.length, apiTotalReported: apiTotal, sample, syncedAt,
    message: `Wrote ${rows.length} ${label} drivers to "${tab}"`,
  };
}

// ── Barbary-specific wrapper ────────────────────────────────────────────────────
const BARBARY_SPREADSHEET_ID = "17-GCTaqEiCvCrcCrDvBm9DcCtljPcAJ3RpJTBkAJs0s"; // our onboarding sheet
const BARBARY_TAB            = "Barbary Fleet";

async function runBarbarySync({ dry } = {}) {
  if (!process.env.BARBARY_CLIENT_ID || !process.env.BARBARY_CLIENT_SECRET) {
    const err = new Error("BARBARY_CLIENT_ID / BARBARY_CLIENT_SECRET not configured"); err.status = 503; throw err;
  }
  const creds = { clientId: process.env.BARBARY_CLIENT_ID, clientSecret: process.env.BARBARY_CLIENT_SECRET };
  return syncRosterToTab({ creds, spreadsheetId: BARBARY_SPREADSHEET_ID, tab: BARBARY_TAB, label: "Barbary", dry });
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

module.exports.runBarbarySync   = runBarbarySync;
module.exports.syncRosterToTab  = syncRosterToTab; // reused by sync-mhm-to-barbary.js
