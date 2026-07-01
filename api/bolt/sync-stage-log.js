"use strict";
/**
 * GET /api/bolt/sync-stage-log  — Build-133 (Phase 2, onboarding stage-delay analytics)
 *
 * ⚠️ NOT YET LIVE / UNTESTED. This mirrors the proven api/bolt/sync-sheet.js almost
 * exactly (same Google service-account JWT auth, same Supabase upsert pattern), but
 * points at the onboarding sheet's "STAGE LOG" + "STAGE SNAPSHOT" tabs and the two new
 * Supabase tables sheet_stage_log / sheet_stage_snapshot. It is:
 *   - HARMLESS until called: auth-gated (CRON_SECRET) and NOT wired into vercel.json,
 *     so nothing invokes it automatically.
 *   - A NO-OP until the Apps Script stage-log module is pasted into the sheet (the two
 *     tabs won't exist, so each read is caught and skipped — it syncs nothing, no error).
 *
 * TO ACTIVATE (do this only after the sheet's STAGE LOG tab exists and has data):
 *   1. Deploy this file (it's in the mhmbolt repo).
 *   2. Live-test it: curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://mhmbolt.vercel.app/api/bolt/sync-stage-log   → expect {ok:true, log:N, snapshot:M}
 *   3. Schedule it. Either add a cron to vercel.json:
 *        { "path": "/api/bolt/sync-stage-log", "schedule": "0 21 * * *" }
 *      (Vercel Hobby allows a limited number of crons — if you're at the limit, instead
 *      call this endpoint at the end of api/bolt/sync-sheet.js so both sync on one trigger.)
 *
 * Reads STAGE LOG / STAGE SNAPSHOT with UNFORMATTED_VALUE + SERIAL_NUMBER so datetime
 * cells arrive as sheet serials; serialToISO() converts them (sheet TZ = Riyadh, UTC+3,
 * no DST) to ISO for Postgres timestamptz.
 *
 * Requires env vars (already set on this Vercel project):
 *   GOOGLE_SHEETS_CREDENTIALS_JSON, SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET
 */

const crypto = require("crypto");

const SPREADSHEET_ID = "17-GCTaqEiCvCrcCrDvBm9DcCtljPcAJ3RpJTBkAJs0s";
const LOG_RANGE      = "'STAGE LOG'!A1:I100000";
const SNAP_RANGE     = "'STAGE SNAPSHOT'!A1:E5000";
const SHEET_TZ_OFFSET_H = 3;   // Asia/Riyadh, UTC+3, no DST

// ── Google service-account auth (JWT Bearer grant) — copied from sync-sheet.js ──
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
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
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

// Read a range as raw values; datetimes as sheet serial numbers. Returns [] (not throw)
// if the tab doesn't exist yet, so this endpoint is safe to deploy before the Apps
// Script module is pasted.
async function readSheetRange(range) {
  const token = await getGoogleSheetsToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`
    + `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 400) return [];          // range/tab not found yet — treat as no data
  if (!resp.ok) throw new Error(`Sheets API ${range}: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.values || [];
}

// Google Sheets serial (days since 1899-12-30) in the sheet's timezone → ISO UTC string.
function serialToISO(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const naiveMs = Math.round((v - 25569) * 86400 * 1000);        // wall-clock as if UTC
    const d = new Date(naiveMs - SHEET_TZ_OFFSET_H * 3600 * 1000); // shift Riyadh → true UTC
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ── Supabase REST helpers ───────────────────────────────────────────────────
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function upsert(table, rows) {
  if (!rows.length) return;
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}`;
  for (let i = 0; i < rows.length; i += 500) {   // chunk to keep each request small
    const resp = await fetch(url, {
      method:  "POST",
      headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body:    JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!resp.ok) throw new Error(`Supabase upsert ${table}: ${resp.status} ${await resp.text()}`);
  }
}

// Map a header row → { headerName: columnIndex }.
function headerIndex(header) {
  const idx = {};
  (header || []).forEach((h, i) => { idx[String(h).trim()] = i; });
  return idx;
}

// ── Handler ─────────────────────────────────────────────────────────────────
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
    const now = new Date().toISOString();

    // ---- STAGE LOG ----
    const logValues = await readSheetRange(LOG_RANGE);
    let logRows = [];
    if (logValues.length >= 2) {
      const h = headerIndex(logValues[0]);
      const cWhen = h["When"], cId = h["Driver ID"], cName = h["Full Name"], cIq = h["Iqama"],
            cFrom = h["From Stage"], cTo = h["To Stage"], cDays = h["Days in From-Stage"],
            cSrc = h["Source"], cEd = h["Editor"];
      logRows = logValues.slice(1).map(r => {
        const driverId = cId  != null ? String(r[cId]  || "").trim() : "";
        const name     = cName!= null ? String(r[cName]|| "").trim() : "";
        const toStage  = cTo  != null ? String(r[cTo]  || "").trim() : "";
        const changed  = cWhen!= null ? serialToISO(r[cWhen]) : null;
        return {
          row_key:      `${driverId || name}|${changed || ""}|${toStage}`,
          driver_id:    driverId,
          name,
          iqama:        cIq  != null ? String(r[cIq]  || "").trim() : "",
          from_stage:   cFrom!= null ? String(r[cFrom]|| "").trim() : "",
          to_stage:     toStage,
          days_in_from: cDays!= null ? numOrNull(r[cDays]) : null,
          source:       cSrc != null ? String(r[cSrc] || "").trim() : "",
          editor:       cEd  != null ? String(r[cEd]  || "").trim() : "",
          changed_at:   changed,
          synced_at:    now,
        };
      }).filter(x => x.to_stage || x.from_stage);   // drop blank rows
    }

    // ---- STAGE SNAPSHOT ----
    const snapValues = await readSheetRange(SNAP_RANGE);
    let snapRows = [];
    if (snapValues.length >= 2) {
      const h = headerIndex(snapValues[0]);
      const cId = h["Driver ID"], cIq = h["Iqama"], cName = h["Full Name"],
            cStage = h["Current Stage"], cEnt = h["Entered Current Stage At"];
      const seen = new Set();
      snapValues.slice(1).forEach(r => {
        const driverId = cId != null ? String(r[cId] || "").trim() : "";
        if (!driverId || seen.has(driverId)) return;   // PK = driver_id; skip blanks/dupes
        seen.add(driverId);
        snapRows.push({
          driver_id:     driverId,
          iqama:         cIq   != null ? String(r[cIq]   || "").trim() : "",
          name:          cName != null ? String(r[cName] || "").trim() : "",
          current_stage: cStage!= null ? String(r[cStage]|| "").trim() : "",
          entered_at:    cEnt  != null ? serialToISO(r[cEnt]) : null,
          synced_at:     now,
        });
      });
    }

    await upsert("sheet_stage_log", logRows);
    await upsert("sheet_stage_snapshot", snapRows);

    return res.status(200).json({
      ok: true, log: logRows.length, snapshot: snapRows.length,
      message: `Synced ${logRows.length} stage-log rows + ${snapRows.length} snapshot rows`,
    });
  } catch (e) {
    console.error("[sync-stage-log]", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
