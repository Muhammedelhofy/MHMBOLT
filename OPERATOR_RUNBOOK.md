# MOHM Fleet Dashboard — Operator Runbook

**Last updated:** 2026-07-07  
**Version:** v5.4  
**Dashboard URL:** your Vercel production URL (mhmbolt.vercel.app or custom domain)

---

## How the system works (plain English)

- The dashboard is a website hosted on **Vercel** (free cloud hosting).
- Driver data is fetched automatically every night at **midnight Riyadh time** from the Bolt API.
- All data is stored in **Supabase** (cloud database) — any device that opens the dashboard URL sees the same data.
- A daily backup of all data is saved automatically before every overwrite.
- Your **fleet roster** (how many captains you have) and the **blocked count** are read from the **most recent full nightly-sync day** — one complete snapshot of the whole fleet, not a mix stitched from several days. A partial mid-day upload (e.g. a CSV covering only the drivers who worked) never overwrites that full day; it only adds to it. *(Technical reference for the storage model: `BOLT_STORAGE_HEALTH.md`, commit `abf9480`.)*

---

## Daily routine — what happens automatically

| Time (Riyadh) | What happens |
|---|---|
| ~Midnight (00:00) | Auto-sync pulls yesterday's data from Bolt → saves to Supabase |
| ~00:30 | Onboarding stage-log sync — records where each driver is in the pipeline (LIVE) |
| ~00:45 | Onboarding sync — pulls the DRIVERS + AMBASSADORS tabs into the dashboard |
| Any time | Open the dashboard — data loads automatically |

You do not need to do anything daily. The system runs itself.

> **Timing note:** these run on Vercel's free plan, which can start a scheduled job **up to
> about an hour late**. So if the midnight sync shows as running at, say, 00:40, that's normal —
> not a fault.

---

## How to check if everything is working

1. Open the dashboard
2. Click the **Settings** tab (top right)
3. Look at the **System Status** card

You will see:
- **Bolt API connected** ✓ — Bolt credentials are working
- **Supabase connected** ✓ — Database is reachable
- **Last auto-sync: [date/time] — X drivers, Y orders** ✓ — Midnight sync ran successfully
- **Backups: N, latest [date]** — how many daily backups exist and when the newest one was taken
  (once the card is updated to show it — the data is already live at `/api/bolt/health`)

If you see a red ✗ on any line, follow the relevant section below.

---

## What to do if things go wrong

### The dashboard shows no data on a new device / new browser
**Cause:** First time opening on this browser.  
**Fix:** Just wait a few seconds — the dashboard auto-connects to the database. If it still shows nothing after 10 seconds, press Ctrl+Shift+R (hard refresh).

---

### System Status shows "Last auto-sync FAILED"
**Cause:** The midnight sync hit an error (Bolt API was down, Supabase was slow, etc.).  
**Fix:**
1. Open the dashboard → click **⚡ Bolt Sync** button in the header
2. Select yesterday's date → click Sync
3. This manually pulls the missing day's data

The next midnight run will resume automatically — you only need to manually sync the missed day.

---

### The ⚡ Bolt Sync button is not visible
**Cause:** The Bolt API credentials may have expired.  
**Fix:** Contact your technical person to update `BOLT_CLIENT_ID` and `BOLT_CLIENT_SECRET` in Vercel (see Credentials section below).

---

### System Status shows "Bolt API — 401" or "Bolt API — unreachable"
**Cause:** Bolt API credentials expired or were rotated.  
**Fix:** Log in to Vercel → MHMBOLT project → Environment Variables → update `BOLT_CLIENT_ID` and `BOLT_CLIENT_SECRET` → Redeploy.

---

### System Status shows "Supabase — unreachable"
**Cause:** Supabase is having an outage (rare) or credentials changed.  
**Fix:** Check status.supabase.com. If Supabase is up, contact your technical person.  
**Meanwhile:** The dashboard still works from locally cached data in your browser.

---

### Data looks wrong / corrupted
**Cause:** A bad sync overwrote good data.  
**Fix:** Contact your technical person to restore from the daily backup (table: `fleet_data_backup` in Supabase, one row per day). Recovery takes 5 minutes.
**Checking backups exist:** the System Status card's backup line (once wired up — see below) shows
the count and the latest backup date, read straight from `fleet_data_backup` via `/api/bolt/health`.

---

### Good to know: a bad sync night can't shrink your roster (safety net)
**This is a protection, not a problem — no action needed.** Each midnight sync now checks whether it
received a **complete** roster from Bolt (it reports this internally as `rosterComplete`). If part of
the Bolt API fails that night and only a **partial** list comes back, the sync **refuses to overwrite**
the last complete day for that date — it keeps the good full-fleet snapshot instead of replacing it
with a short list. So one bad night can no longer corrupt your roster or blocked count.
- **Real changes still apply:** if drivers genuinely left the fleet and the roster is legitimately
  smaller, a *complete* pull still updates normally — the guard only blocks *incomplete* pulls, not
  real churn.
- **Self-healing:** the next healthy night writes the full day for that date automatically.
- If you ever want to force a specific day, use **⚡ Bolt Sync** for that date (see below).

*(Full details of how the roster/blocked truth is stored and protected: `BOLT_STORAGE_HEALTH.md`, commit `abf9480`.)*

---

### A sheet edit isn't showing up on the dashboard yet
**Cause:** the sheet mirror (DRIVERS/AMBASSADORS tabs → Supabase) only refreshes on the ~00:45
Riyadh cron, so a same-day edit can take up to a day to appear. The "⇅ Sync from sheet" button on
the dashboard re-reads that same overnight mirror — it does **not** talk to Google live.
**Fix (once the "Refresh mirror now" button is wired up — see README's "S5-UI follow-up"):** click
it to force an immediate re-read of the sheet into Supabase (rate-limited to once per 60 seconds).
Until that button exists in the UI, the fix is to wait for the nightly cron, or ask your technical
person to hit `POST /api/bolt/sync-sheet-now` directly with the `DASH_SYNC_KEY`.

---

### The 💸 Incentives tab says it's "blocked" / shows no numbers
**Cause:** This is **not a bug** — it's waiting on two columns in the onboarding Google Sheet.
The dashboard deliberately shows "blocked" instead of guessing wrong bonus figures.
**Fix (data entry, in the sheet — no developer needed):**
1. **DRIVERS** tab → fill the **`Nationality`** column (`Saudi` or `Foreigner`) for each driver.
2. **AMBASSADORS** tab → fill the **`Team`** column (`Egypt` or `Saudi`) for each ambassador.

The next nightly sheet-sync (~00:45 Riyadh) mirrors the columns in, and the Incentives tab
populates automatically. Blank cells are treated as "not set" and simply stay excluded.

---

## How to manually sync a specific day

1. Open the dashboard
2. Click **⚡ Bolt Sync** in the header bar
3. Pick the date you want
4. Click Sync — data appears immediately

---

## Credentials and where they live

All credentials are stored in **Vercel → MHMBOLT project → Environment Variables**. Never stored in the code.

| Variable | What it is | Who manages it |
|---|---|---|
| `BOLT_CLIENT_ID` | Bolt Fleet API client ID | Bolt partner dashboard |
| `BOLT_CLIENT_SECRET` | Bolt Fleet API secret | Bolt partner dashboard |
| `CRON_SECRET` | Protects the midnight sync endpoint | Keep as-is, don't share |
| `SUPABASE_URL` | Database address | Supabase project settings |
| `SUPABASE_SERVICE_KEY` | Database write access (server only) | Supabase project settings |
| `SUPABASE_ANON_KEY` | Database read access (browser) | Supabase project settings |
| `DASH_SYNC_KEY` | Protects the on-demand "refresh sheet mirror now" endpoint — a separate secret from `CRON_SECRET`, so the manual button and the midnight cron can't be triggered with the same leaked key | You set this yourself (pick any long random string) |

**To update a credential:** Vercel → MHMBOLT → Environment Variables → click ··· → Edit → save → Redeploy.

---

## How to redeploy after a settings change

1. Go to **vercel.com → MHMBOLT → Deployments**
2. Click **···** on the latest deployment → **Redeploy**
3. Wait ~15 seconds for the green "Ready" status

---

## Emergency contacts / accounts

| Service | URL | Login |
|---|---|---|
| Vercel (hosting) | vercel.com | (your login) |
| Supabase (database) | supabase.com | (your login) |
| GitHub (code) | github.com/Muhammedelhofy/MHMBOLT | (your login) |
| Bolt Fleet API | fleet.bolt.eu | (your login) |

---

## What to do if you need a developer

The entire codebase is at: `github.com/Muhammedelhofy/MHMBOLT`

Key files:
- `index.html` — the whole dashboard (frontend)
- `api/bolt/sync.js` — manual sync button handler
- `api/bolt/cron-sync.js` — midnight auto-sync (holds the `rosterComplete` shrink-guard)
- `api/bolt/lib.js` — shared Bolt API logic (computes `rosterComplete`)
- `api/bolt/health.js` — System Status endpoint
- `vercel.json` — cron schedule configuration
- `BOLT_STORAGE_HEALTH.md` — storage-model reference: how the day-history (`khair_history`) is ordered and how the roster + blocked counts derive from the latest full nightly-cron day, plus the partial-failure shrink-guard (commit `abf9480`). The old top-level `h`/`fmt` keys were dead legacy and have been pruned — ignore any reference to them.

---

# HANDOFF — the full picture (added v5.4, 2026-07-07)

*Everything above is the "how do I keep it running" reference. This section is the "understand the
whole machine + take it over" handoff. Read it once end-to-end.*

## The system in one picture — what talks to what

There are **four pieces**:

1. **Bolt Fleet API** (Bolt's servers) — the source of driver / ride / earnings data. The dashboard
   logs in with `BOLT_CLIENT_ID` + `BOLT_CLIENT_SECRET` and pulls automatically each night.
2. **Google Sheet `Bolt_Activation_Master`** — the onboarding pipeline + ambassador list (you and
   the sales team maintain it). The dashboard reads specific tabs from it: **DRIVERS, AMBASSADORS,
   STAGE LOG, STAGE SNAPSHOT** (matched by column *name*, not letter).
3. **Supabase** (cloud database, project `ltqpoupferwituusxwal`, table `fleet_data`) — the single
   store. One row (`id = 'fleet'`) holds the entire dataset as one blob; a backup row is written
   before every overwrite. *(The real day history lives under the `khair_history` key, newest day
   first — see `BOLT_STORAGE_HEALTH.md`.)*
4. **Vercel** (hosting) — runs the website (`index.html`) **and** the automatic nightly jobs.

**What happens every night (Riyadh time):**

| Time | Job (file) | What it pulls |
|---|---|---|
| **00:00** | `cron-sync.js` | Yesterday's drivers / rides / earnings from the **Bolt API** → Supabase |
| **00:30** | `sync-stage-log.js` | The onboarding **STAGE LOG** from the Google Sheet → Supabase |
| **00:45** | `sync-sheet.js` | The **DRIVERS + AMBASSADORS** tabs from the Google Sheet → Supabase |

Any device that opens the dashboard then reads the latest from Supabase. *(Vercel's free plan can
start these up to ~1 hour late — that's normal, not a fault.)*

**Automatic vs. manual:**
- **Automatic:** the 3 nightly pulls above.
- **Manual (you):** upload the **monthly** "Earnings per driver" CSV for finalized money (see Known
  Quirks #1), optionally a daily Bolt CSV for same-day numbers, and normal clicking in the dashboard.

## Operating routine — what to check, in what order

**Daily (2 minutes)** — open the dashboard → **Today**:
1. Read the top cards: bonus projection · Needs-a-push · Blocked · Active today.
2. Click **Blocked** → work the unblock queue (each reactivated driver = money back on).
3. Click **Needs a push** / **Do next** → the ranked chase list (who to message, worth in SAR).

**Weekly:**
- **Command Center** (the strategy deck) → ambassadors working, tier ladder, growth.
- In the Google Sheet, fill any missing driver **Nationality** (DRIVERS tab) + ambassador **Team**
  (AMBASSADORS tab) — the 💸 Incentives tab stays blank until these exist.

**Monthly (money — important):**
- Download Bolt's monthly **"Earnings per driver"** CSV (all drivers, 1st→end of month) →
  **Settings → Bolt Bonus Split → Upload Bolt bonus**. This becomes the **official finalized** money
  for the month (it captures campaign bonuses the daily sync can't — see Known Quirks #1).
- Reconcile the closed month.

> [FILL IN — Muhammad: any daily/weekly checks you do that AREN'T on the dashboard: supplier calls,
> cash collection, car swaps, etc.]

## The sales team's sheet automation ("other-team" sync)

Separate from the dashboard: the **CALL LIST** tab in `Bolt_Activation_Master` is where the sales
team calls leads. Automations keep it honest:
- **Live Status columns (L / M / N)** — formulas pulling each driver's real status + amount-due into
  the call list so sales see the true state.
- **`bolt_pendingon_autosync.gs`** — a small Apps Script installed in the sheet (10-minute trigger)
  that writes each driver's real stage into the hand-typed "Pending On" column so it matches the
  driver tab. It runs itself; nothing to do.
- **Key fact:** the dashboard's sheet-sync crons read DRIVERS / AMBASSADORS / STAGE tabs and **never
  the CALL LIST** — so edits there are invisible to the dashboard. The two systems are independent;
  a break in one doesn't break the other.

> [FILL IN — Muhammad: who on the sales team owns this sheet after you leave, and their contact.]

## Known quirks / gotchas — these are NOT bugs, don't "fix" them

1. **Campaign/bonus earnings need the monthly CSV.** Bolt's API only returns *per-ride* money, not
   campaign bonuses — a driver can earn a bonus with **zero rides** (e.g. 250 SAR / 0 trips), which
   the nightly sync structurally cannot see. The **monthly "Earnings per driver" CSV upload is the
   required source** for campaign money and finalized totals. (Confirmed 2026-07-07 — the API has no
   campaign endpoint.)
2. **Suspended drivers show 0 trips in Bolt's CSV.** Bolt zeroes a suspended driver's finished-rides
   / online-time in the *downloaded CSV* even though they earned money — so the dashboard shows 0
   trips while Bolt's *live portal* shows more (e.g. Ali Ahmed). That's Bolt disagreeing with itself;
   the dashboard faithfully mirrors the CSV. Not a dashboard fault.
3. **"Clean duplicate rows" (Blocks tab)** is safe to click anytime — it collapses duplicate *open*
   block rows (about **29** right now) and leaves a permanent tombstone so they can't come back from
   another device's stale copy.
4. **A deploy can silently not go live.** Vercel's auto-deploy webhook has occasionally missed a
   push. After ANY code change, confirm the live site actually updated (hard-refresh Ctrl+Shift+R; if
   unsure, redeploy from Vercel → Deployments → ··· → Redeploy).
5. **The 02–04 Jul 2026 days are short (67 drivers).** A one-off pre-fix scar; harmless and
   self-heals forward. No action.

## Before you leave — capture + clean exit

**Write these down (only you have them):**
- [FILL IN] Driver onboarding process — the stages, and who does each step.
- [FILL IN] Real per-car cost numbers — rental, insurance, maintenance, plates.
- [FILL IN] Contacts / suppliers — Bolt account manager, car supplier, workshop, etc.
- [FILL IN] Anything you rely on that isn't in the dashboard.

**Exit week — turn the nightly jobs off cleanly:**
- Vercel → MHMBOLT → the 3 crons in `vercel.json` (`cron-sync`, `sync-stage-log`, `sync-sheet`).
  Disable them at exit so they don't run headless and error once your Bolt credentials lapse.
- These feed **both** the dashboard **and** M8's fleet lane. Stopping them is **expected** — M8's
  fleet lane is designed to freeze read-only (a staleness-dated archive) when the crons stop, so it
  won't "break," it will just stop updating. This is intentional, not something to avoid.
