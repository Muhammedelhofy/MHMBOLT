# Bolt Dashboard FINALIZE — S5 (Ops endpoints, lib hardenings, docs)

**Date:** 2026-07-06 · **Session:** Sonnet · med · **Branch:** `bolt-finalize-s5` (own worktree, off `origin/main` @ `85d3d9e`)
**Status:** ✅ built + verified locally (mock harnesses + real Bolt-API calls). **NOT merged — awaiting deploy-OK.**
⚠️ Backend + docs only, per the parallel-safety brief — S3 (funnel tabs) was mid-edit on `index.html` this session; **`index.html` was not touched.**

Implements F5, F7, F8 from `BOLT_DATA_INTEGRITY_FINDINGS.md`. Note: F1 (per-driver merge + `s:'cron'` source tag) already landed in S1; this session builds on top of it, no rework.

---

## F5 — on-demand sheet refresh

**New `POST /api/bolt/sync-sheet-now`** ([api/bolt/sync-sheet-now.js](api/bolt/sync-sheet-now.js)).

- **Reuse, not reimplementation:** `sync-sheet.js` now exports `runSheetSync()` — the exact logic the nightly cron already runs (drivers mirror + ambassadors mirror). The cron handler and the new endpoint both call it; there is exactly one place that computes the sheet → Supabase mirror.
- **Auth:** `Bearer DASH_SYNC_KEY` — a **new, separate** env var from `CRON_SECRET` (so the manual button and the midnight cron can't be triggered with the same leaked key). If `DASH_SYNC_KEY` isn't set in Vercel yet, the endpoint returns a clean **400** ("not configured"), never a crash or a 401 that looks like a wrong password.
- **Rate limit:** rejects with **429** (+`Retry-After` header, +`retryAfterSeconds` in the body) if the mirror was refreshed less than 60s ago. The "last refreshed" timestamp is read from the existing `sheet_ambassador_sync` table's own `synced_at` column — **no new table or column needed.**
- **Response:** `{ ok, synced, ambassadorsSynced, ambassadorsError, message, syncedAt }`.

## F7 — lib.js hardenings (shared with the live nightly cron)

**m1 — `paginateAll` loop fix:** was exiting on `items.length < limit` (a page smaller than requested), which would silently truncate a pull to page 1 if the Bolt API ever returned a short page before the true total was reached. Now loops on `all.length < total` with a 200-page guard against a runaway loop if the API ever misreports its total.

**m2 — `hoursOnline` window-start credit: investigated, NOT shipped.** The findings doc described crediting the pre-first-log stretch for a driver online across the window boundary. I implemented the described fix, then verified it against the live Bolt API (see below) — it was **wrong**: the `state` field on a state-log entry reflects "just transitioned to this state," not "was already in this state before the window." My fix credited **any** driver whose first log inside the window happened to be a normal daytime "went online" event with hours going all the way back to midnight — up to **+23.27h** on one driver, and it changed 44 of 98 drivers' totals. I reverted it rather than ship a fix that inflates `hoursOnline`. Correctly closing this gap would need an extra query for the driver's state as of just-before `start_ts`, which is out of scope for a "small hardening" — flagging as a real but separate follow-up.

## F8 — backup visibility (backend only)

`health.js` now reads `fleet_data_backup` (service key — already has access) and returns `backups: { count, latest }` alongside the existing `bolt`/`supabase`/`lastCron` fields. `fleet_data_backup` is RLS-hidden from the anon key by design, so this is the only way the dashboard will ever be able to show "16 backups, latest 2026-07-05."

---

## Verification

**F7 (paginateAll), against the LIVE Bolt Fleet API, read-only, 2026-07-05:**

| | totalOrders | driverCount | activeCount | sumNetEarnings | sumHoursOnline |
|---|---|---|---|---|---|
| Before | 423 | 98 | 38 | 7567.01 | 309.80 |
| After (paginateAll fix only) | 423 | 98 | 38 | 7567.01 | 309.80 |

**Identical.** Proves the pagination change is a no-op at current scale (423 orders ≪ the 1000-item page limit) and doesn't alter the live pull contract. Run via a local Node harness (Kimi-bundled runtime) using the same `bolt-config.json` credentials the `⚡ Bolt Sync` local proxy uses — real Bolt API, zero Supabase/dashboard writes.

**F7 (hoursOnline m2), same live pull:** naive fix changed `sumHoursOnline` 309.80 → 745.51 (44/98 drivers affected, up to +23.27h on one driver). Inspected the raw state-log for the worst offender: first in-window log at `startTs + 83,761s` (23.27h into the day), state `waiting_orders` — a normal daytime online event, not a midnight-boundary carry-over. **Reverted.**

**F5 (sync-sheet-now), mock request/response + mocked `fetch` (no live Google/Supabase creds available locally — those only live in Vercel):**
- `DASH_SYNC_KEY` unset → `400`, clean message, no throw.
- Wrong bearer token → `401`.
- Correct token, `SUPABASE_URL` unset → `503`.
- `GET` method → `405`.
- Mocked `synced_at` 10s ago → `429`, `Retry-After: 50`, `retryAfterSeconds: 50`.
- Mocked `synced_at` 90s ago → passes the rate-limit gate and reaches `runSheetSync()` (which then correctly reports its own missing-env error, proving the reuse chain is wired end-to-end).

**F8 (health.js backups), mocked `fetch` returning `Content-Range: 0-0/16`:** `backups: { count: 16, latest: "2026-07-05" }`, `lastCron` unaffected.

**What was NOT live-verified:** the actual sheet-read and Supabase-write paths in F5, and the actual Supabase read in F8, since `GOOGLE_SHEETS_CREDENTIALS_JSON` and `SUPABASE_SERVICE_KEY` only exist in Vercel, not locally, and pasting/requesting those values is against the standing rule. Both reuse code paths that are **already live in production** (`sync-sheet.js`'s core logic, `health.js`'s existing `sbHeaders()`/Supabase-read pattern for `lastCron`), so the risk is low, but a first real hit after deploy is worth a quick manual check.

---

## Deferred to a follow-up (see README's "S5-UI follow-up" section)

Per the parallel-safety brief, the frontend halves of F5 and F8 were **not built** this session (would have collided with S3 on `index.html`):
1. A "Refresh mirror now" button (Settings, Onboarding trust strip, Ambassadors) calling `POST /api/bolt/sync-sheet-now`.
2. The Settings health-card line rendering `backups: {count, latest}`.

Both are ~30 min of frontend work once `index.html` is free — exact wiring points are in [README.md](README.md).

---

## Guardrails held

- Own worktree (`bolt-s5`), `index.html` untouched.
- `lib.js` is shared with the live nightly cron — only the m1 fix shipped, verified byte-identical output against the live API before/after. m2 was caught by the same verification and correctly not shipped.
- `sync-sheet.js`'s cron handler (auth, response codes) is unchanged from the caller's perspective — only its internals were extracted into `runSheetSync()`.
- No deploy, no push to `main`, no live Supabase writes. **Stopped before merge — awaiting Muhammad's explicit deploy-OK.**

## Next rung
Frontend follow-up (F5/F8 UI wiring, ~30 min) once `index.html` is free from S3/S7. `paginateAll`'s m1 fix and F8's `backups` field are additive and safe to merge independently of that follow-up.
