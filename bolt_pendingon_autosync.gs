/**
 * Bolt Activation — "Pending On" auto-sync   (2026-07-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Keeps the CALL LIST "Pending On" column (H) following the driver's real
 * onboarding stage from the DRIVERS tab — so a lead your sales team handed off as
 * "iqama received transfer / iqama received block check" then automatically
 * follows the driver tab (Block Check → Transfer Request → Transfer Hold →
 * Active / Blocked …), instead of sitting on a stale hand-typed value.
 *
 * WHAT IT TOUCHES  — only CALL LIST column H, and ONLY for rows whose Iqama (col I)
 *   matches a driver in DRIVERS that ALREADY has an onboarding stage. A lead sales
 *   is still calling (no iqama / not in DRIVERS yet), or one they marked "refused",
 *   is LEFT ALONE — the sales team's typing is preserved.
 *
 * WHY A SCRIPT, NOT A FORMULA  — sales type into column H, so a formula there would
 *   erase their entries. A script only rewrites the rows that have progressed.
 *
 * WHY THE FUNNEL STILL WORKS  — the stages are mapped to your existing funnel words
 *   (Transfer Requested / Iqama received / On fleet / Converted / Dropped), and
 *   pre-onboarding rows (To Call / Reached / Considering / Agreed / refused) are
 *   never touched — so every CALL-FUNNEL count keeps counting. Only "Transfer Hold"
 *   and "Block Check" are new words (added so a held/checking lead is visible); give
 *   them their own funnel row if you want them counted, otherwise they just show.
 *
 * INSTALL (one time)
 *   1. Sheet → Extensions → Apps Script.
 *   2. Add a new script file, paste this in (or append to bolt_ops_master).
 *   3. Run `syncPendingOnFromStage` once and authorise it — that back-fills now.
 *   4. ⏰ Triggers → Add trigger → function `syncPendingOnFromStage`,
 *      event = Time-driven → Hour timer → every 1 hour.  (No existing trigger
 *      needs pausing — this joins them.)
 *   5. (Optional, for instant updates) call syncPendingOnFromStage() at the end of
 *      whatever function already advances a driver's stage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Config (verified against Bolt_Activation_Master, 2026-07-07 — re-check the
//    column letters if the sheet layout ever changes) ───────────────────────────
var CL_SHEET       = 'CALL LIST';
var DR_SHEET       = 'DRIVERS';
var CL_IQAMA_COL   = 9;   // CALL LIST  I  — Iqama / National ID  (the match key)
var CL_PENDING_COL = 8;   // CALL LIST  H  — Pending On           (the column we update)
var CL_FIRST_ROW   = 2;   // row 1 = headers
var DR_IQAMA_COL   = 3;   // DRIVERS    C  — Iqama
var DR_STAGE_COL   = 8;   // DRIVERS    H  — Driver Stage

// Onboarding stage  →  what "Pending On" should show.
// Left side = the driver-tab stage; right side = the word in the call list.
// Most map to your existing funnel words so the funnel keeps counting; "Transfer
// Hold" / "Block Check" are kept distinct so a held/checking lead is visible.
// Want it to read the stage VERBATIM instead? just set right = left.
var STAGE_TO_PENDING = {
  'Fleet Check':                    'Block Check',
  'Fleet Check - Verify':           'Block Check',
  'Block Check':                    'Block Check',
  'Transfer Request':               'Transfer Requested',
  'Transfer Hold':                  'Transfer Hold',
  'Docs Collection':                'Iqama received',
  'Istimara Authorization':         'Iqama received',
  'Submitted to Bolt':              'On fleet',
  'Notify Driver':                  'On fleet',
  'Active':                         'Converted',
  'Blocked - Cannot Unblock':       'Blocked - Cannot Unblock',
  'Closed - Blocked':               'Closed - Blocked',
  'Already exists in other fleet':  'Already exists in other fleet',
  'Rejected':                       'Rejected'
};

// Values in "Pending On" that are the sales team's FINAL say — never overwritten,
// even if the driver later gets a stage (respects a human veto). Case-insensitive,
// matched as a substring.
var PENDING_LOCKED = ['refus', 'do not call', 'dnc'];

function syncPendingOnFromStage() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cl = ss.getSheetByName(CL_SHEET);
  var dr = ss.getSheetByName(DR_SHEET);
  if (!cl || !dr) throw new Error('Missing sheet "' + CL_SHEET + '" or "' + DR_SHEET + '"');

  // 1) DRIVERS → { iqama : stage }  (the source of truth)
  var drLast = dr.getLastRow();
  if (drLast < 2) return 0;
  var drIq = dr.getRange(2, DR_IQAMA_COL, drLast - 1, 1).getValues();
  var drSt = dr.getRange(2, DR_STAGE_COL, drLast - 1, 1).getValues();
  var stageByIqama = {};
  for (var i = 0; i < drIq.length; i++) {
    var k = posNormIqama(drIq[i][0]);
    var s = String(drSt[i][0] || '').trim();
    if (k && s) stageByIqama[k] = s;   // a later row wins on a duplicate iqama
  }

  // 2) Walk CALL LIST; rewrite H only where the driver has a stage, the row isn't
  //    locked, and the value would actually change (no needless writes).
  var clLast = cl.getLastRow();
  if (clLast < CL_FIRST_ROW) return 0;
  var n        = clLast - CL_FIRST_ROW + 1;
  var iqamas   = cl.getRange(CL_FIRST_ROW, CL_IQAMA_COL,   n, 1).getValues();
  var pendRng  = cl.getRange(CL_FIRST_ROW, CL_PENDING_COL, n, 1);
  var pend     = pendRng.getValues();

  var changed = 0;
  for (var r = 0; r < n; r++) {
    var key = posNormIqama(iqamas[r][0]);
    if (!key) continue;                                   // no iqama → sales still working it
    var stage = stageByIqama[key];
    if (!stage) continue;                                 // not in DRIVERS yet → leave sales' value
    var cur = String(pend[r][0] || '');
    if (posIsLocked(cur)) continue;                          // sales said "refused" etc. → respect it
    var want = STAGE_TO_PENDING.hasOwnProperty(stage) ? STAGE_TO_PENDING[stage] : stage;
    if (cur.trim() !== want) { pend[r][0] = want; changed++; }
  }
  if (changed > 0) pendRng.setValues(pend);
  Logger.log('Pending On sync: ' + changed + ' row(s) updated.');
  return changed;
}

// Iqama may be a number or text with stray spaces — normalise both sides so
// 1010080453 (number) and "1010080453 " (text) match.
function posNormIqama(v) {
  return (v === null || v === undefined) ? '' : String(v).replace(/\s+/g, '').trim();
}
function posIsLocked(v) {
  var s = String(v || '').toLowerCase();
  for (var i = 0; i < PENDING_LOCKED.length; i++) if (s.indexOf(PENDING_LOCKED[i]) !== -1) return true;
  return false;
}

// ── Sales re-queue (CALL LIST → DRIVERS)  (2026-07-07) ────────────────────────
// The OTHER direction: lets a sales agent — working only in the CALL LIST — re-queue
// a paid "Transfer Hold" driver themselves, without phoning Khaled. When they set
// that driver's "Pending On" to a re-queue word, this writes "Transfer Request" into
// the DRIVERS stage → which fires your EXISTING onboarding automation that routes them
// back to the CS sheet, exactly like Khaled changing it by hand.
//
// ⚠️ This is the ONE part that writes into your onboarding pipeline, so it's guarded
// tightly: it only acts on the CALL LIST "Pending On" column, only when the driver is
// currently "Transfer Hold", and only on the specific re-queue words below — a stray
// edit cannot mis-route an active or blocked driver.
//
// INSTALL: this must run as an INSTALLABLE trigger (name is NOT "onEdit" on purpose,
// so it coexists with bolt_ops_master's own onEdit). ⏰ Triggers → Add trigger →
// function `onCallListReQueue` → event source = From spreadsheet → event type = On edit → Save.
//
// ⚠️ TEST FIRST (see chat): only trust it once you've re-queued ONE real driver from the
// call list and confirmed they actually LANDED in the CS sheet — that proves your routing
// responds to a script-driven stage change, not only to manual typing.

var REQUEUE_TRIGGERS    = ['transfer request', 'transfer requested', 'iqama received transfer'];
var REQUEUE_FROM_STAGES = ['Transfer Hold'];    // only re-queue a HELD driver (add others if you want)
var REQUEUE_TO_STAGE    = 'Transfer Request';   // must be the stage that auto-routes to CS

function onCallListReQueue(e) {
  try {
    if (!e || !e.range || e.value == null) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== CL_SHEET) return;                 // CALL LIST only
    if (e.range.getColumn() !== CL_PENDING_COL) return;    // "Pending On" (H) only
    if (e.range.getRow() < CL_FIRST_ROW) return;
    if (REQUEUE_TRIGGERS.indexOf(String(e.value).trim().toLowerCase()) === -1) return;

    var iqama = posNormIqama(sh.getRange(e.range.getRow(), CL_IQAMA_COL).getValue());
    if (!iqama) return;

    var dr = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DR_SHEET);
    var last = dr.getLastRow();
    if (last < 2) return;
    var drIq = dr.getRange(2, DR_IQAMA_COL, last - 1, 1).getValues();
    var drRow = -1;
    for (var i = 0; i < drIq.length; i++) { if (posNormIqama(drIq[i][0]) === iqama) { drRow = i + 2; break; } }
    if (drRow === -1) return;                               // not in DRIVERS → nothing to re-queue

    var stageCell = dr.getRange(drRow, DR_STAGE_COL);
    var cur = String(stageCell.getValue() || '').trim();
    if (REQUEUE_FROM_STAGES.indexOf(cur) === -1) return;    // only re-queue a HELD driver (safety)

    stageCell.setValue(REQUEUE_TO_STAGE);                   // → fires your CS-routing automation
    Logger.log('Re-queued iqama ' + iqama + ': ' + cur + ' -> ' + REQUEUE_TO_STAGE);
  } catch (err) {
    Logger.log('onCallListReQueue error: ' + err);
  }
}

// ── Instant DRIVERS → CALL LIST  (2026-07-08) ─────────────────────────────────
// Makes the "Pending On" mirror fire THE MOMENT a Driver Stage changes, instead of
// waiting up to an hour for syncPendingOnFromStage. Same mapping, same safety rails
// (locked "refused/dnc" rows untouched, only rows whose Iqama matches). The hourly
// job stays on as a safety net — this just kills the lag for the row you just edited.
//
// INSTALL: add a SECOND installable trigger (leave onCallListReQueue's alone):
//   ⏰ Triggers → Add trigger → function `onDriverStageEdit`
//   → event source = From spreadsheet → event type = On edit → Save.
//
// (Why not a shorter timer? Google's minimum time-trigger is ~1 minute AND time
//  triggers can run late — an onEdit is truly instant and cheaper.)

function onDriverStageEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== DR_SHEET) return;                 // DRIVERS only

    // Did the edit touch the Driver Stage column (H)? (handles multi-cell paste too)
    if (DR_STAGE_COL < e.range.getColumn() || DR_STAGE_COL > e.range.getLastColumn()) return;
    var r1 = Math.max(e.range.getRow(), 2);                 // skip header
    var r2 = e.range.getLastRow();
    if (r2 < 2) return;

    var ss = e.source || SpreadsheetApp.getActiveSpreadsheet();
    var cl = ss.getSheetByName(CL_SHEET);
    if (!cl) return;

    // CALL LIST Iqama index (read once)
    var clLast = cl.getLastRow();
    if (clLast < CL_FIRST_ROW) return;
    var nCl  = clLast - CL_FIRST_ROW + 1;
    var clIq = cl.getRange(CL_FIRST_ROW, CL_IQAMA_COL, nCl, 1).getValues();

    var wrote = 0;
    for (var r = r1; r <= r2; r++) {
      var iqama = posNormIqama(sh.getRange(r, DR_IQAMA_COL).getValue());
      var stage = String(sh.getRange(r, DR_STAGE_COL).getValue() || '').trim();
      if (!iqama || !stage) continue;                      // no iqama / stage cleared → leave it
      var want = STAGE_TO_PENDING.hasOwnProperty(stage) ? STAGE_TO_PENDING[stage] : stage;
      for (var i = 0; i < clIq.length; i++) {
        if (posNormIqama(clIq[i][0]) !== iqama) continue;  // match by Iqama
        var cell = cl.getRange(CL_FIRST_ROW + i, CL_PENDING_COL);
        var cur  = String(cell.getValue() || '');
        if (posIsLocked(cur)) continue;                    // sales veto ("refused") → respect it
        if (cur.trim() !== want) { cell.setValue(want); wrote++; }
      }
    }
    if (wrote > 0) Logger.log('onDriverStageEdit: ' + wrote + ' CALL LIST row(s) updated.');
  } catch (err) {
    Logger.log('onDriverStageEdit error: ' + err);
  }
}
