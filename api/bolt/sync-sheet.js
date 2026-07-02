"use strict";
/**
 * GET /api/bolt/sync-sheet  — Build-131, +AMBASSADORS tab (Build-149)
 * Mirrors the onboarding Google Sheet's DRIVERS tab (Driver ID, Full Name, Phone,
 * Source / Ambassador) into Supabase `sheet_ambassador_sync`, so the dashboard can
 * match sheet rows to its own drivers client-side (matchSheetDriverToDashboard in
 * index.html) without ever calling Google from the browser.
 *
 * Also mirrors the sheet's AMBASSADORS tab (the single source of truth for canonical
 * ambassador names) into the `ambassadors` table, so the dashboard dropdown auto-follows
 * the sheet — adding an ambassador is done in one place (the sheet), not also index.html.
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
// Build-148 follow-up: the AMBASSADORS tab is the single source of truth for the canonical
// ambassador names (A = Canonical Name, B = Aliases, C = Active). Mirroring it into a small
// `ambassadors` table lets the dashboard's dropdown auto-follow the sheet — add an ambassador
// in ONE place instead of also editing index.html's AMBASSADOR_LIST.
const AMBASSADORS_RANGE = "AMBASSADORS!A1:C500";

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

async function upsertAmbassadors(rows) {
  if (!rows.length) return;
  const url = `${process.env.SUPABASE_URL}/rest/v1/ambassadors`;
  const resp = await fetch(url, {
    method:  "POST",
    headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body:    JSON.stringify(rows),
  });
  if (!resp.ok) throw new Error(`Supabase ambassadors upsert: ${resp.status} ${await resp.text()}`);
}

// Keep `ambassadors` an exact mirror of the sheet: after upserting the current names,
// delete any table rows whose name is no longer in the tab (a genuine removal). Guarded by
// the caller to only run when at least one name was read, so a transient empty read can never
// wipe the table. Setting Active=No in the sheet is the softer path (kept as a row, hidden by
// the dashboard's active filter); deleting the row here is for names removed outright.
async function deleteAmbassadorsNotIn(names) {
  if (!names.length) return;
  const inList = names.map(n => `"${String(n).replace(/"/g, '""')}"`).join(",");
  const url = `${process.env.SUPABASE_URL}/rest/v1/ambassadors?name=not.in.(${encodeURIComponent(inList)})`;
  const resp = await fetch(url, { method: "DELETE", headers: { ...sbHeaders(), Prefer: "return=minimal" } });
  if (!resp.ok) throw new Error(`Supabase ambassadors delete: ${resp.status} ${await resp.text()}`);
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
          cAmb = idx("Source / Ambassador"), cNat = idx("Nationality");
    if (cId < 0 || cName < 0) {
      return res.status(500).json({ ok: false, error: `Expected columns "Driver ID" and "Full Name" not found in header row: ${header.join(", ")}` });
    }
    // Nationality is an EXPLICIT sheet column ("Nationality" = Saudi | Foreigner). It CANNOT be
    // derived from the ID: foreigners drive on a Saudi's account, so the recorded ID is the
    // Saudi account-holder's and every ID looks Saudi. Normalize EN/AR values to saudi|foreigner.
    const normNat = v => {
      const s = String(v || "").trim().toLowerCase();
      if (!s) return "";
      if (s.indexOf("saud") !== -1 || s.indexOf("سعود") !== -1) return "saudi";
      if (s.indexOf("foreign") !== -1 || s.indexOf("expat") !== -1 || s.indexOf("resident") !== -1 ||
          s.indexOf("non") !== -1 || s.indexOf("مقيم") !== -1 || s.indexOf("اجنب") !== -1 ||
          s.indexOf("أجنب") !== -1 || s.indexOf("وافد") !== -1) return "foreigner";
      return "";
    };

    const rows = values.slice(1)
      .filter(r => r[cId] && r[cName])
      .map(r => ({
        id:          String(r[cId]).trim(),
        name:        String(r[cName]).trim(),
        phone:       cPhone >= 0 ? String(r[cPhone] || "").trim() : "",
        ambassador:  cAmb   >= 0 ? String(r[cAmb]   || "").trim() : "",
        nationality: cNat   >= 0 ? normNat(r[cNat]) : "",
        synced_at:   new Date().toISOString(),
      }));

    // Batch in chunks of 500 to keep each Supabase request small.
    for (let i = 0; i < rows.length; i += 500) {
      await upsertSyncedDrivers(rows.slice(i, i + 500));
    }

    // ── AMBASSADORS tab → `ambassadors` table ─────────────────────────────────
    // Runs in its own try/catch so a problem here (e.g. the tab not created yet) never
    // fails the drivers sync above, which is the more critical of the two.
    let ambassadorsSynced = null, ambassadorsError = null;
    try {
      const ambValues = await readSheetRange(AMBASSADORS_RANGE);
      if (ambValues.length < 2) {
        // Header only (or empty): skip entirely — never upsert and never delete, so an empty
        // read can't wipe an already-populated table.
        ambassadorsSynced = 0;
      } else {
        const ah = ambValues[0].map(x => String(x || "").trim().toLowerCase());
        const find = (needle, fallback) => { const i = ah.findIndex(x => x.indexOf(needle) !== -1); return i >= 0 ? i : fallback; };
        const aName = find("name", 0), aAlias = find("alias", 1), aActive = find("active", 2);
        // Team column (Egypt|Saudi) drives the referrer-incentive currency: Egypt team pays EGP,
        // Saudi team pays SAR. Optional — no fixed fallback index (older sheets lack it → blank).
        const aTeam = find("team", -1);
        // A blank Active cell means active (don't hide an ambassador over an unfilled cell);
        // only an explicit no/false/0/inactive turns it off.
        const isActive = v => { const s = String(v == null ? "" : v).trim().toLowerCase(); return !/^(no|false|0|inactive|n)$/.test(s); };
        // Normalize the Team cell (EN/AR) to egypt|saudi; anything unrecognized/blank → "".
        const normTeam = v => {
          const s = String(v == null ? "" : v).trim().toLowerCase();
          if (!s) return "";
          if (s.indexOf("egyp") !== -1 || s.indexOf("مصر") !== -1 || s === "eg") return "egypt";
          if (s.indexOf("saud") !== -1 || s.indexOf("سعود") !== -1 || s === "ksa" || s === "sa") return "saudi";
          return "";
        };
        const now = new Date().toISOString();
        const seen = new Set();
        const ambRows = [];
        ambValues.slice(1).forEach(r => {
          const name = String(r[aName] || "").trim();
          if (!name) return;
          const key = name.toLowerCase();
          if (seen.has(key)) return;            // first row wins on a duplicate name
          seen.add(key);
          ambRows.push({
            name,
            aliases:    String(r[aAlias] || "").trim(),
            active:     isActive(r[aActive]),
            team:       aTeam >= 0 ? normTeam(r[aTeam]) : "",
            updated_at: now,
          });
        });
        if (ambRows.length) {
          for (let i = 0; i < ambRows.length; i += 500) await upsertAmbassadors(ambRows.slice(i, i + 500));
          await deleteAmbassadorsNotIn(ambRows.map(a => a.name));
        }
        ambassadorsSynced = ambRows.length;
      }
    } catch (e) {
      console.error("[sync-sheet] ambassadors:", e.message);
      ambassadorsError = e.message;
    }

    return res.status(200).json({
      ok: true,
      synced: rows.length,
      ambassadorsSynced,
      ambassadorsError,
      message: `Synced ${rows.length} driver rows` +
        (ambassadorsError ? ` · ambassadors sync failed: ${ambassadorsError}`
                          : ` · ${ambassadorsSynced} ambassador${ambassadorsSynced === 1 ? "" : "s"}`),
    });
  } catch (e) {
    console.error("[sync-sheet]", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
