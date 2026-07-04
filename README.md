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
| `30 21 * * *` | 00:30 | `api/bolt/sync-stage-log`| Mirror onboarding STAGE LOG/SNAPSHOT (no-op until those sheet tabs exist) |
| `45 21 * * *` | 00:45 | `api/bolt/sync-sheet`    | Mirror DRIVERS + AMBASSADORS tabs |

## Serverless functions

| File | Role |
|---|---|
| `api/bolt/lib.js` | Shared Bolt API fetch + per-driver aggregation (used by cron-sync + manual sync) |
| `api/bolt/codec.js` | **Single source of truth** for the `c1` driver pack/unpack. Add a driver field HERE and mirror the same two lines into index.html's inline copy — the parity test guards it. |
| `api/bolt/cron-sync.js` | Nightly Bolt → Supabase sync (the live core) |
| `api/bolt/sync.js` | Manual single-day sync (the `⚡ Bolt Sync` button) |
| `api/bolt/sync-sheet.js` | Onboarding sheet → `ambassadors` + `sheet_ambassador_sync` |
| `api/bolt/sync-stage-log.js` | Onboarding stage-log → `sheet_stage_log` + `sheet_stage_snapshot` |
| `api/bolt/health.js` | System-status card (Bolt + Supabase reachability + last cron) |
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
`CRON_SECRET`, `GOOGLE_SHEETS_CREDENTIALS_JSON`. See OPERATOR_RUNBOOK.md for what each is and who manages it.
