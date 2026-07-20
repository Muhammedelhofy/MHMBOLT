"use strict";
/**
 * Shared core for mirroring a Bolt fleet roster into a Google Sheet lookup tab.
 *
 * Used by BOTH directions so they can never drift apart:
 *   - sync-barbary.js        : Barbary's fleet  -> OUR onboarding sheet ("Barbary Fleet" tab)
 *   - sync-mhm-to-barbary.js : OUR fleet        -> Barbary's sheet      ("MHM Fleet" tab)
 *
 * Read side : Bolt Fleet API via lib.js `fetchRoster(creds)` (creds omitted = our own fleet).
 * Write side: Google Sheets values API, READ-WRITE scope, full-overwrite of the target tab.
 *
 * Bolt's getDrivers has NO iqama/national-ID field (confirmed live), so the lookup key is
 * PHONE (normalized to the 9-digit local form) + Driver UUID; email is included too.
 *
 * Requires: GOOGLE_SHEETS_CREDENTIALS_JSON (service account — must be EDITOR on the target sheet).
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
 * Pull a fleet's roster and full-overwrite a Google Sheet tab with it.
 * @param {object}  opts
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

module.exports = { syncRosterToTab };
