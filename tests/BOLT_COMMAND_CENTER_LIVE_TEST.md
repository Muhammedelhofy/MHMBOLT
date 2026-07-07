# Live test — Command Center + Today actionability

Run these **on the real dashboard** (prod `mhmbolt.vercel.app` after deploy, or local with your data pulled) once the branch is live. Each step = look with your own eyes; ✅ / ✍️ note anything off.

## Today tab — clickable stat cards
1. Load **Today**. Each top card should carry a small **▸** when its number is > 0: Fleet Net, Proj. Company Bonus, Needs a push, Blocked, Active · latest day. The **Tier ladder** card shows "▸ tap a band" and its 6K/5K/4K/<4K pills are tappable.
2. Click **Fleet Net** → a right-side list "Active this month · N" opens; N should equal your active-driver count. Every row shows name + tier pill + net.
3. Click a **tier pill** (say **6K**) → "6k tier · N" list; N must equal the **6K** number on the card and the Command Center / Finance 6K count.
4. Click **Needs a push** → idle drivers (*"idle · no trips"*) + below-pace drivers (*"below 4k pace"*); count = the card's number.
5. Click **Blocked** → your live-suspended drivers (should match the Blocks tab count, ~today's number).
6. Click **Active · latest day** → the drivers who actually drove on the most recent data day (title shows that day, e.g. "06 Jul").
7. In any list, **click a driver row** → the A1 driver panel opens, scoped to the month. Close it (Esc/✕) and the list is gone too.
8. Confirm the **red alert row** ("blocked on Bolt — unblock queue") still jumps to the Blocks tab as before (unchanged).

## Command Center tab (was "Star Map")
9. The tab now reads **"Command Center"** and **opens instantly** — **no "7ofy" passcode screen** at all.
10. Top of the deck = the **Company bonus hero** (ON COURSE / FINAL, big SAR number), then the stat strip (Roster · Active · In pipeline · Blocked · Ambassadors), then the tier ladder.
11. **Tier ladder** — click a coloured segment → its drivers; click the "N idle" / "N blocked" footer → those drivers.
12. **Operation funnel** — click **ACTIVATED** → the whole roster; click **EARNING** → drivers with trips; click **TIERED** → 4k+ drivers. (PIPELINE / BLOCKED still jump to their tabs.)
13. **Ambassadors working** — each row shows drivers · active% · fleet net · incentive · a ▾ slipping flag. Click a row → **that ambassador's drivers** (active/idle/blocked chip + net), each → A1; a footer link opens the full Ambassadors tab.
14. Switch **Timeframe** (a month ↔ ALL-TIME) → the hero, ladder, funnel and ambassadors panel all re-scope; drills stay scoped to the selection.
15. Toggle **light ⇄ dark** → the deck and every drill overlay stay legible in both.

## Sanity
16. Numbers unchanged vs before: the 6K/5K/4K/<4K counts still match **Finance ⇄ Today ⇄ Command Center** (this rung only added drills — it recomputes nothing).
17. No console errors on Today, Command Center, or any drill.

## Live-chat questions (paste to confirm behaviour after deploy)
- "Open Today, tap the **6K** tier pill — do the names match the 6K count on the card?"
- "Open **Command Center** — did it open **without** asking for a passcode?"
- "Is the **Company bonus** the first big card at the top of Command Center?"
- "In **Ambassadors working**, click Engy — do you see *her* drivers, each opening the driver panel?"
- "Tap **Needs a push** on Today — are the idle + below-pace drivers the ones you'd chase this week?"
