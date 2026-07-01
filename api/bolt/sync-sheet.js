"use strict";
/**
 * GET /api/bolt/sync-sheet  — Build-131
 * Mirrors the onboarding Google Sheet's DRIVERS tab (Driver ID, Full Name, Phone,
 * Source / Ambassador) into Supabase `sheet_ambassador_sync`, so the dashboard can
 * match sheet rows to its own drivers client-side (matchSheetDriverToDashboard in
 * index.html) without ever calling Google from the browser.
 *
 * Auth: RS256 JWT signed with a Google service-account private key, exchanged for an
 * OAuth2 access token — no external library, matches this repo's existing
 * zero-dependency style (see lib.js's getBoltToken for the same cached-token pattern).
 *
 * Requires env vars on this Vercel project:
 *   GOOGLE_SHEETS_CREDENTIALS_JSON  (the full service-account JSON key, as one string)
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   CRON_SECRET  (Vercel sends this automatically on cron invocations)
 */

const crypto = require("crypto");

const SPREADSHEET_ID = "17-GCTaqEiCvCrcCrDvBm9DcCtljPcAJ3RpJTBkAJs0s";
const SHEET_RANGE     = "DRIVERS!A1:Z2000";

// ── Google service-account auth (JWT Bearer grant) ─────────────────────────────
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

  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims  = base64url(JSON.stringify({
    iss:   creds.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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

async function readSheetRange(range) {
  const token = await getGoogleSheetsToken();
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const resp  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheets API ${range}: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.values || []; // array of arrays — row 0 is headers
}

// ── Supabase REST helpers (mirrors cron-sync.js) ───────────────────────────────
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function upsertSyncedDrivers(rows) {
  if (!rows.length) return;
  const url = `${process.env.SUPABASE_URL}/rest/v1/sheet_ambassador_sync`;
  const resp = await fetch(url, {
    method:  "POST",
    headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body:    JSON.stringify(rows),
  });
  if (!resp.ok) throw new Error(`Supabase upsert: ${resp.status} ${await resp.text()}`);
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  const auth = req.headers["authorization"] || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (!process.env.GOOGLE_SHEETS_CREDENTIALS_JSON) {
    return res.status(503).json({ ok: false, error: "GOOGLE_SHEETS_CREDENTIALS_JSON not configured" });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ ok: false, error: "SUPABASE_URL and SUPABASE_SERVICE_KEY required" });
  }

  try {
    const values = await readSheetRange(SHEET_RANGE);
    if (values.length < 2) {
      return res.status(200).json({ ok: true, synced: 0, message: "No data rows found" });
    }
    const header = values[0];
    const idx = h => header.indexOf(h);
    const cId = idx("Driver ID"), cName = idx("Full Name"), cPhone = idx("Phone"),
          cAmb = idx("Source / Ambassador"), cIq = idx("Iqama / National ID");
    if (cId < 0 || cName < 0) {
      return res.status(500).json({ ok: false, error: `Expected columns "Driver ID" and "Full Name" not found in header row: ${header.join(", ")}` });
    }
    // Nationality from the ID's first digit — Saudi national ID starts 1, expat Iqama starts 2.
    // Only the label is stored, never the raw ID (this table is anon-readable → no PII).
    const natFromId = v => { const d = String(v || "").replace(/\D/g, ""); return d[0] === "1" ? "saudi" : d[0] === "2" ? "foreigner" : ""; };

    const rows = values.slice(1)
      .filter(r => r[cId] && r[cName])
      .map(r => ({
        id:          String(r[cId]).trim(),
        name:        String(r[cName]).trim(),
        phone:       cPhone >= 0 ? String(r[cPhone] || "").trim() : "",
        ambassador:  cAmb   >= 0 ? String(r[cAmb]   || "").trim() : "",
        nationality: cIq    >= 0 ? natFromId(r[cIq]) : "",
        synced_at:   new Date().toISOString(),
      }));

    // Batch in chunks of 500 to keep each Supabase request small.
    for (let i = 0; i < rows.length; i += 500) {
      await upsertSyncedDrivers(rows.slice(i, i + 500));
    }

    return res.status(200).json({ ok: true, synced: rows.length, message: `Synced ${rows.length} rows from the onboarding sheet` });
  } catch (e) {
    console.error("[sync-sheet]", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
