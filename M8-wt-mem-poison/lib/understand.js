"use strict";
/**
 * lib/understand.js — Meaning-First v3, S1 (B-192): the ONE semantic pass.
 *
 * understand(message, history) asks the free-stack LLM (Groq first, temp 0,
 * JSON mode) what the user MEANS — reference resolution + routing + "can M8
 * even do this?" in a single call — and returns the fixed structured object:
 *
 *   { reference, intent, capability,
 *     understanding_confidence, execution_confidence,
 *     reasoning_path, clarify }
 *
 * Two confidences on purpose (v3 plan): understanding_confidence = "do I know
 * what he means?"; execution_confidence = "can M8 actually DO it?". Tonight's
 * bug, "what is the remaining?" after a balance turn, is understanding≈high /
 * execution≈low (M8 tracks spending, it has NO budget model) — collapsing the
 * two is why an unanswerable question looked identical to an ununderstood one.
 *
 * S1 SCOPE — SHADOW ONLY. Nothing here may change a live answer:
 *   - The orchestrator calls startShadow() alongside the real decision; the
 *     result is ONLY compared + logged to m8_router_misses (lane understand:*).
 *   - Kill-switch M8_UNDERSTAND = shadow | on | off, default shadow. In S1 the
 *     "on" value is accepted but STILL behaves as shadow — promotion to
 *     authority for reads is S3, and it must land on measured shadow evidence.
 *
 * DOCTRINE (M8_MEANING_FIRST_V3_PLAN.md + vault ★ M8 DOCTRINE): the MEANING
 * output of understand() is tested by a SCORED FIXTURE SUITE
 * (tests/understand_fixtures_test.js) + shadow telemetry — NEVER a byte-exact
 * mirror. Only the deterministic helpers below (understandMode,
 * normalizeUnderstanding, liveLabel — pure validation/compute, no meaning)
 * carry a PS-5.1 mirror, per the mirrors-serve-compute-only rule.
 *
 * PRIVACY: the history digest sent to the provider redacts digit-runs (real
 * balances/amounts never ride along on a telemetry-only pass; the turn's shape
 * — "that was a balance answer" — survives redaction, which is all reference
 * resolution needs). The shadow LOG goes through miss-logger's redact() like
 * every other m8_router_misses row.
 */

const _capReg = require("./capability-registry");
const _llm = require("./llm");
const { logMiss } = require("./miss-logger");

// ── MODE (pure — PS-mirrored) ────────────────────────────────────────────────
// M8_UNDERSTAND: "off" | "shadow" (default) | "on" ("on" reserved for S3;
// S1 treats it as shadow so setting it early can never grant authority).
function understandMode() {
  const v = String(process.env.M8_UNDERSTAND || "").trim().toLowerCase();
  if (v === "off" || v === "0") return "off";
  if (v === "on") return "on";
  return "shadow";
}

// The capability menu = the registry's own domain list (single source) + "none".
const CAPABILITY_MENU = _capReg.DOMAINS.concat(["none"]);

// Intent verbs the normalizer accepts after the dot. Anything else is kept only
// if it's a clean word — the intent string is telemetry vocabulary, not code.
const _INTENT_RE = /^[a-z][a-z_]{1,23}(\.[a-z][a-z_]{1,23})?$/;

// ── NORMALIZE (pure — PS-mirrored) ───────────────────────────────────────────
// Deterministic validation of the model's JSON → the EXACT 7-key contract.
// This is the "understanding PROPOSES, deterministic code DISPOSES" seam:
// garbage in any field degrades safely, never throws, never invents meaning.
function _clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function _strOrNull(v, max) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || /^(null|none|n\/a)$/i.test(s)) return null;
  return s.slice(0, max || 160);
}
function normalizeUnderstanding(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  let capability = String(raw.capability || "").trim().toLowerCase();
  if (CAPABILITY_MENU.indexOf(capability) === -1) capability = "none";

  let intent = String(raw.intent || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!_INTENT_RE.test(intent)) intent = "unknown";

  const rpRaw = raw.reasoning_path;
  const rp = (rpRaw && typeof rpRaw === "object" && !Array.isArray(rpRaw)) ? rpRaw : {};
  const reasoning_path = {
    reference: _strOrNull(rp.reference, 80),
    intent:    _strOrNull(rp.intent, 40),
    because:   _strOrNull(typeof rpRaw === "string" ? rpRaw : rp.because, 160) || "",
  };

  return {
    reference:  _strOrNull(raw.reference, 160),
    intent,
    capability,
    understanding_confidence: _clamp01(raw.understanding_confidence),
    execution_confidence:     _clamp01(raw.execution_confidence),
    reasoning_path,
    clarify: raw.clarify === true || raw.clarify === "true" || raw.clarify === 1,
  };
}

// ── LIVE LABEL (pure — PS-mirrored) ──────────────────────────────────────────
// Collapse the production routing decision {arb, intent, lookup} into one
// domain label so the shadow can log agree/disagree. Telemetry approximation,
// NEVER an authority — mirrors resolveDomainRoute's precedence: an acting
// lookup soft-route wins, else a decided arbiter domain, else the registry
// intent pick, else chat.
function liveLabel(live) {
  const l = live || {};
  if (l.lookup && l.lookup.domain) return String(l.lookup.domain);
  const arbD = l.arb && l.arb.domain;
  if (arbD && arbD !== "neutral" && arbD !== "ask") return String(arbD);
  if (l.intent && l.intent.domain && l.intent.band !== "none") return String(l.intent.domain);
  return "chat";
}
// "none"⇄"chat" count as agreement: both mean "no lane executes".
function shadowAgrees(capability, label) {
  const c = capability === "none" ? "chat" : capability;
  return c === label;
}

// ── HISTORY DIGEST (pure) ────────────────────────────────────────────────────
// Last N turns, digit-runs redacted (privacy), each turn truncated. Keeps the
// SHAPE of the conversation ("M8: Your balance this month: [#] SAR") — which is
// what "it / remaining / same / left" resolve against.
const MONEY_SENTINEL = "⁣"; // invisible separator tagging wallet replies
function historyDigest(history, maxTurns, maxChars) {
  const h = Array.isArray(history) ? history : [];
  const turns = h.slice(-(maxTurns || 6));
  const out = [];
  for (const t of turns) {
    if (!t || typeof t.content !== "string") continue;
    const who = t.role === "assistant" ? "M8" : "USER";
    let c = t.content.split(MONEY_SENTINEL).join(" ");
    c = c.replace(/\d+(?:[.,]\d+)*/g, "[#]").replace(/\s+/g, " ").trim();
    if (!c) continue;
    out.push(who + ": " + c.slice(0, maxChars || 280));
  }
  return out.join("\n");
}

// ── PROMPT ───────────────────────────────────────────────────────────────────
// Composed from the registry's CAPABILITIES (single source) + the hard limits
// the honesty gate needs. Carries a worked example AND a counter-example — the
// standing build lesson: new LLM-prompt vocabulary needs one of each.
function _capabilityLines() {
  const caps = _capReg.CAPABILITIES;
  const lines = Object.keys(caps).map((d) => {
    const c = caps[d];
    const cant = (c.cantDo && c.cantDo.length) ? " CANNOT: " + c.cantDo.join("; ") + "." : "";
    return "- " + d + ": " + c.blurb + "." + cant;
  });
  // Menu domains that execute but aren't in CAPABILITIES (kept in registry DOMAINS):
  lines.push("- docs: read/summarize a document he uploaded.");
  lines.push("- memory: recall things he told M8 before.");
  lines.push("- web: search the public web (weather, scores, prices, news).");
  lines.push("- chat: plain conversation, no tool runs.");
  return lines.join("\n");
}

function buildUnderstandPrompt(message, history) {
  const digest = historyDigest(history);
  return [
    "You are the UNDERSTANDING pass of M8, Muhammad's personal assistant. You do NOT answer him.",
    "You read his message + the recent conversation and output ONLY a JSON object describing what he MEANS.",
    "",
    "M8's capabilities (capability = which lane would execute; use \"none\" if no lane fits):",
    _capabilityLines(),
    "",
    "HARD LIMITS (execution_confidence must be LOW when the ask needs one of these):",
    "- Wallet: READING spend totals/breakdowns and LOGGING expenses are fully executable (execution HIGH). What does NOT exist is a budget/income model: \"what is remaining/left (of my money/budget)\" cannot be computed (execution LOW). A \"balance\" ask IS answerable — M8 honestly reports the spend total instead (execution HIGH).",
    "- The wallet is the HOUSEHOLD wallet: a spending question about a family member by name (e.g. \"and what about Sara?\" inside a money thread) is a wallet read about that member.",
    "- Wallet cannot delete an expense from chat, and M8 never sends/transfers money.",
    "- Travel: M8 finds options and hands over booking LINKS; it never books or pays.",
    "",
    "Output JSON with EXACTLY these keys:",
    '{"reference": string|null,   // what "it/that/same/remaining/left/this budget" points to, resolved FROM THE CONVERSATION (e.g. "the wallet balance from the previous turn"); null if the message stands alone',
    ' "intent": string,           // domain.verb, e.g. "wallet.read", "tasks.add", "travel.search", "chat.reply"',
    ' "capability": string,       // ONE of: ' + CAPABILITY_MENU.join(", "),
    ' "understanding_confidence": number, // 0-1: how sure you are of what he MEANS',
    ' "execution_confidence": number,     // 0-1: how sure M8 can actually DO it with the capabilities above',
    ' "reasoning_path": {"reference": string|null, "intent": string|null, "because": string}, // short provenance, ≤20 words in "because" — NOT chain-of-thought',
    ' "clarify": boolean          // true ONLY if understanding_confidence is too low to act and M8 should ask instead',
    "}",
    "",
    "Rules:",
    "- Resolve pronouns/ellipsis against the conversation FIRST. A short follow-up almost never changes topic.",
    "- Low understanding → clarify:true. UNDERSTOOD but undoable → clarify:false, execution_confidence LOW (M8 will say it honestly). Never both guess.",
    "- A money- or action-adjacent follow-up is NEVER \"web\" (do not send his own words to a search engine).",
    "",
    'Worked example — conversation: "USER: what is my balance?" / "M8: You spent [#] SAR this month." then message: "and what is the remaining?"',
    '→ {"reference":"the wallet balance/spend total from the previous turn","intent":"wallet.read","capability":"wallet","understanding_confidence":0.95,"execution_confidence":0.1,"reasoning_path":{"reference":"previous_wallet_query","intent":"wallet.read","because":"follow-up to the balance turn; no budget model to compute remaining"},"clarify":false}',
    "",
    'Counter-example — no history, message: "what is the remaining?"',
    '→ {"reference":null,"intent":"unknown","capability":"none","understanding_confidence":0.2,"execution_confidence":0.1,"reasoning_path":{"reference":null,"intent":null,"because":"no context to resolve remaining-of-what"},"clarify":true}',
    "",
    digest ? "Conversation (digits redacted as [#]):\n" + digest : "Conversation: (none — first message)",
    "",
    "Message to understand:\n" + String(message || ""),
    "",
    "Reply with the JSON object only.",
  ].join("\n");
}

// Defensive JSON extraction: strip code fences, take first "{" → last "}".
function _parseModelJson(text) {
  let s = String(text || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { return null; }
}

// ── THE SEMANTIC PASS ────────────────────────────────────────────────────────
// Returns the normalized 7-key object, or null on any failure (shadow logs it).
// deps.generate is the injectable seam for the fixture runner / offline tests.
const UNDERSTAND_PROVIDERS = () =>
  (process.env.M8_UNDERSTAND_PROVIDERS || "groq,mistral,openrouter").trim();

async function understand(message, history, deps) {
  const gen = (deps && deps.generate) || _llm.generate;
  const meta = {};
  const text = await gen({
    systemInstruction: "You output only valid JSON. No prose, no markdown.",
    contents: [{ role: "user", parts: [{ text: buildUnderstandPrompt(message, history) }] }],
    // Free stack only, Gemini quota spared: this runs on EVERY turn in shadow.
    providerOrder: UNDERSTAND_PROVIDERS(),
    genConfig: {
      temperature: 0,
      maxOutputTokens: 500, // groqQuirks floors gpt-oss to 1024 — reasoning burn can't starve the JSON
      responseFormat: { type: "json_object" }, // OpenAI-compat constrained decoding
      responseMimeType: "application/json",    // honored if a Gemini leg ever serves it
    },
    meta,
  });
  const out = normalizeUnderstanding(_parseModelJson(text));
  if (out && deps && typeof deps.onMeta === "function") deps.onMeta(meta);
  return out;
}

// ── SHADOW (S1) ──────────────────────────────────────────────────────────────
// startShadow: fire-and-record — called by resolveDomainRoute NEXT TO the live
// decision, never awaited there. flushShadow: awaited by the HTTP handlers
// AFTER the reply bytes are sent (Vercel keeps the invocation alive until the
// handler promise settles), so the un-awaited insert can't be dropped by the
// lambda freeze — the await-un-flushed-writes gotcha — while adding zero
// latency and zero bytes to the reply.
const _pending = [];
const _MAX_PENDING = 4; // single-user system; belt-and-suspenders leak guard

function startShadow(message, history, live) {
  if (understandMode() === "off") return false;
  if (_pending.length >= _MAX_PENDING) return false;
  const t0 = Date.now();
  const p = (async () => {
    try {
      const u = await understand(message, history);
      const ms = Date.now() - t0;
      const label = liveLabel(live);
      if (!u) {
        await logMiss(message, "understand:error", "no_parse live=" + label + " " + ms + "ms");
        return;
      }
      const agree = shadowAgrees(u.capability, label);
      // ≤120 chars: confidences + clarify + reference-resolved bit + intent +
      // the live label + agreement + latency. The WHY lives in reasoning_path;
      // its "because" is folded in last and truncated first.
      const reason = (
        "uc=" + u.understanding_confidence.toFixed(2) +
        " ec=" + u.execution_confidence.toFixed(2) +
        " cl=" + (u.clarify ? 1 : 0) +
        " ref=" + (u.reference ? 1 : 0) +
        " int=" + u.intent.slice(0, 20) +
        " live=" + label +
        " agree=" + (agree ? 1 : 0) +
        " " + ms + "ms" +
        " why=" + (u.reasoning_path.because || "")
      ).slice(0, 120);
      await logMiss(message, ("understand:" + u.capability).slice(0, 40), reason);
    } catch (err) {
      try { await logMiss(message, "understand:error", String(err && err.message).slice(0, 100)); } catch (_) {}
    }
  })();
  _pending.push(p);
  return true;
}

async function flushShadow(capMs) {
  if (!_pending.length) return 0;
  const batch = _pending.splice(0, _pending.length);
  const cap = Math.max(250, Number(capMs) || 4000);
  try {
    await Promise.race([
      Promise.allSettled(batch),
      new Promise((r) => setTimeout(r, cap)),
    ]);
  } catch (_) { /* the shadow must never throw into a handler */ }
  return batch.length;
}

module.exports = {
  understand,
  startShadow,
  flushShadow,
  // pure, PS-mirrored (compute/validation only — MEANING is fixture-scored):
  understandMode,
  normalizeUnderstanding,
  liveLabel,
  shadowAgrees,
  historyDigest,
  // exported for the fixture runner + tests:
  buildUnderstandPrompt,
  CAPABILITY_MENU,
  _parseModelJson,
};
