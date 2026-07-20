"use strict";
/**
 * GET /api/bolt/sync-barbary
 *
 * Mirrors the BARBARY fleet's Bolt roster into the onboarding sheet's "Barbary Fleet"
 * lookup tab, so the "does this driver already exist?" check runs against a fresh daily
 * list instead of a manual paste from the Barbary dashboard.
 *
 * Read side : Bolt Fleet API with a SECOND credential set (BARBARY_CLIENT_ID/SECRET),
 *             via lib.js `fetchRoster` (parameterized auth — your OWN fleet sync is untouched).
 * Write side: Google Sheets values API with READ-WRITE scope. Full overwrite of the tab
 *             each run — it is a pure lookup mirror that nobody edits by hand.
 *
 * The Barbary Bolt API does NOT expose iqama/national ID (confirmed via a live roster
 * probe), so the lookup key is PHONE (normalized to the 9-digit local form the sheet uses)
 * plus the Driver UUID as a hard unique key. Email is included (the API does return it).
 *
 * Auth: Bearer token — accepts EITHER
 *   - CRON_SECRET      (Vercel sends this automatically on the scheduled cron), OR
 *   - BARBARY_SYNC_KEY (a value YOU set in Vercel and choose yourself, for manual/dry-run
 *                       triggers — CRON_SECRET can't be read back once saved, so this gives
 *                       you a key you already know).
 * Add ?dry=1 to fetch + report WITHOUT writing the sheet (safe verification).
 *
 * Requires env vars on this Vercel project:
 *   BARBARY_CLIENT_ID, BARBARY_CLIENT_SECRET   (the second fleet's Bolt API creds)
 *   GOOGLE_SHEETS_CREDENTIALS_JSON              (service account — must be EDITOR on the sheet)
 *   CRON_SECRET       (already set — used by the daily cron)
 *   BARBARY_SYNC_KEY  (you set this — used for manual triggers like the dry-run)
 */

const crypto = require("crypto");
const { fetchRoster } = require("./lib");

const SPREADSHEET_ID = "17-GCTaqEiCvCrcCrDvBm9DcCtljPcAJ3RpJTBkAJs0s";
const TAB           = "Barbary Fleet";
const Q             = `'${TAB}'`;        // quoted sheet name for A1 notation (has a space)
const CLEAR_RANGE   = `${Q}!A:H`;        // wipe old values (incl. any spare column) before rewrite
const WRITE_ANCHOR  = `${Q}!A1`;         // header + rows written anchored here
const HEADER        = ["Driver", "Status", "Active categories", "Email", "Phone", "Driver ID", "Last synced"];

// ── Google service-account auth (JWT Bearer grant) — WRITE scope ────────────────
// Same pattern as sync-sheet.js, but scope is read-WRITE (that endpoint only reads).
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

async function clearRange(range) {
  const token = await getGoogleSheetsToken();
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:clear`;
  const resp  = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheets clear ${range}: ${resp.status} ${await resp.text()}`);
}

async function writeRange(range, values) {
  const token = await getGoogleSheetsToken();
  // RAW so "3/3" stays literal text (USER_ENTERED would mangle it into a date, e.g. "3-Mar").
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const resp  = await fetch(url, {
    method:  "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ values }),
  });
  if (!resp.ok) throw new Error(`Sheets write ${range}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// ── Field mapping (Bolt getDrivers → sheet row) ────────────────────────────────
// Normalize KSA phone to the 9-digit local form the tab uses: "+966593136757" → "593136757".
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

// ── Core (shared by the cron handler and the ?dry=1 verification path) ──────────
async function runBarbarySync({ dry } = {}) {
  if (!process.env.BARBARY_CLIENT_ID || !process.env.BARBARY_CLIENT_SECRET) {
    const err = new Error("BARBARY_CLIENT_ID / BARBARY_CLIENT_SECRET not configured"); err.status = 503; throw err;
  }
  if (!process.env.GOOGLE_SHEETS_CREDENTIALS_JSON) {
    const err = new Error("GOOGLE_SHEETS_CREDENTIALS_JSON not configured"); err.status = 503; throw err;
  }

  const creds = { clientId: process.env.BARBARY_CLIENT_ID, clientSecret: process.env.BARBARY_CLIENT_SECRET };
  const { drivers, companyIds, rosterComplete, companyErrors, apiTotal } = await fetchRoster(creds);

  // Never overwrite a good tab with an empty or partial roster (mirrors sync-sheet's guard).
  if (!drivers.length) {
    const err = new Error("Barbary roster came back empty — refusing to overwrite the tab"); err.status = 502; throw err;
  }
  if (!rosterComplete) {
    const err = new Error(`Barbary roster partial (${companyErrors} company pull(s) failed) — refusing to overwrite the tab`); err.status = 502; throw err;
  }

  const syncedAt = new Date().toLocaleString("en-GB", { timeZone: "Asia/Riyadh", hour12: false });
  const rows = drivers.map(d => toRow(d, syncedAt)).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const sample = rows.slice(0, 3);

  if (dry) {
    return {
      ok: true, dryRun: true, companies: companyIds.length, drivers: rows.length, apiTotalReported: apiTotal, sample,
      message: `DRY RUN — fetched ${rows.length} Barbary drivers; sheet NOT written`,
    };
  }

  await clearRange(CLEAR_RANGE);
  await writeRange(WRITE_ANCHOR, [HEADER, ...rows]);
  return {
    ok: true, dryRun: false, companies: companyIds.length, drivers: rows.length, apiTotalReported: apiTotal, sample, syncedAt,
    message: `Wrote ${rows.length} Barbary drivers to "${TAB}"`,
  };
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
