/**
 * Build-179 — lib/context-signal.js  (context-rank)
 *
 * The COMPOSE-TIME memory selector. B-178 fixed the packet LAYOUT (cacheable
 * static head first) + added usage/cache telemetry. B-179 fixes WHAT memory
 * reaches the model: instead of injecting ~30-40 recency-capped rows every turn
 * (the drift surface — Muhammad's #1 daily pain), a pure ranker picks FEWER,
 * HIGHER-SIGNAL rows, budgeted per lane, with the graph substituting for raw
 * near-duplicate rows.
 *
 * Everything here is PURE (no IO, no DB, no LLM) so it runs at BOTH compose
 * sites (orchestrate + orchestrateStream) where the lane is finally known, and
 * so the whole thing mirrors 1:1 into the PS-5.1 offline test battery.
 *
 * DOCTRINE (spec §3 D3/D4/D5, non-negotiable):
 *   - Lane-fit uses STRUCTURAL fields only (memory_type / role / trust /
 *     created_at / similarity). NEVER a content regex — the no-keyword-lane rule
 *     is absolute. The only "content" touch is Jaccard word-overlap dedupe
 *     against ALREADY-INJECTED graph lines (D4), which is a similarity measure,
 *     not a routing keyword.
 *   - PINNED, never dropped: all `profile` rows (Build-140 — "Sara is your wife"
 *     survives any budget) and all `contradiction_flag` rows (the CONFLICT note
 *     reads the selected set; dropping a flagged row would silently kill the
 *     clarify behaviour).
 *   - Every mechanism is individually env-killable; OFF == today, byte-identical.
 *
 * Kill switches (all default ON):
 *   M8_RECALL_RANK   — off → selectMemoryForLane is a pass-through (recall trims as today)
 *   M8_CTX_BUDGETS   — off → flat 4,500-char budget, all lanes
 *   M8_HH_GATE       — off → household roster injected every turn (today)
 *   M8_GRAPH_RECALL  — off → no dedupe/substitution
 *   M8_RECALL_BUDGET_<LANE> — per-lane rendered-char override (soak tuning, step 7)
 */

// Reuse the Build-84 Jaccard primitive — the exact dedupe the spec asks for,
// already unit-tested. No second implementation (mergeEvidence's twin).
const { wordSet, jaccard } = require("./answer-engine");

// ── scoring constants ─────────────────────────────────────────────────────────
const SIM_NEUTRAL_PRIOR = 0.35;   // no similarity + no keyword score → neutral lean
const SIM_KEYWORD_NORM  = 8;      // keyword _score (0..~15) → 0..1 (relevanceScore = match count)
const NONPROFILE_ROW_CAP = 14;    // D5: at most 14 non-pinned rows survive
const FLAT_BUDGET = 4500;         // M8_CTX_BUDGETS=off → the B-169e flat budget

// D5 per-lane rendered-char budgets (non-profile MEM). fleet/finance carry
// deterministic packets whose OWN system rule says "memory always loses to the
// data block" — so memory there is drift surface, not signal → tighter budget.
const LANE_BUDGETS = {
  fleet: 1800, finance: 1800,
  web: 3000, general: 3000,
  knowledge: 2400, research: 2400, notebook: 2400,
};

// D3 freshness half-lives (days) by structural memory_type.
const HALF_LIFE_DAYS = { operational: 45, summary: 21, raw: 14 };

const DAY_MS = 86400000;

function _envOff(name) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "off" || v === "0";
}
function recallRankEnabled() { return !_envOff("M8_RECALL_RANK"); }
function ctxBudgetsEnabled() { return !_envOff("M8_CTX_BUDGETS"); }
function hhGateEnabled()     { return !_envOff("M8_HH_GATE"); }
function graphRecallEnabled(){ return !_envOff("M8_GRAPH_RECALL"); }
// Amendment A1: one-way Obsidian-vault ingest. UNLIKE the others this defaults
// OFF — enabling it sends vault note TEXT (not just numbers) to the LLM providers,
// so it is a conscious privacy opt-in, never a silent default. Vault rows, once
// ingested, rank through the SAME D3 similarity/trust/FRESHNESS selector — the
// freshness half-life is what flags a stale local copy (the vault is refreshed,
// not live-mounted; Vercel can't read his PC). See tools/vault-ingest.js.
function vaultIngestEnabled() {
  const v = String(process.env.M8_VAULT_INGEST || "").trim().toLowerCase();
  return v === "on" || v === "1" || v === "true";
}

function _clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }
function _nowMs(now) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "number" && isFinite(now)) return now;
  return Date.now();
}

/** Strip the "stream:" telemetry prefix so both compose sites map to one budget. */
function normalizeLane(lane) {
  return String(lane || "general").toLowerCase().replace(/^stream:/, "").trim();
}

/** Structural half-life: operational rows age slowest, summaries next, raw turns fastest. */
function halfLifeDays(row) {
  if (!row) return HALF_LIFE_DAYS.raw;
  if (row.memory_type === "operational") return HALF_LIFE_DAYS.operational;
  if (row.memory_type === "summary" || row.role === "summary") return HALF_LIFE_DAYS.summary;
  return HALF_LIFE_DAYS.raw;
}

/** Is this row PINNED (never dropped by rank OR dedupe)? profile + contradiction. */
function isPinnedRow(row) {
  return !!row && (row.memory_type === "profile" || !!row.contradiction_flag);
}

/**
 * scoreRow(row, now) → number. PURE, per-row (no batch coupling).
 *   score = 2.0·sim + 1.0·(trust/4) + 1.0·fresh + 0.5·(importance−1)/4
 *   fresh = 1/(1 + ageDays/halfLife)
 *   sim   = row.similarity (RPC cosine) when present, else normalized keyword
 *           _score, else the 0.35 neutral prior.
 * Higher = keep. Weights per spec D3.
 */
function scoreRow(row, now) {
  if (!row) return 0;
  const nowMs = _nowMs(now);

  let sim;
  if (typeof row.similarity === "number" && isFinite(row.similarity)) sim = row.similarity;
  else if (typeof row._score === "number" && isFinite(row._score)) sim = row._score / SIM_KEYWORD_NORM;
  else sim = SIM_NEUTRAL_PRIOR;
  sim = _clamp(sim, 0, 1);

  const trust = _clamp((Number(row.trust_level) || 0) / 4, 0, 1);

  const created = row.created_at ? new Date(row.created_at).getTime() : nowMs;
  const ageDays = Math.max(0, (nowMs - (isFinite(created) ? created : nowMs)) / DAY_MS);
  const fresh = 1 / (1 + ageDays / halfLifeDays(row));

  const imp = _clamp(Number(row.importance) || 1, 1, 5);
  const importance = (imp - 1) / 4;

  return 2.0 * sim + 1.0 * trust + 1.0 * fresh + 0.5 * importance;
}

// ── rendered-char accounting (fixes the B-168 "MEM 5,155 vs 4,500 budget" lie) ──
// The buffered site renders each row as: `${provTag} ${line}` joined by "\n".
//   provTag: "[✓ verified]"(12) | "[~ inferred]"(12) | "[? low-trust]"(13)
//   line:    "• "(2)+content (summary) | "M8: "(4)+content | "Muhammed: "(10)+content
// renderedLen counts tag+space+prefix+content+newline so budgets bind on the
// REAL packet cost, not content-only. Kept numeric (no ✓/• literals) so the
// PS-5.1 ASCII mirror computes the identical integer.
function _provTagLen(trust) {
  const t = trust == null ? 4 : trust;
  return t >= 4 ? 12 : t >= 3 ? 12 : 13;
}
function _linePrefixLen(row) {
  if (row.role === "summary") return 2;       // "• "
  return row.role === "assistant" ? 4 : 10;   // "M8: " | "Muhammed: "
}
function renderedLen(row) {
  if (!row) return 0;
  const contentLen = typeof row.content === "string" ? row.content.length : 0;
  return _provTagLen(row.trust_level) + 1 + _linePrefixLen(row) + contentLen + 1;
}

/** The exact injected line for a row — shared by BOTH compose sites so the
 *  stream header stops drifting from the buffered one (spec §1.1 fix). */
function renderMemoryRow(row) {
  const trust = row.trust_level == null ? 4 : row.trust_level;
  const provTag = trust >= 4 ? "[✓ verified]" : trust >= 3 ? "[~ inferred]" : "[? low-trust]";
  const line = row.role === "summary"
    ? `• ${row.content}`
    : `${row.role === "assistant" ? "M8" : "Muhammed"}: ${row.content}`;
  return `${provTag} ${line}`;
}

/**
 * laneBudget(lane) → rendered-char budget for NON-profile memory on this lane.
 *   M8_CTX_BUDGETS=off → FLAT_BUDGET (4,500) for every lane.
 *   M8_RECALL_BUDGET_<LANE> (e.g. M8_RECALL_BUDGET_FLEET=1200) overrides a lane.
 */
function laneBudget(lane) {
  if (!ctxBudgetsEnabled()) return FLAT_BUDGET;
  const key = normalizeLane(lane);
  const ov = parseInt(process.env["M8_RECALL_BUDGET_" + key.toUpperCase()] || "", 10);
  if (Number.isFinite(ov) && ov > 0) return ov;
  return LANE_BUDGETS[key] != null ? LANE_BUDGETS[key] : FLAT_BUDGET;
}

/**
 * selectMemoryForLane(rows, lane, now, opts) → the survivors, in the caller's
 * original (chronological) order. PURE.
 *
 *   1. PIN profile + contradiction rows (never dropped, never counted vs budget).
 *   2. Score the rest; sort by score desc (newer wins ties).
 *   3. Admit row-by-row while it fits the lane's RENDERED-char budget and the
 *      14-row non-profile cap (first-fit: a too-big row is skipped, a smaller
 *      later row may still fit).
 *
 * opts: { budget, rowCap, rankEnabled } — all optional (env-driven defaults).
 * When rank is OFF this is a pass-through (returns rows unchanged) so the
 * kill-switch is a true identity.
 */
function selectMemoryForLane(rows, lane, now, opts) {
  const o = opts || {};
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const rankOn = o.rankEnabled != null ? o.rankEnabled : recallRankEnabled();
  if (!rankOn) return list;

  const budget = o.budget != null ? o.budget : laneBudget(lane);
  const rowCap = o.rowCap != null ? o.rowCap : NONPROFILE_ROW_CAP;
  const nowMs = _nowMs(now);

  const pinned = [];
  const candidates = [];
  for (const r of list) (isPinnedRow(r) ? pinned : candidates).push(r);

  const scored = candidates
    .map((r) => ({ r, s: scoreRow(r, nowMs) }))
    .sort((a, b) => (b.s - a.s) || (new Date(b.r.created_at || 0) - new Date(a.r.created_at || 0)));

  const keep = new Set(pinned);
  let used = 0, n = 0;
  for (const { r } of scored) {
    if (n >= rowCap) break;
    const c = renderedLen(r);
    if (budget > 0 && used + c > budget) continue;   // first-fit skip, not stop
    keep.add(r);
    used += c;
    n++;
  }
  return list.filter((r) => keep.has(r));
}

/**
 * dedupeAgainstBlocks(rows, blockLines, opts) → rows with Tier-2 near-duplicates
 * of an already-injected graph line removed (D4a). PURE.
 *
 * A Tier-2 row (NOT profile/operational/contradiction) whose content word-set
 * overlaps any graph/entity/card/evidence line at Jaccard ≥ threshold (0.5,
 * same bar as mergeEvidence) is dropped — the compact graph line already carries
 * that signal, so the raw row is pure tokens. Tier-1 identity rows and pinned
 * rows are NEVER touched.
 *
 * blockLines: array of strings OR one newline-joined string (the assembled
 * ENT/CARD/BRIDGE/EVID text — already in hand, so NO second DB query).
 */
function dedupeAgainstBlocks(rows, blockLines, opts) {
  const o = opts || {};
  const threshold = typeof o.threshold === "number" ? o.threshold : 0.5;
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const lines = Array.isArray(blockLines)
    ? blockLines
    : (typeof blockLines === "string" ? blockLines.split("\n") : []);
  const lineSets = lines.map((l) => wordSet(l)).filter((s) => s.size > 0);
  if (!lineSets.length) return list;

  return list.filter((r) => {
    // Tier-1 identity + pinned rows are never dedupe-dropped.
    if (isPinnedRow(r) || r.memory_type === "operational") return true;
    const ws = wordSet(r.content || "");
    if (ws.size === 0) return true;
    for (const ls of lineSets) if (jaccard(ws, ls) >= threshold) return false;
    return true;
  });
}

/**
 * householdGate({domain, message, recentTurns, roster, entityCardPersonal}) →
 * boolean: should the household roster be injected THIS turn? PURE, STRUCTURAL.
 *
 *   (i)   arbiter domain is wallet/money, OR
 *   (ii)  a roster NAME (his own Family-Wallet members — a list match against his
 *         data, NOT a hardcoded keyword) appears in the message or last 2 turns, OR
 *   (iii) the entity-card PERSON path fired (knownPersonCard — the compose site's
 *         "answer ONLY from HOUSEHOLD + RELEVANT MEMORY" directive needs the roster).
 *
 * NOTE: the M8_HH_GATE kill-switch lives at the CALL SITE (`!hhGateEnabled() ||
 * householdGate(...)`) so this function stays purely the i/ii/iii decision.
 */
function householdGate(args) {
  const a = args || {};
  const domain = String(a.domain || "").toLowerCase();
  if (domain === "wallet" || domain === "money") return true;        // (i)
  if (a.entityCardPersonal) return true;                             // (iii)
  const roster = Array.isArray(a.roster) ? a.roster : [];
  if (roster.length) {                                               // (ii)
    const parts = [String(a.message || "")];
    const rt = Array.isArray(a.recentTurns) ? a.recentTurns.slice(-2) : [];
    for (const t of rt) parts.push(typeof t === "string" ? t : (t && t.content) || "");
    const blob = " " + parts.join(" \n ").toLowerCase() + " ";
    for (const name of roster) {
      const nm = String(name || "").trim().toLowerCase();
      if (nm.length < 2) continue;
      // word-boundary-ish match against his roster list (not a routing regex).
      if (blob.indexOf(" " + nm + " ") !== -1 ||
          blob.indexOf(" " + nm + ",") !== -1 ||
          blob.indexOf(" " + nm + "'") !== -1 ||
          blob.indexOf(" " + nm + ".") !== -1) return true;
    }
  }
  return false;
}

module.exports = {
  // pure core (PS-mirrored)
  scoreRow,
  laneBudget,
  selectMemoryForLane,
  dedupeAgainstBlocks,
  householdGate,
  renderedLen,
  renderMemoryRow,
  halfLifeDays,
  normalizeLane,
  isPinnedRow,
  // env gates
  recallRankEnabled,
  ctxBudgetsEnabled,
  hhGateEnabled,
  graphRecallEnabled,
  vaultIngestEnabled,
  // constants (exported for tests + the replay probe)
  LANE_BUDGETS,
  HALF_LIFE_DAYS,
  NONPROFILE_ROW_CAP,
  FLAT_BUDGET,
  SIM_NEUTRAL_PRIOR,
  SIM_KEYWORD_NORM,
};
