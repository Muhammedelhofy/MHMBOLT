# Live test — Custom Driver Data Export (Reports & Export, tab 2)

Run against your REAL data: `./serve.ps1` → http://localhost:3000 → **Finance** tab.

## 0 · Nothing new appeared on the page
- [ ] The Finance header still has exactly **4** buttons.
- [ ] The green one now reads **📊 Reports & Export** (it used to read "End of Month Report"), same position, same colour.

## 1 · The old report is untouched
- [ ] Click **📊 Reports & Export** → it opens **on the End of Month tab**, showing the same table as before.
- [ ] Month dropdown works, **⬇ Export CSV** produces the same file as it always did:
      header `No.,Account Holder Name,Email,Mobile Number,Month Net Earning (SAR),Date of 1st Trip`, TOTAL row at the bottom.
- [ ] If anything about this tab differs from before, **stop** — the whole point is that it did not change.

## 2 · Date range
- [ ] Switch to **🧾 Custom Export**.
- [ ] Preset chips: This month / Last month / Last 7 days / Last 30 days / All time / Custom.
- [ ] The blue coverage line states real numbers: N uploaded periods, M days of data, actual span, driver count, total net.
- [ ] Pick **Custom** and set From/To by hand — the coverage line updates.
- [ ] Set To *earlier* than From — they swap instead of erroring.
- [ ] **If you ever uploaded a multi-day Bolt file** (period shows `X → Y`) and your range cuts through it,
      an amber warning says it was included IN FULL and the "actual span" is wider than what you asked for.
      This is correct: a multi-day file has no per-day numbers inside it to slice.

## 3 · Columns
- [ ] 8 group checkboxes, each showing its column count. Unticking one shrinks the "N selected" figure.
- [ ] Tick **🏦 Company P&L** → an amber note appears naming the whole calendar month(s) those figures are summed over.
- [ ] Untick everything → Identity stays on (the file can never end up with zero columns).
- [ ] Close and reopen the modal → your column choices are remembered.

## 4 · The rows are right
- [ ] Preview shows the top 10 by net, rank 1 first.
- [ ] A driver you know is **suspended** shows Status = Suspended.
- [ ] A driver who **left the fleet** shows Status = Left Fleet (untick "Include left-fleet drivers" → he disappears).
- [ ] A driver with **0 earnings** in the range is present (untick "Include drivers who earned 0" → he disappears).
- [ ] A driver you tagged to an ambassador shows that ambassador's name.
- [ ] **Δ %** compares against the equal-length window immediately before your range. On the earliest data you have, it is blank — correct, there is nothing before it.

## 5 · The files
- [ ] **⬇ Excel (.xlsx)** downloads `MOHM_Fleet_Export_<from>_to_<to>.xlsx`.
  - [ ] 3 sheets: **Drivers** · **Summary** · **By Ambassador**.
  - [ ] Drivers sheet has a filter dropdown on every header.
  - [ ] Money columns are real numbers — select a column and Excel shows a SUM in the status bar.
  - [ ] Summary separates **Range** (what you asked for) from **Actual data span** (what the data covers).
  - [ ] By Ambassador rolls up drivers referred / earning / left fleet / total net / avg per driver.
- [ ] **⬇ CSV** downloads the same driver table, with a 5-line header block above it.
  - [ ] Arabic names and the `Δ` symbol are readable in Excel (UTF-8 BOM is written).

## 6 · Freshness
- [ ] Upload a new daily CSV, reopen the export → the new day is included (the first-trip/tenure index resets on every save).

## 7 · The Captains shortcut
Go to the **Captains** tab. A single small **⬇** sits at the right-hand end of the control row.

- [ ] It's there in all three views (By Captain / By Day / Compare Days) and nowhere else — no other new buttons.
- [ ] Set **Period → Last 7**, click **⬇** → the modal opens straight on **Custom Export**, From/To already filled with those 7 days, and a green line reads
      *"Dates prefilled from the Captains tab — By Captain · <month> · Last 7"*.
- [ ] Set **Filter → Current** and click ⬇ → "Include left-fleet drivers" comes up **unticked** (Current = the fleet minus leavers).
- [ ] Set **Filter → Left Fleet** and click ⬇ → an amber line admits the export has no "left-fleet only" mode and covers the whole fleet.
- [ ] Type something in the captain **search box**, click ⬇ → an amber line says the search is **not** applied.
- [ ] Pick a few **non-adjacent days** from the day dropdown / period pills, click ⬇ → an amber line says those days don't sit back-to-back and the export covers the whole span between them.
- [ ] Change the range yourself (a preset chip, or the date pickers) → the green "prefilled from Captains" line **disappears**, because it no longer describes what you're looking at.
- [ ] Open the modal from the **Finance** button instead → no Captains line, and it lands on **End of Month** as always.

## 8 · Ambassador filter (Captains tab)
In **Captains → By Captain**, the Filter group now ends with **Ambassador · 🎖 Any ▾**.

- [ ] With nothing picked the toolbar looks exactly as it did before — one extra pill, no tag row, no second line.
- [ ] Open it: every ambassador who has captains in the selected days, each with a **count** on the right.
- [ ] Tick one → the table narrows to his captains, the pill reads **🎖 1 selected**, and a removable tag appears.
- [ ] **Tick a second and a third without reopening the menu** — it must stay open the whole time. This is the point of the control.
- [ ] Type in the menu's search box, then tick a result → your search text is still there afterwards.
- [ ] Untick from the menu, or click a tag's ✕, or the **✕** button next to the pill → all three narrow/clear correctly.
- [ ] Click anywhere outside → the menu closes and your selection is kept.
- [ ] Pick an ambassador, then narrow **Period** until none of his captains worked → a clear "No captains for …" panel with a working *clear the ambassador filter* link (not a blank table).
- [ ] Switch to **By Day** / **Compare Days** → the dropdown is gone (there is no captain list to filter there).
- [ ] With ambassadors picked, click **⬇** → the export admits the ambassador filter is not applied and points you at the Ambassador column.

## Known and intentional
- **Ambassador Team** and **Nationality** are only as complete as the onboarding sheet. Blanks here are a to-do list, not a bug.
- **Company P&L** is summed over whole calendar months, never pro-rated into the range — rents and salaries are monthly figures.
- **Consistency %** = active days ÷ uploaded periods in the range.
- **Tenure** falls back to first appearance for a driver who has never completed a trip; **1st Trip (ever)** stays blank for him.
