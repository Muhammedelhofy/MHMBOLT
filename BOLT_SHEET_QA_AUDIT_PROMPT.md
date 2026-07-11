# Bolt Activation Sheet — Final QA Audit (READ-ONLY)

> Paste this into a fresh session. **Fable-class model recommended** (deep, careful pass). You need the **claude-in-chrome** browser tools, with a Chrome that has the sheet open/logged in (account: mohd.hofy@gmail.com). The renderer can be laggy — retry screenshots that time out; navigate with the Name Box.

## Your job
Audit the **Bolt_Activation_Master** Google Sheet — the **CALL LIST** tab and everything it depends on — for **broken formulas, status/sync mismatches, routing/assignment problems, and data-integrity bugs**. This is a FINAL double-check before the team relies on it.

**READ-ONLY. Do NOT change any cell.** Inspect, verify against the real cells (open the formula in the formula bar — don't guess), and produce a ranked findings report with exact locations + proposed fixes. Only edit if the user explicitly says so *after* seeing the findings.

## The sheet & layout (don't re-derive this)
- **File:** Bolt_Activation_Master — `https://docs.google.com/spreadsheets/d/17-GCTaqEiCvCrcCrDvBm9DcCtljPcAJ3RpJTBkAJs0s/edit`
- **CALL LIST** (gid 210568598) columns:
  A List (Block/High Perf/Street) · B Driver Name · C **Phone** · D Nationality · (E hidden) · F Call Status · G Interest · **H Pending On** · I **Iqama/National ID** · J Follow-up · K **Caller** (sales rep) · **L Live Status** · **M What to do** · **N Amount Due (SAR)** · O Notes · P Block Reason · **Q Driver Stage (HIDDEN engine)** · R funnel labels · S funnel numbers.
- **DRIVERS tab** = source of truth for status: Iqama = **col C**, Driver Stage = **col H**. (Never insert a column left of H in DRIVERS — other formulas depend on the letters.)
- **Inquiry sheet** (separate file, source of Amount Due): `https://docs.google.com/spreadsheets/d/1leCVYn17uAsvlqueio9XhLc0yBDbv7mqw-CgOit4FK0/edit`, tab **`الاستعلام المبدئي`**, col B = phone, col F = المديونية (debt as free text like "علية مديونية -149").

## Key formulas — confirm each is intact & actually producing values
- **Q2** (hidden Driver Stage engine): `=ARRAYFORMULA(IF($I$2:$I="","",IFERROR(VLOOKUP($I$2:$I,DRIVERS!$C:$H,6,0),"")))`
- **L2** (Live Status) mirrors Q: `=ARRAYFORMULA(IF(Q2:Q="","",Q2:Q))`
- **M2** (What to do): IFS mapping of L → 🔴 STOP / 🟠 Collect due / 🟡 In progress / 🟡 Needs docs / 🟢 Activated.
- **N2** (Amount Due): `=ARRAYFORMULA(IF(C2:C="","",IFERROR(REGEXEXTRACT(VLOOKUP(C2:C,IMPORTRANGE("1leCVYn17uAsvlqueio9XhLc0yBDbv7mqw-CgOit4FK0","الاستعلام المبدئي!B:F"),5,0),"[0-9]+"),"")))`
- **Funnel (R:S):** each stage is `=COUNTIF($H$2:$H,"<stage>")` — it counts the MANUAL "Pending On" (H) pipeline. **⚠️ Do NOT propose turning H into a formula — it would zero out the funnel.**

## Checklist — report a finding for each hit
1. **Formula errors** — scan L, M, N, Q, and funnel R:S for `#REF!` `#N/A` `#ERROR!` `#VALUE!` `#NAME?`, and especially **"Array result was not expanded because it would overwrite data in …"** (a stray value blocking an ARRAYFORMULA — the known recurring bug that kills the whole column). Check the FULL column height; blockers hide near the bottom (previously found at N1953). Report the exact blocking cell.
2. **Amount Due / IMPORTRANGE** — is N returning numbers, not blank-everywhere or #REF!? Is IMPORTRANGE still authorized (no "You need to connect these sheets")? Does the inquiry tab `الاستعلام المبدئي` still exist (a rename/move silently breaks N)? Pick 3 drivers who owe (find them in the inquiry sheet col F) and confirm their CALL LIST Amount Due matches.
3. **Status sync** — pick 5 drivers that have an Iqama in CALL LIST col I; confirm L (Live Status) equals their DRIVERS col-H stage. Flag any driver who IS in DRIVERS but whose L is blank (Iqama with a leading/trailing space, text-vs-number, or a stale identity sequence).
4. **Match-key gaps** — Live Status matches by **Iqama (I)**; Amount Due matches by **phone (C)**. List drivers who have a real DRIVERS status but **no Iqama in CALL LIST col I** → their Live Status is silently blank. Flag phone stored as number vs text if it breaks the Amount Due match.
5. **"Same-page" reconciliation list** — list every driver where **Pending On (H)** disagrees with **Live Status (L)**, especially H = "Transfer Requested"/active while L = "Blocked - Cannot Unblock" or "Transfer Hold". These are leads sales might chase blindly. (Expected by design — H is pipeline, L is real status — but the team should eyeball this list and clean dead leads out of the pipeline.)
6. **Routing / assignment** — any lead with a blank **Caller (K)**? Any duplicate driver (same Iqama or same phone twice)? Any lead whose **List (A)** contradicts reality (e.g., in "High Perf" but Live Status = Blocked)?
7. **Protection** — confirm auto columns **L:N** are protected (Data → Protected sheets & ranges) so stray typing can't re-break the spills. Flag if unprotected or if the range doesn't cover L:N.
8. **Funnel sanity** — does Total contacts ≈ sum of the stage counts? Any stage counting a value that no longer appears in H?
9. **Stray/scratch cells** — scan the far-right/empty columns for leftover test formulas, stray IMPORTRANGE, or stray text.

## Output
One ranked table: **Severity (🔴 blocking / 🟠 should-fix / 🟢 FYI) · Location (tab!cell or column) · Issue · Evidence (the real formula/value you saw) · Proposed fix (exact cell + formula).**
Put the **"Same-page reconciliation list"** (item 5) in its own section.
End with a one-line verdict: is the sheet sound, or are there blocking issues to fix before relying on it?
