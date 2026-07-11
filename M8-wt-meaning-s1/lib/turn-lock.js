/**
 * lib/turn-lock.js — E1 Turn Integrity, Layer 3 (per-session in-flight lock).
 *
 * Build contract: M8/E1_TURN_INTEGRITY_SPEC.md (§P1).
 *
 * PURPOSE: reduce the FREQUENCY of same-session write conflicts by serializing
 * a session's turns — a second request for a sessionId already in flight gets a
 * friendly "still working" reply instead of racing the first. This is HYGIENE,
 * not correctness: correctness lives at Layer 1 (the partial unique indexes +
 * CAS writes in memory.js / notebook.js). If this table is down or the kill
 * flag is off, Layer 1 still guarantees no duplicate is_current rows.
 *
 * DOCTRINE (matches the rest of M8's side-channels):
 *   - FAIL-OPEN: any infra error (Supabase down, timeout) → treat as acquired.
 *     The lock must NEVER take down chat.
 *   - Kill flag M8_TURN_LOCK=off (or "0") → skip acquire/release entirely.
 *   - Crash-safety = TTL takeover, not release: if a handler dies before
 *     releasing, the next turn takes over the expired row.
 *
 * WIRING (see the delegation trap in the spec): this is called from the HTTP
 * handlers ONLY (api/chat.js, api/chat-stream.js), each of which runs exactly
 * once per request. NEVER call it inside orchestrate()/orchestrateStream() —
 * orchestrateStream delegates non-streamable turns back into orchestrate(),
 * so a lock there would self-block on every delegated stream turn.
 */
const { createClient } = require("@supabase/supabase-js");

const TABLE   = "m8_turn_locks";
// TTL: the fleet path's function budget is 180s; +margin so a legitimately slow
// turn is never treated as crashed. A truly dead handler's row is taken over
// after this window.
const TTL_MS  = parseInt(process.env.M8_TURN_LOCK_TTL_MS || "200000", 10);

function _client() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

function lockEnabled() {
  const v = String(process.env.M8_TURN_LOCK || "").trim().toLowerCase();
  return v !== "off" && v !== "0";
}

// Sessions that must NEVER take a lock: the eval harness + battery/odysseus/L5
// probe runs may parallelize deliberately and must not fight over a per-session
// row (their ids are stable per-suite, not per-turn). Mirrors the union of
// memory.js isEphemeralSession (/^eval/i) and inferSourceType's probe prefixes.
function isLockExempt(sessionId) {
  return /^(?:eval|l5_|eval_|od_|battery_)/i.test(String(sessionId || ""));
}

/**
 * PURE (PS-mirror target). Given the EXISTING lock row and the current time,
 * decide whether a contending request may take the lock over or must wait.
 *   - expired row (expires_at strictly in the past) → "takeover"
 *   - still-valid row (expires_at >= now, incl. the exact boundary) → "busy"
 * A missing/!expires_at row is treated as takeover-able (defensive; the normal
 * path never calls this without a row).
 */
function lockDecision(existingRow, nowMs) {
  const exp = existingRow && existingRow.expires_at ? Date.parse(existingRow.expires_at) : NaN;
  if (!Number.isFinite(exp)) return "takeover";
  return exp < nowMs ? "takeover" : "busy";
}

/**
 * acquireTurnLock(sessionId) → { acquired, skipped?, failOpen?, busy? }
 *   acquired:true  → proceed with the turn (also skipped/failOpen cases).
 *   acquired:false, busy:true → another turn for this session is in flight.
 * NEVER throws.
 */
async function acquireTurnLock(sessionId) {
  if (!lockEnabled() || isLockExempt(sessionId) || !sessionId) {
    return { acquired: true, skipped: true };
  }
  try {
    const db = _client();
    const now = Date.now();
    const expiresAt = new Date(now + TTL_MS).toISOString();

    // (1) Try a fresh insert — the common case (no turn in flight).
    const ins = await db.from(TABLE).insert({
      session_id: sessionId,
      acquired_at: new Date(now).toISOString(),
      expires_at: expiresAt,
    });
    if (!ins.error) return { acquired: true };

    // (2) Insert failed. A unique violation (23505) means a row already exists →
    // decide takeover vs busy. Any OTHER error → fail open (hygiene, not a gate).
    const code = ins.error.code || "";
    const msg  = ins.error.message || "";
    const isUniqueViolation = code === "23505" || /duplicate key|already exists/i.test(msg);
    if (!isUniqueViolation) {
      console.error("[M8 turn-lock] insert error (fail-open):", msg);
      return { acquired: true, failOpen: true };
    }

    const existing = await db.from(TABLE).select("session_id, expires_at").eq("session_id", sessionId).single();
    if (existing.error) {
      console.error("[M8 turn-lock] read-after-conflict error (fail-open):", existing.error.message);
      return { acquired: true, failOpen: true };
    }
    if (lockDecision(existing.data, Date.now()) === "busy") {
      return { acquired: false, busy: true };
    }

    // (3) The existing row is expired → CAS-take it over. The `expires_at < now`
    // guard means only ONE contender wins if several race for an expired lock.
    const takeover = await db.from(TABLE)
      .update({ acquired_at: new Date().toISOString(), expires_at: new Date(Date.now() + TTL_MS).toISOString() })
      .eq("session_id", sessionId)
      .lt("expires_at", new Date().toISOString())
      .select("session_id");
    if (takeover.error) {
      console.error("[M8 turn-lock] takeover error (fail-open):", takeover.error.message);
      return { acquired: true, failOpen: true };
    }
    if (Array.isArray(takeover.data) && takeover.data.length > 0) {
      return { acquired: true, tookOver: true };
    }
    // 0 rows updated → another contender won the takeover between our read and
    // our update → we are busy.
    return { acquired: false, busy: true };
  } catch (err) {
    console.error("[M8 turn-lock] acquire exception (fail-open):", err && err.message);
    return { acquired: true, failOpen: true };
  }
}

/**
 * releaseTurnLock(sessionId) — best-effort DELETE. Call in a `finally`.
 * Crash-safety does NOT depend on this (TTL takeover covers a dead handler).
 * NEVER throws.
 */
async function releaseTurnLock(sessionId) {
  if (!lockEnabled() || isLockExempt(sessionId) || !sessionId) return;
  try {
    await _client().from(TABLE).delete().eq("session_id", sessionId);
  } catch (err) {
    console.error("[M8 turn-lock] release error (non-fatal):", err && err.message);
  }
}

// The friendly busy reply — a 200-shaped normal message, never a red error.
const BUSY_MESSAGE =
  "⏳ I'm still working on your previous message — give it a few seconds and try again.";

module.exports = {
  acquireTurnLock,
  releaseTurnLock,
  lockDecision,       // pure — PS-mirror target
  isLockExempt,       // pure
  lockEnabled,
  BUSY_MESSAGE,
  TABLE,
};
