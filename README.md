# MOHM Bolt Fleet Dashboard (`MHMBOLT`)

A single-page dashboard for running Muhammad's Bolt fleet — driver performance, finance/payouts,
suspensions, ambassador attribution, and the onboarding pipeline. Deployed on Vercel
(`mhmbolt.vercel.app`); data lives in Supabase. Operators: see **[OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md)**.

## What it is

- **`index.html`** — the entire frontend (one file: UI + all logic). Tabs: 🎯 Today · Captains ·
  Finance · 🎖 Ambassadors · 💸 Incentives · ⛔ Blocks · Analytics · 🚦 Onboarding · ⭐ Star Map · Settings.
- **`api/bolt/*.js`** — Vercel serverless functions (Node, zero-dependency).
- **Supabase** project `ltqpoupferwituusxwal` — persistence. The whole app state is one JSON blob
  in `fleet_data` (id=`fleet`), plus mirror tables synced from the onboarding Google Sheet.

## Data flow (nightly)

```
Bolt Fleet API ──(lib.js)──> cron-sync.js  ──> fleet_data.khair_history (+ daily backup)
Google Sheet   ──(JWT)─────> sync-sheet.js ──> ambassadors, sheet_ambassador_sync
               └───────────> sync-stage-log.js ──> sheet_stage_log, sheet_stage_snapshot
Browser (index.html) <── reads fleet_data + mirror tables ──> renders the dashboard
```

The browser auto-configures Supabase from `/api/bolt/config` (URL + anon read key). Manual `⚡ Bolt Sync`
in the header pulls a specific day on demand.

## Crons (in `vercel.json`; times UTC — Vercel Hobby may run up to ~1h late, which is normal)

| Schedule | Riyadh | Endpoint | Purpose |
|---|---|---|---|
| `0 21 * * *`  | 00:00 | `api/bolt/cron-sync`      | Pull yesterday's fleet data from Bolt → `fleet_data` |
| `30 21 * * *` | 00:30 | `api/bolt/sync-stage-log`| Mirror onboarding STAGE LOG/SNAPSHOT (LIVE — ~186 log + ~121 snapshot rows) |
| `45 21 * * *` | 00:45 | `api/bolt/sync-sheet`    | Mirror DRIVERS + AMBASSADORS tabs |

## Serverless functions

| File | Role |
|---|---|
| `api/bolt/lib.js` | Shared Bolt API fetch + per-driver aggregation (used by cron-sync + manual sync) |
| `api/bolt/codec.js` | **Single source of truth** for the `c1` driver pack/unpack. Add a driver field HERE and mirror the same two lines into index.html's inline copy — the parity test guards it. |
| `api/bolt/cron-sync.js` | Nightly Bolt → Supabase sync (the live core) |
| `api/bolt/sync.js` | Manual single-day sync (the `⚡ Bolt Sync` button) |
| `api/bolt/sync-sheet.js` | Onboarding sheet → `ambassadors` + `sheet_ambassador_sync`. Exports `runSheetSync()` — the actual sync logic — so `sync-sheet-now.js` can reuse it verbatim. |
| `api/bolt/sync-sheet-now.js` | **F5.** On-demand version of the sheet mirror, `POST`, auth = `DASH_SYNC_KEY` (not `CRON_SECRET`). Calls the same `runSheetSync()` as the nightly cron. Rate-limited to 1 call/60s (reads the last `synced_at` off `sheet_ambassador_sync`, no new table). Returns 400 (not a crash) if `DASH_SYNC_KEY` isn't set yet. UI button that calls this is not wired up yet — see "UI follow-up" below. |
| `api/bolt/sync-stage-log.js` | Onboarding stage-log → `sheet_stage_log` + `sheet_stage_snapshot` |
| `api/bolt/health.js` | System-status card (Bolt + Supabase reachability + last cron + **F8** backup count/latest date from `fleet_data_backup`) |
| `api/bolt/config.js` | Serves Supabase URL + anon key to the browser |
| `api/bolt/status.js` | Whether Bolt credentials are configured |

## Supabase tables

`fleet_data` (the app-state blob) · `fleet_data_backup` (1 snapshot/day, pre-overwrite) ·
`ambassadors` · `sheet_ambassador_sync` · `sheet_stage_log` · `sheet_stage_snapshot`.
RLS: the browser reads with the anon key; all writes go through the service key (cron side).

## Local development

```
pwsh ./serve.ps1        # serves index.html on http://localhost:3000 (+ a local Bolt sync proxy)
```
`serve.ps1` reads Bolt creds from a gitignored `bolt-config.json` (never committed).

## Tests

Standalone Node scripts (host Node ships inside the Kimi runtime, not on PATH):
```
ELECTRON_RUN_AS_NODE=1 "<...>/kimi-desktop/Kimi.exe" tests/codec_parity.test.js
```
`tests/codec_parity.test.js` — asserts the shared `codec.js` and index.html's inline copy stay in
lock-step (parity + lossless round-trip + the Build-167 regression + cron-safety).

## Deploy

Pushing to `main` auto-deploys Vercel production. **Never deploy without Muhammad's explicit OK** —
`cron-sync` + the sheet crons are the live core he can't fix if they break headless.

## Env vars (Vercel — never in code)

`BOLT_CLIENT_ID`, `BOLT_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`,
`CRON_SECRET`, `GOOGLE_SHEETS_CREDENTIALS_JSON`, `DASH_SYNC_KEY` (F5 — protects the on-demand
`sync-sheet-now` endpoint; a separate secret from `CRON_SECRET`, Muhammad sets it himself).
See OPERATOR_RUNBOOK.md for what each is and who manages it.

## S5-UI follow-up (deferred — not built yet)

Two backend pieces from S5 (`BOLT_DATA_INTEGRITY_FINDINGS.md` F5/F8) are live in the API but have
no frontend yet, to avoid touching `index.html` while another session was mid-edit there:

1. **"Refresh mirror now" button** — should call `POST /api/bolt/sync-sheet-now` with
   `Authorization: Bearer <DASH_SYNC_KEY>`, then re-read the mirror tables the way "⇅ Sync from
   sheet" already does. Wire it into: Settings (health card), the Onboarding trust strip, and the
   Ambassadors tab — the three places that currently read the stale mirror and imply it's live.
   Handle the 429 rate-limit response (shows `retryAfterSeconds`) and the 400 "not configured"
   response (hide/disable the button if `DASH_SYNC_KEY` isn't set — call `/api/bolt/health`-style
   probe, or just try once and disable on 400).
2. **Settings health-card backup line** — `GET /api/bolt/health` now returns
   `backups: { count, latest }`. Render "✓ N backups, latest: <date>" (or a red flag if `latest`
   is more than ~2 days old) next to the existing Bolt/Supabase/last-cron rows.

Both are ~30 min of frontend work once `index.html` is free.
