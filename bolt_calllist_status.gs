/**
 * CALL LIST live status — SCRIPT-DRIVEN  (replaces the fragile L/M/N ARRAYFORMULAs)
 * 2026-07-08
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *   The Live Status (L) / What to do (M) / Amount Due (N) columns were live
 *   ARRAYFORMULAs. Those die the moment ANYONE types a stray value into the
 *   column — you get "#REF! / Result was not automatically expanded" and the
 *   whole column below goes dark (it happened at N1953 before, and again around
 *   row 532). A formula can't defend itself against human typing.
 *
 *   This script computes the same three columns and WRITES THEM AS PLAIN VALUES
 *   every 10 minutes. If someone types over a cell, the next run just overwrites
 *   it back. No spill, no #REF, no anchor drift. Permanent fix.
 *
 * WHAT IT WRITES (per CALL LIST row)
 *   L  Live Status    = the driver's real DRIVERS stage (matched by Iqama, then
 *                       phone — so a row with no Iqama is no longer silently blank)
 *   M  What to do      = a plain-language action for the caller, and for a hold it
 *                        shows the REAL REASON: "Owes SAR 121 — collect…" (debt)
 *                        or "Hold: الكابتن على اسطول اخر — review…" (CS note)
 *   N  Amount Due (SAR)= the wallet debt pulled LIVE from the CS/inquiry sheet
 *                        (gid 1003877151 — the same tab syncCSSheet reads, so this
 *                        also settles the المبدئي-vs-الميداني tab question: we use
 *                        the one the CS team actually fills)
 *
 * IT DOES NOT TOUCH  Pending On (H) or the funnel — those stay exactly as they are
 *   (H is the sales pipeline that bolt_pendingon_autosync mirrors; this is the
 *   always-live shadow status. They coexist by design.)
 *
 * SAFE ROLLOUT (run from the function dropdown → Run, in this order)
 *   1. previewCallListStatus()   — DRY RUN. Writes nothing. Pops a sample of what
 *                                  it WOULD put in L/M/N so you can eyeball it.
 *   2. setupCallListStatus()     — clears the broken old formulas/values out of
 *                                  L:N (and the hidden Driver-Stage engine col Q),
 *                                  then does the first real write. THIS is the
 *                                  one-time repair.
 *   3. Add the trigger:  Triggers (clock) → Add Trigger → syncCallListStatus
 *                        → Time-driven → Minutes timer → Every 10 minutes.
 *      (or just run setupCallListStatusTrigger() once — it installs it for you.)
 *
 *   Reversible: the old formulas are printed in the audit doc; nothing is deleted
 *   that can't be pasted back. Recommend re-protecting L:N afterwards (Data →
 *   Protected ranges) so typing can't get in again.
 * ─────────────────────────────────────────────────────────────────────────────
 */

var CLS_CALL_SHEET = 'CALL LIST';
var CLS_DRIVERS    = 'DRIVERS';
// CS / inquiry sheet — MUST match bolt_ops_master's CS_SHEET_ID / CS_TAB_GID.
var CLS_CS_ID      = '1leCVYn17uAsvlqueio9XhLc0yBDbv7mqw-CgOit4FK0';
var CLS_CS_GID     = 1003877151;   // tab الاستعلام الميداني (the one CS actually fills)
var CLS_FIRST_ROW  = 2;            // row 1 = headers

// ── tiny self-contained helpers (prefixed so they never clash with the master) ──
function clsDigits_(v){ return (v === null || v === undefined) ? '' : String(v).replace(/\D/g, ''); }
function clsLast9_(v){ var d = clsDigits_(v); return d.length >= 9 ? d.slice(-9) : d; }
function clsAmount_(v){ var m = String(v == null ? '' : v).match(/\d+/); return m ? m[0] : ''; }
function clsCol_(headers, name){ return headers.indexOf(name) + 1; }   // 1-based, 0 = not found

// ── the What-to-do wording (edit these strings freely — they're just labels) ────
function clsWhatToDo_(stage, cs){
  if (!stage) return '';                                             // not onboarding yet → sales still calling
  if (stage === 'Active')                        return '🟢 Activated — done';
  if (stage === 'Blocked - Cannot Unblock' ||
      stage === 'Closed - Blocked')              return '🔴 STOP — drop from list';
  if (stage === 'Already exists in other fleet') return '🔴 On another fleet — drop';
  if (stage === 'Rejected')                      return '🔴 Rejected — drop';
  if (stage === 'Transfer Hold') {
    var amt = cs ? clsAmount_(cs.debtRaw) : '';
    if (amt)             return '🟠 Owes SAR ' + amt + ' — collect, then set Transfer Request';
    if (cs && cs.note)   return '🟠 Hold: ' + cs.note + ' — review (drop or re-queue)';
    return '🟠 On hold — check with CS';
  }
  if (stage === 'Transfer Request')              return '🟡 In transfer — awaiting CS';
  if (stage === 'Block Check')                   return '🟡 Bolt block check — awaiting';
  if (stage === 'Docs Collection' ||
      stage === 'Istimara Authorization')        return '🟡 Needs docs';
  if (stage === 'Submitted to Bolt' ||
      stage === 'Notify Driver')                 return '🟡 Almost active';
  if (stage === 'Fleet Check' ||
      stage === 'Fleet Check - Verify')          return '🟡 Fleet check';
  return '🟡 ' + stage;
}

function clsCsSheet_(){
  var shs = SpreadsheetApp.openById(CLS_CS_ID).getSheets();
  for (var i = 0; i < shs.length; i++) if (shs[i].getSheetId() === CLS_CS_GID) return shs[i];
  return shs[0];
}

// ── the engine ─────────────────────────────────────────────────────────────────
function syncCallListStatus(){ return clsRun_(true);  }   // the trigger target
function previewCallListStatus(){ return clsRun_(false); } // dry run — writes nothing

function clsRun_(doWrite){
  var ss = SpreadsheetApp.getActive();
  var cl = ss.getSheetByName(CLS_CALL_SHEET);
  var dr = ss.getSheetByName(CLS_DRIVERS);
  if (!cl || !dr) throw new Error('Missing "' + CLS_CALL_SHEET + '" or "' + CLS_DRIVERS + '"');

  // CALL LIST columns by header (fall back to the known letters if a header moved)
  var clH   = cl.getRange(1, 1, 1, cl.getLastColumn()).getValues()[0];
  var cPhone = clsCol_(clH, 'Phone')                || 3;   // C
  var cIq    = clsCol_(clH, 'Iqama / National ID')  || 9;   // I
  var cLive  = clsCol_(clH, 'Live Status')          || 12;  // L
  var cWhat  = clsCol_(clH, 'What to do')           || 13;  // M
  var cAmt   = clsCol_(clH, 'Amount Due (SAR)')     || 14;  // N

  // DRIVERS → stage, keyed by BOTH iqama and phone (phone fills the no-iqama gap)
  var dH  = dr.getRange(1, 1, 1, dr.getLastColumn()).getValues()[0];
  var dIq = clsCol_(dH, 'Iqama / National ID'), dPh = clsCol_(dH, 'Phone'), dSt = clsCol_(dH, 'Stage');
  var stageByIq = {}, stageByPh = {};
  var dLast = dr.getLastRow();
  if (dLast >= 2) {
    var dv = dr.getRange(2, 1, dLast - 1, dr.getLastColumn()).getValues();
    for (var i = 0; i < dv.length; i++) {
      var st = String(dv[i][dSt - 1] || '').trim(); if (!st) continue;
      var ki = dIq ? clsDigits_(dv[i][dIq - 1]) : ''; if (ki) stageByIq[ki] = st;
      var kp = dPh ? clsLast9_(dv[i][dPh - 1]) : ''; if (kp) stageByPh[kp] = st;
    }
  }

  // CS sheet → { debt, note }, keyed by iqama and phone. Non-fatal if unreachable.
  var csByIq = {}, csByPh = {};
  try {
    var cs = clsCsSheet_();
    var csLast = Math.max(cs.getLastRow(), 1), csW = Math.max(cs.getLastColumn(), 8);
    var csAll = cs.getRange(1, 1, csLast, csW).getValues(), csHead = csAll[0] || [];
    function findCS(k1, k2){ for (var j = 0; j < csHead.length; j++){ var h = String(csHead[j]); if (h.indexOf(k1) !== -1 && (!k2 || h.indexOf(k2) !== -1)) return j; } return -1; }
    var iPh = findCS('جوال');           if (iPh   < 0) iPh   = 1;   // B رقم الجوال
    var iIq = findCS('هوية');           if (iIq   < 0) iIq   = 2;   // C رقم الهوية
    var iDe = findCS('مديون');          if (iDe   < 0) iDe   = 5;   // F المديونية
    var iNo = findCS('ملاحظ', 'بولت');  if (iNo   < 0) iNo   = 7;   // H ملاحظات بولت
    for (var r = 1; r < csAll.length; r++) {
      var rec = { debtRaw: String(csAll[r][iDe] || '').trim(), note: String(csAll[r][iNo] || '').trim() };
      if (!clsAmount_(rec.debtRaw) && !rec.note) continue;          // nothing useful on this row
      var kq = clsDigits_(csAll[r][iIq]), kp = clsLast9_(csAll[r][iPh]);
      if (kq) csByIq[kq] = rec;
      if (kp) csByPh[kp] = rec;
    }
  } catch (err) { Logger.log('CS read failed (Amount Due left blank this run): ' + err); }

  // Walk CALL LIST, compute L / M / N
  var last = cl.getLastRow();
  if (last < CLS_FIRST_ROW) return 0;
  var n       = last - CLS_FIRST_ROW + 1;
  var phones  = cl.getRange(CLS_FIRST_ROW, cPhone, n, 1).getValues();
  var iqamas  = cl.getRange(CLS_FIRST_ROW, cIq,    n, 1).getValues();
  var outL = [], outM = [], outN = [], sample = [];
  for (var r2 = 0; r2 < n; r2++) {
    var iqk = clsDigits_(iqamas[r2][0]), phk = clsLast9_(phones[r2][0]);
    var stage = (iqk && stageByIq[iqk]) || (phk && stageByPh[phk]) || '';
    var csRec = (iqk && csByIq[iqk])    || (phk && csByPh[phk])    || null;
    var amt   = csRec ? clsAmount_(csRec.debtRaw) : '';
    outL.push([stage]);
    outM.push([clsWhatToDo_(stage, csRec)]);
    outN.push([amt === '' ? '' : Number(amt)]);
    if (sample.length < 15 && (stage || amt !== '')) {
      sample.push('row ' + (r2 + CLS_FIRST_ROW) + '  ' + (stage || '(none)') + '  |  ' + clsWhatToDo_(stage, csRec) + (amt ? '  |  ' + amt : ''));
    }
  }

  if (doWrite) {
    cl.getRange(CLS_FIRST_ROW, cLive, n, 1).setValues(outL);
    cl.getRange(CLS_FIRST_ROW, cWhat, n, 1).setValues(outM);
    cl.getRange(CLS_FIRST_ROW, cAmt,  n, 1).setValues(outN);
  }
  var msg = (doWrite ? 'CALL LIST status WRITTEN' : 'PREVIEW — nothing written') + ' · ' + n + ' rows\n\n' + (sample.join('\n') || '(no onboarding statuses matched — check Iqama/phone keys)');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg.slice(0, 1400)); } catch (e) {}
  return n;
}

/* ONE-TIME repair: wipe the broken formulas/static junk out of L:N (and the hidden
 * Driver-Stage engine column Q, which the old L mirrored and is no longer needed),
 * then do the first clean write. Run this ONCE, after previewCallListStatus looks right. */
function setupCallListStatus(){
  var ss = SpreadsheetApp.getActive();
  var cl = ss.getSheetByName(CLS_CALL_SHEET);
  if (!cl) { try { SpreadsheetApp.getUi().alert('No "' + CLS_CALL_SHEET + '" tab.'); } catch (e) {} return; }
  var clH  = cl.getRange(1, 1, 1, cl.getLastColumn()).getValues()[0];
  var cLive = clsCol_(clH, 'Live Status')      || 12;
  var cAmt  = clsCol_(clH, 'Amount Due (SAR)') || 14;
  var qCol  = clsCol_(clH, 'Driver Stage');    // hidden engine col, if it still exists
  var rows  = cl.getMaxRows() - 1;

  cl.getRange(CLS_FIRST_ROW, cLive, rows, cAmt - cLive + 1).clearContent();   // clears L, M, N (contiguous)
  if (qCol) cl.getRange(CLS_FIRST_ROW, qCol, rows, 1).clearContent();          // retire the #REF engine col

  var wrote = syncCallListStatus();
  try {
    SpreadsheetApp.getUi().alert(
      'Repaired. L/M/N are now script-written values (no more ARRAYFORMULA to break).\n' +
      'Rebuilt ' + wrote + ' rows.\n\n' +
      'NEXT: install the auto-refresh — run setupCallListStatusTrigger() once,\n' +
      'then re-protect L:N (Data → Protected ranges) so typing can\'t get back in.'
    );
  } catch (e) {}
}

/* ONE-TIME: install the 10-min trigger (skips if already there). */
function setupCallListStatusTrigger(){
  var have = {}, ex = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ex.length; i++) have[ex[i].getHandlerFunction()] = true;
  if (have['syncCallListStatus']) { try { SpreadsheetApp.getUi().alert('Already ON — syncCallListStatus runs every 10 min.'); } catch (e) {} return; }
  ScriptApp.newTrigger('syncCallListStatus').timeBased().everyMinutes(10).create();
  try { SpreadsheetApp.getUi().alert('Installed: syncCallListStatus every 10 minutes.'); } catch (e) {}
}
