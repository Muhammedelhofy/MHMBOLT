# Bolt Google-Sheet FINALIZE — Audit, Map & Fixes
**Date:** 2026-07-06 · **Session:** Opus · high · **Scope:** the Apps Script automation only
(`Claude/Projects/Ops Automation/*.gs`). The dashboard repo and M8 repo were **not** touched.
**Mode:** read-only audit + additive local doc/comment edits. **Nothing is deployed** — every `.gs`
change reaches the live sheet only when *you* paste it; the paste + verify steps are in §6.

---

## 0 · TL;DR (lead with the answer)

1. **The funnel is healthy and already heavily automated.** Two front doors (Form + Call List) feed
   `DRIVERS`; Khaled runs the pipeline via the Stage dropdown; two 10-minute syncs auto-advance
   drivers using Bolt's Block and CS exchange sheets; queues + stage-log + the Supabase mirror all
   ride off the `Stage` column. Map in §2.
2. **🔴 The brief's item #2 was based on a wrong assumption — I did NOT act on it.** The
   `1leCVYn…` / `1toHLYi…` IDs in `bolt_ops_master.gs` are **NOT stale copies of the master.** They
   are two **live, separate exchange sheets owned by Bolt's block & CS teams**, edited within the
   last 24h. **Repointing them to `17-GC…` would have broken the entire Block/CS funnel.** Proof in §3.
3. **The real "stale/footgun" risk is 4 old `.gs` files** that could be re-pasted by mistake and
   re-introduce the duplicate-Driver-ID bug. I banner-marked them DO-NOT-PASTE (§4).
4. **Handoff-proofing done (additive, safe):** do-not-repoint note in the master config;
   `PROCESS_MAP.md` trued-up to the live 14 stages; `AGENTS.md` rewritten as a file map.
5. **🔴 You have 3 quick things to confirm** (each ~1 min, from the menu) so we can call the syncs
   "verified live," not just "verified in code." §6.

---

## 1 · What I read (basis for every claim)

- All 8 `.gs` files in `Ops Automation/` (master = 2,770 lines; menu; stage-log module; 2 form
  scripts; helpers; template).
- `PROCESS_MAP.md`, `APPLY_FIX_README.md`, `STAGE_LOG_PASTE_INSTRUCTIONS.md`, the two finalize briefs
  + `BOLT_ARCHITECTURE_REVIEW_2026-07-04.md` §4 (the dashboard-facing contract).
- **Live Google Drive metadata + content** for the master and both exchange sheets (real proof, §3).

---

## 2 · The funnel, mapped end-to-end

```
  FRONT DOOR A — FORM                         FRONT DOOR B — CALL LIST
  (ambassador referrals)                      (Omar's outbound: Block / High-Perf / Street lists)
  onFormSubmit  [master §1, locked]           syncCallListActive  [10-min trigger]
      │ dedupe by Iqama/phone                      │ caller sets "Pending On" = a handoff status
      │ auto Barbary-fleet check                   │   "Iqama Received - To Transfer" → Transfer Request
      ▼                                            │   "Iqama Received - Needs Unblock" → Block Check
  new DRIVERS row @ "Fleet Check"  ◄─────────────┘   (writes Nationality + Block Reason across too)
      │  (or "Fleet Check - Verify" / "Already exists in other fleet" from the Barbary check)
      ▼
  ┌──────────────── DRIVERS pipeline (Stage col H = the one switch) ────────────────┐
  │  Fleet Check → Block Check ─(syncBlockSheet, 10-min)─► "Bolt support VIP" sheet   │
  │                    ▲  read-back: F ✓ → Transfer Request │ note in G → Cannot Unblock
  │  Transfer Request ─(syncCSSheet, 10-min)─► "شيت الاستعلام" sheet                  │
  │                    ▲  read-back: G ✓ → Docs Collection │ debt/H → Transfer Hold   │
  │  Docs Collection → Istimara Authorization → Submitted to Bolt → Notify Driver → Active
  └──────────────────────────────────────────────────────────────────────────────────┘
      │                         │                              │
   KHALED - QUEUE            OMAR - QUEUE                 STAGE LOG / SNAPSHOT
   (back-end pipeline)       (front-end + close/notify)   (onEdit + 10-min reconcile)
      └──────────────┬───────────────┘                        │
                     ▼                                         ▼
     Vercel crons (dashboard repo, DO NOT TOUCH):  DRIVERS→sheet_ambassador_sync ·
     AMBASSADORS→ambassadors · STAGE LOG/SNAPSHOT→sheet_stage_* → Supabase → dashboard
```

**Owners (per `PROCESS_MAP.md`, confirmed):** Omar = front end (find/contact/qualify/notify);
Khaled = back end (fleet/block/transfer/docs/submit/activate). The 3-stage Khaled∩Omar overlap
(Transfer Request, Transfer Hold, Blocked-Cannot-Unblock) is **intentional collaboration**, not a bug.

**Real-workflow note I found in the live form data:** Omar frequently submits the **Form** for
drivers he sourced from the **Call List** (many rows note "جي من كولز" = "came from Calls"). So the
two front doors partly converge through the form — worth knowing, not a problem.

---

## 3 · 🔴 The "stale sheet reference" finding — corrected, with proof

The dashboard brief said: *"bolt_ops_master.gs / ops_template.gs point at 1leCVYn… / 1toHLYi… which
are NOT the live master (17-GC…) → retire/repoint."* **That reasoning is wrong, and acting on it
would have broken production.** Those two IDs were never meant to be the master. From the master's own
config + `PROCESS_MAP.md`, they are the **Phase-2a Block** and **Phase-2b CS** exchange sheets.

I verified all three against live Google Drive:

| ID (in code) | Real title | Owner | Modified | What it is |
|---|---|---|---|---|
| `17-GC…` | **Bolt_Activation_Master** | mohamed.elhofy@elkhair-elwaffer (you) | **2026-07-06** | the master ✅ |
| `1toHLYi…` | **"Bolt support VIP"** | emadpasuony2000 (Bolt block team) | 2026-07-05 | Block exchange sheet |
| `1leCVYn…` | **"MOHM x BOLT — شيت الاستعلام"** | m0h3m.ksa.10 (Bolt CS team) | 2026-07-05 | CS/transfer exchange sheet |

I also read the **Block sheet's live content**: its headers are exactly
`تاريخ | اسم السائق | رقم الجوال | رقم الهوية | سبب الحظر | الاجراء(TRUE/FALSE) | ملاحظات` — i.e. the
precise columns `syncBlockSheet` pushes into and reads verdicts from. It is the Bolt block team's
actively-maintained suspension sheet. **Definitively live, definitively separate from the master.**

**What I did instead of repointing:** added a `⚠ DO NOT REPOINT` comment right above the two IDs in
`bolt_ops_master.gs`, so no future review (human or automated) repeats the mistake. **Behaviour
unchanged.**

> Cross-workstream FYI for the dashboard side (Blocks tab #5): the *rich, specific* block reason the
> dashboard wants ("سائق مختلف", "حظر سلامه", "شكاوي عملاء"…) lives in this Block sheet's cols E/G.
> The sheet only pulls it back to `DRIVERS` on a *cannot-unblock*; on an unblock it stamps
> "Unblocked ✅". If the dashboard wants the real reason for every driver, that's a small read-back
> enhancement to spec later — flagging, not doing (out of scope for this session).

---

## 4 · Dead code / footgun files (the actual cleanup)

Kept in the folder for history, but any of these pasted into the LIVE project would break it. I added
a `⛔ SUPERSEDED / DO NOT PASTE` banner to the top of each (comment only — code untouched, reversible):

| File | Why it's dangerous if pasted | Verdict |
|---|---|---|
| `bolt_form_script_FORM_VERSION.gs` | Old **form-bound** onFormSubmit. If its trigger is still on, every submission is processed **twice** → the duplicate Driver-ID bug. | ⛔ banner + **🔴 confirm its Form trigger is OFF** (§6) |
| `bolt_form_to_master.gs` | Old sheet-bound onFormSubmit; re-declares onFormSubmit + helpers → "already declared" error. | ⛔ banner |
| `bolt_ops_helpers.gs` | addDropdowns/dailyDigest now in the master → duplicate declaration; also counts **retired** stage names (would show all-zero queues). | ⛔ banner |
| `bolt_ops_template.gs` | New-team scaffold, **behind** the master (placeholder CS id → crash; old 16-stage list). | ⚠ "reference only" banner |

**Also confirmed (not a bug, just a rule):** the STAGE LOG code exists both inside `bolt_ops_master.gs`
("12) STAGE LOG") and as standalone `STAGE_LOG_MODULE.gs`. It must live in **exactly one** place in
the live project — if you ever full-replace the master while a separate `StageLog.gs` also exists,
you'll get a duplicate-declaration error. (This is already documented in `STAGE_LOG_PASTE_INSTRUCTIONS.md`.)

---

## 5 · Data-contract check (dashboard must keep matching)

The Vercel syncs read specific tab + column names. **My edits changed none of them** — I touched only
comments and docs. For the record, the contract the sheet must keep honouring:

| Tab | Columns the dashboard depends on | Status |
|---|---|---|
| `DRIVERS` | `Driver ID`, `Full Name`, `Phone`, `Source / Ambassador`, `Nationality`, `Stage` (col H) | ✅ intact; **never insert a column left of H** (Iqama=C, Stage=H are position-locked by queue/snapshot formulas) |
| `AMBASSADORS` | `Name`, `Aliases`, `Active`, `Team` | ✅ intact |
| `STAGE LOG` | `When, Driver ID, Full Name, Iqama, From Stage, To Stage, Days in From-Stage, Source, Editor` | ✅ written exactly by the module |
| `STAGE SNAPSHOT` | `Driver ID, Iqama, Full Name, Current Stage, Entered Current Stage At` | ✅ |

**Known data gaps (data entry, not code — unchanged since the arch review):** `DRIVERS.Nationality`
partly blank (~33/136 filled; auto-sync from the call list fills more every 30 min) and there is
obvious **test/junk** in the form responses (`test`, `0000000000`, `hasdh`, `عبد الرحمن السيد
11111111111`) that created junk DRIVERS rows — a likely contributor to the dashboard's 87-vs-97 count
gap. Cleaning those is a data task for you, done narrowly.

---

## 6 · 🔴 Your verification steps (so "live" is proven, not assumed)

I can't run Apps Script functions (they only run in your editor). Three quick checks — open the sheet,
use the **🚗 Bolt Ops** menu (or the editor's Run dropdown):

1. **Block + CS sync fire** → editor → run **`debugBlockSync`**, then **`debugCSSync`**. Each pops a
   popup listing every driver currently at Block Check / Transfer Request and what the exchange sheet
   says for them. Healthy = it finds the drivers and reads the sheet (no "NOT FOUND" for ones you know
   are there). *These are read-only.*
2. **Stage-log is live** → menu → **"Onboarding stage-log health check"** (`stageLogStatus`). Healthy =
   both triggers **ON** and STAGE LOG row count > 0. (Memory notes it was verified live 2026-07-05.)
3. **No silent stalls** → menu → **"⚠ Check: handoffs stuck with no Iqama"** (`checkStuckNoIqama`).
   Healthy = "All clear". Anything listed = add the Iqama on that row; the next 10-min sync pushes it.

**Plus the one form check:** Google **Form → ⋮ → Apps Script → Triggers** — confirm there is **no**
`onFormSubmit` trigger left on the form side (only the master/spreadsheet-side one should exist). If
one is there, delete it — that's the old double-write path.

If all four look right, the sheet half is fully verified end-to-end.

---

## 7 · What I changed (all additive, all local until you paste)

| File | Change | Reaches live when… |
|---|---|---|
| `bolt_ops_master.gs` | `⚠ DO NOT REPOINT` comment above the exchange-sheet IDs | your next full re-paste of the master (no urgency — comment only) |
| `bolt_form_*` / `bolt_ops_helpers.gs` / `bolt_ops_template.gs` | `⛔ SUPERSEDED / DO NOT PASTE` banners | n/a — these should never be pasted |
| `PROCESS_MAP.md` | trued-up to the live 14 stages + logged the 2026-06-29 change + a v6 finalize entry | it's a doc — already current |
| `AGENTS.md` | rewritten as a file map + the do-not-repoint rule for future sessions | it's a doc — already current |
| `BOLT_SHEET_FINALIZE_REPORT.md` | this report | — |

**No function, trigger, column, tab, or sheet data was changed. Nothing deployed.**

---

## 8 · Orientation map + what's next

**🟢 Safe / done (docs & comments):** funnel mapped, stale-ref finding corrected + defended in-code,
footgun files banner-marked, PROCESS_MAP + AGENTS trued-up.
**🔴 Needs you (~5 min total):** the 4 verification checks in §6.
**🟢 Optional, later, out of this session's scope:**
- Dashboard-side: pull the *specific* block reason from the Block sheet into every driver (see §3 note).
- Data hygiene: delete the test/junk form rows + their junk DRIVERS rows (helps the 87-vs-97 gap).
- Finish `DRIVERS.Nationality` backfill (auto-sync already chips away every 30 min).

**Decision for you (not code):** the Khaled∩Omar queue overlap on Transfer Request / Transfer Hold /
Blocked-Cannot-Unblock is intentional per the process map — leave as-is unless you want Omar's queue
trimmed to just his close/notify stages. Say the word and it's a 2-line queue-formula tweak.
