/**
 * lib/cas-retry.js — E1 Turn Integrity, Layer 1 shared decision (§P3).
 *
 * The PURE compare-and-swap retry decision, reused by BOTH write paths
 * (memory.js upsertFact + notebook.js persistNote) so the supersede→insert
 * retry logic is defined exactly once. PS-mirror target.
 *
 * Supersession is monotonic (a row goes current→superseded exactly once, never
 * back), so a CAS `UPDATE … WHERE id=<id-just-read> AND is_current=true` that
 * returns 0 rows means another writer superseded the row between our read and
 * our update — i.e. a lost race. Likewise a unique-index violation on INSERT
 * means another writer's current row landed first. Both are resolved by
 * restarting the read→supersede→insert cycle once; a second failure gives up
 * non-fatally (M8's never-throw posture — a dropped background fact is strictly
 * better than a duplicate or a thrown turn).
 */

const MAX_ATTEMPTS = 2;

// A Postgres/PostgREST unique-violation, by code or by the index name in the
// message. Kept liberal so either the raw 23505 or a wrapped message resolves.
function isConflict(errCode) {
  const s = String(errCode == null ? "" : errCode);
  if (s === "23505") return true;
  return /duplicate key|already exists|ux_m8_conversations_current_fact|ux_m8_research_notes_current_singleton/i.test(s);
}

/**
 * upsertRetryDecision({ phase, casRows, errCode, attempt }) → "proceed" | "retry" | "give_up"
 *
 *   phase "supersede" — after the CAS UPDATE on the prior current row:
 *       casRows > 0  → "proceed"  (won the supersede; go insert the new row)
 *       casRows == 0 → "retry" while attempts remain, else "give_up"
 *
 *   phase "insert" — after inserting the new current row:
 *       no conflict  → "proceed"  (success; the write is done)
 *       conflict     → "retry" while attempts remain, else "give_up"
 *
 * `attempt` is 1-based. A non-conflict INSERT error is a hard failure the caller
 * handles BEFORE calling this (log + return) — it is never a retry decision.
 */
function upsertRetryDecision({ phase, casRows, errCode, attempt } = {}) {
  const a = Number(attempt) || 1;
  if (phase === "supersede") {
    if (Number(casRows) > 0) return "proceed";
    return a < MAX_ATTEMPTS ? "retry" : "give_up";
  }
  if (phase === "insert") {
    if (!isConflict(errCode)) return "proceed";
    return a < MAX_ATTEMPTS ? "retry" : "give_up";
  }
  return "give_up";
}

// E1 §P3 kill flag, shared by both write paths (memory.js upsertFact +
// notebook.js persistNote): M8_CAS_WRITES=off (or "0") reverts to the pre-E1
// blind supersede+insert path. Kept for ONE build, delete next.
function casWritesEnabled() {
  const v = String(process.env.M8_CAS_WRITES || "").trim().toLowerCase();
  return v !== "off" && v !== "0";
}

module.exports = { upsertRetryDecision, isConflict, casWritesEnabled, MAX_ATTEMPTS };
