# MOHM Fleet Dashboard — Operator Runbook

**Last updated:** 2026-06-20  
**Version:** v5.0  
**Dashboard URL:** your Vercel production URL (mhmbolt.vercel.app or custom domain)

---

## How the system works (plain English)

- The dashboard is a website hosted on **Vercel** (free cloud hosting).
- Driver data is fetched automatically every night at **midnight Riyadh time** from the Bolt API.
- All data is stored in **Supabase** (cloud database) — any device that opens the dashboard URL sees the same data.
- A daily backup of all data is saved automatically before every overwrite.

---

## Daily routine — what happens automatically

| Time (Riyadh) | What happens |
|---|---|
| Midnight | Auto-sync pulls today's data from Bolt → saves to Supabase |
| Any time | Open the dashboard — data loads automatically |

You do not need to do anything daily. The system runs itself.

---

## How to check if everything is working

1. Open the dashboard
2. Click the **Settings** tab (top right)
3. Look at the **System Status** card

You will see:
- **Bolt API connected** ✓ — Bolt credentials are working
- **Supabase connected** ✓ — Database is reachable
- **Last auto-sync: [date/time] — X drivers, Y orders** ✓ — Midnight sync ran successfully

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
- `api/bolt/cron-sync.js` — midnight auto-sync
- `api/bolt/lib.js` — shared Bolt API logic
- `api/bolt/health.js` — System Status endpoint
- `vercel.json` — cron schedule configuration
