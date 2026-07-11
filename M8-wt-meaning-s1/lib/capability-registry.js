"use strict";
/**
 * Build-155 — lib/capability-registry.js
 *
 * THE SINGLE SOURCE OF TRUTH for "which domain does a message belong to?"
 *
 * WHY THIS EXISTS (GPT's anti-drift point, council round 2026-06-25):
 *   M8's router was keyword whack-a-mole — every new ability meant another hand-placed
 *   guard scattered across orchestrator.js, and the wallet⇄fleet decision was duplicated
 *   ~14 times. Build-152 fixed the wallet⇄fleet seam with ONE arbiter. This file
 *   generalises that idea: every domain declares its OWN ownership vocabulary + coarse
 *   actions in ONE place, so adding an ability is a registry line, not a new parser.
 *
 * GROUNDED, NOT INVENTED:
 *   Signals are lifted from patterns already shipped + proven in prod — wallet from
 *   lib/domain-arbiter.js; fleet from looksFleet (fleet.js); finance from FINANCE_RE
 *   (finance.js); tasks/notes from capabilityFallback + parseNoteCapture (orchestrator.js);
 *   docs/web/memory from classifyIntent (intentClassifier.js); driver_profile from
 *   classifyDriverProfile (Build-100); knowledge = the RAG/ask-my-docs lane (Stream 2).
 *
 * THE 11 DOMAINS (match the live lanes + tests/routing_corpus.jsonl):
 *   driver_profile · wallet · finance · fleet · tasks · notes · knowledge · memory ·
 *   docs · web · chat.
 *   - wallet  = the OWNER's personal/household money (privacy wall lives here).
 *   - finance = the BUSINESS's P&L / revenue / margins (company-level).
 *   - fleet   = driver/captain operations (earnings, utilisation, the daily brief).
 *   - knowledge = retrieval over INGESTED content (books, the owner's CV/notes via RAG).
 *   - docs    = GENERATING an artifact (a deck/report/plan).
 *   - memory  = recall of stored personal facts / entity cards.
 *
 * COARSE ACTIONS ONLY (Gemini's anti-bloat rule): read/add/edit/delete/convert/recall/
 * search/generate. NOT 50 micro-intents — small free models drop params when the menu bloats.
 *
 * PURITY / PRIVACY: scoreMessage() is PURE over the message TEXT only — no DB, no LLM, no
 * money figures, no side effects — so it is trivially mirror-testable in PowerShell (Node
 * is absent on the host). The free-LLM tie-breaker lives in domain-arbiter.classifyAll().
 *
 * THIS FILE CHANGES NO BEHAVIOUR ON ITS OWN. Build-155 wires it in DORMANT (shadow-log only)
 * behind M8_REGISTRY_ROUTER; the per-boundary flips that ACT on it are Builds 156–158.
 */

const ACTIONS = ["read", "add", "edit", "delete", "convert", "recall", "search", "generate"];

// DOMAIN ORDER = deterministic tie-break priority (lower index wins a pure tie). Most-
// specific / owned domains first so an incidental shared word doesn't steal the turn:
//   driver_profile before fleet ("driver profile" > "driver")
//   knowledge/docs/notes before fleet  ("search my notes for FLEET strategy" → notes;
//                                        "write a report on the FLEET" → docs;
//                                        "REVENUE for the fleet" → finance)
// The wallet⇄fleet money-safety contest is resolved by a dedicated rule in classifyAll,
// NOT by this order.
// Build-183: `travel` sits between memory and web — AFTER the money/write lanes (so
// "how much did I spend on my TRIP to Cairo" keeps wallet's tie-break seniority) and
// BEFORE web (so travel OWNS the flight/hotel vocab WEB_PRESENT used to catch).
const DOMAINS = ["driver_profile", "knowledge", "docs", "notes", "tasks", "wallet", "finance", "fleet", "memory", "travel", "web", "chat"];

// ── PER-DOMAIN OWNERSHIP SIGNALS (strong → score 2, present → score 1) ────────────
// Kept as standalone consts so the PowerShell mirror can copy them verbatim.

// WALLET — personal/household money. STRONG = unambiguously the owner's wallet (incl.
// payment-checks "did I pay the rent"). Wallet signals are lifted from domain-arbiter.js.
const WALLET_STRONG = /\bmy\s+(spend(?:ing)?|expenses?|wallet|budget|bills?|transactions?|money)\b|\b(?:did|do|does|how much did)\s+i\s+(?:spend|spent|pay|paid)\b|\bi\s+(?:spent|paid)\b|\bmy\s+(?:last|recent|latest)\s+(?:expenses?|transactions?|purchases?)\b|\b(?:did|have|has)\s+\w+\s+pa(?:y|id)\b|\b(?:paid|pay)\s+(?:the\s+|for\s+|my\s+|our\s+)?(?:rent|electricity|water|internet|bills?|fees?|school\s+fees?|tuition|subscription|installment)\b|مصروفي|مصاريفي|محفظتي|صرفت\s+أنا|مصروفاتي/i;
const WALLET_PRESENT = /\b(expenses?|wallet|spending|budget|bills?)\b|\bspent\b|\bspend\b(?!\s+(?:time|the\s+night|the\s+day|the\s+weekend))|محفظة|مصروف|مصاريف|ميزانيتي|فاتورة|فواتير/i;

// DRIVER_PROFILE — Build-100 driver-cost CRUD. STRONG so it wins over plain "driver"→fleet.
const DRIVER_PROFILE_STRONG = /\bdriver\s+profiles?\b|\b(?:set|update)\s+\w+(?:'s)?\s+(?:rental|salary|fuel)\b/i;

// FINANCE — the BUSINESS P&L (FINANCE_RE scope + revenue/operating-cost, which the corpus
// labels finance). Ordered before fleet so "revenue breakdown for the fleet" → finance.
const FINANCE_STRONG = /\bp\s*&\s*l\b|\bpnl\b|\bprofit\w*\b|\b(?:net\s+|gross\s+)?margin\b|\brevenue\b|\boperating\s+(?:costs?|expenses?)\b|\bcogs\b|\bcost\s+of\s+goods\s+sold\b|\b(?:marketing|advertising|ad)\s+spend\b|\bspend(?:ing)?\s+on\s+(?:marketing|ads?|advertising)\b|\bunit\s+economics\b|\bbreak[\s-]?even\b|\bbottom\s+line\b|\bcost\s+per\s+order\b|\bfinancial\s+(?:situation|health|analysis)\b/i;

// FLEET — driver/captain operations (looksFleet's scope). P&L/pnl moved to FINANCE.
const FLEET_STRONG = /\b(drivers?|captains?|couriers?|fleet|riders?)\b|سائق|سواق|كباتن|كبتن|أسطول|اسطول|سائقين|مندوب|مناديب/i;
const FLEET_PRESENT = /\b(bikes?|motorbikes?|utili[sz]ation|acceptance\s+rate|payroll|earnings|tier|bonus|cash\s+collection|morning\s+brief|daily\s+brief|fleet\s+brief|active\s+drivers?|[56]k\s+target)\b|عمولة|تحصيل/i;

// TASKS — _CAP_TASK_RE + "remind me" + "my list".
const TASK_PRESENT = /\b(tasks?|reminders?|to-?dos?)\b|\bremind\s+me\b|\b(?:on\s+)?my\s+(?:to-?do\s+)?list\b|مهمة|مهام|تذكير|ذكّرني|ذكرني/i;

// NOTES — the personal note store. STRONG = explicit capture/recall verbs (so "search my
// notes for FLEET strategy" stays notes). present from parseNoteCapture's vocabulary.
const NOTE_STRONG = /\b(?:search|check|find\s+in|look\s+in)\s+my\s+notes?\b|^\s*note\s*:|\b(?:take|make|add|leave|write|jot)\s+(?:a\s+|this\s+)?note\b|\bjot\s+(?:this\s+)?down\b/i;
const NOTE_PRESENT = /\bnotes?\b|\bnote\s+(?:that|down|about)\b|\b(?:fyi|for\s+the\s+record)\b|\bremember\s+that\b|ملاحظة|ملاحظات|دوّن|دون/i;

// KNOWLEDGE — RAG retrieval over INGESTED content (books + the owner's CV/notes, Stream 2).
// Distinct from docs (artifact generation) and notes (the quick-note store).
const KNOWLEDGE_STRONG = /\bsearch\s+my\s+(?:books?|docs?|documents?|sources?|cv|resume|knowledge)\b|\bwhat\s+(?:does|do|did)\s+[\w\s]{1,30}?\s+say\s+about\b|\baccording\s+to\s+(?:my\s+)?(?:books?|sources?|cv)\b|\bin\s+my\s+(?:cv|resume|books?|documents?)\b|\bmy\s+cv\b/i;

// MEMORY — recall of stored personal facts / entity cards / identity teaching.
const MEMORY_PRESENT = /\b(?:who\s+(?:is|was|are)|tell\s+me\s+about|what\s+do\s+(?:you|we)\s+know\s+about|do\s+you\s+(?:remember|recall)|what\s+did\s+i\s+(?:say|tell\s+you)\s+about|remind\s+me\s+(?:who|what|about))\b|\bmy\s+(?:wife|husband|brother|sister|son|daughter|mother|father|friend|colleague|boss)\b|من\s+هو|من\s+هي|وش\s+تعرف\s+عن|تذكر\s+مين|زوجتي|زوجي|أخي|اخي|أختي|اختي/i;

// DOCS — GENERATING an artifact (classifyIntent DOC). STRONG (verb+artifact) so "write me a
// report on the fleet" → docs, while "daily fleet report" (no generate verb) stays fleet.
const DOCS_STRONG = /\b(make|create|write|draft|build|generate|prepare|design|put\s+together|give\s+me|i\s+need)\b.{0,40}\b(plan|brief|summary|report|deck|slides?|presentation|proposal|outline|document|memo|agenda|one[-\s]?pager|action\s+plan|checklist)\b|\b(slide\s+deck|pitch\s+deck|power\s?point)\b/i;

// WEB — external fetch (classifyIntent LIVE_DATA/LOOKUP/NEWS + checkable-fact).
const WEB_PRESENT = /\b(weather|temperature|forecast|humidity)\b|\b(scores?|who\s+won|match(?:es)?|fixtures?|standings)\b|\b(exchange\s+rate|stock\s+price|share\s+price|price\s+of)\b|\b(flights?|hotels?|airbnb)\b|\b(latest|recent|breaking)\s+(?:news|updates?)\b|\bnews\b|\b(near(?:by|est)?|closest)\b|\bwho\s+(?:founded|owns|invented|acquired)\b|طقس|حرارة|نتيجة|من\s+فاز|سعر\s+الصرف|طيران|فندق|أخبار/i;

// TRAVEL — trip planning (Build-183). CONSOLIDATES the travel vocabulary that was
// scattered across intentClassifier LIVE_DATA, slots.js TOPICS, and WEB_PRESENT into
// ONE owned domain (B-155's contract: an ability is a registry line, not a new parser).
// STRONG = an unambiguous travel intent (travelling / flights / fly to / trip to / book
// a flight-or-hotel / itinerary + AR سفر/طيران/رحلة/حجز). PRESENT = softer travel nouns
// (hotel / trip / vacation / destination). Recognition is an OWNERSHIP signal only —
// no regex here parses a slot VALUE (that is lib/travel.js's LLM extractor). The row is
// master-gated by M8_TRAVEL_LANE in scoreMessage (off ⇒ routing byte-identical).
const TRAVEL_STRONG = /\b(?:travel|traveling|travelling|getaway|getaways)\b|\bflights?\b|\bfly(?:ing)?\s+(?:to|from|out)\b|\btrip\s+to\b|\bbook(?:ing)?\s+(?:me\s+|us\s+|him\s+|her\s+|them\s+)?(?:a\s+|my\s+|the\s+)?(?:flight|ticket|seat|hotel|trip|holiday|vacation)\b|\bitinerary\b|\bplane\s+tickets?\b|\bair\s?fares?\b|سفر|أسافر|اسافر|نسافر|مسافر|طيران|رحلة\s*طيران|تذكرة\s*طيران|تذاكر\s*طيران|حجز\s*(?:طيران|رحلة|فندق|تذكرة|فنادق)/i;
const TRAVEL_PRESENT = /\b(?:hotels?|accommodations?|hostels?|airbnb|resorts?|guesthouses?)\b|\b(?:trip|getaway|holiday|vacation|honeymoon)\b|\bdestinations?\b|\bwhere\s+(?:should|could|can)\s+(?:we|i)\s+(?:go|travel|visit)\b|فندق|فنادق|إقامة|منتجع|رحلة|إجازة|عطلة|وجهة|شهر\s*العسل/i;

const REGISTRY = {
  driver_profile: { actions: ["add", "edit", "delete", "read"], strong: DRIVER_PROFILE_STRONG },
  knowledge:      { actions: ["search", "recall"],              strong: KNOWLEDGE_STRONG },
  docs:           { actions: ["generate"],                      strong: DOCS_STRONG },
  notes:          { actions: ["add", "search", "read"],         strong: NOTE_STRONG, present: NOTE_PRESENT },
  tasks:          { actions: ["add", "edit", "delete", "read"], present: TASK_PRESENT },
  wallet:         { actions: ["read", "add", "edit", "convert"], strong: WALLET_STRONG, present: WALLET_PRESENT },
  finance:        { actions: ["read"],                          strong: FINANCE_STRONG },
  fleet:          { actions: ["read", "generate"],              strong: FLEET_STRONG, present: FLEET_PRESENT },
  memory:         { actions: ["recall", "add"],                 present: MEMORY_PRESENT },
  travel:         { actions: ["search", "read"],                strong: TRAVEL_STRONG, present: TRAVEL_PRESENT }, // B-183
  web:            { actions: ["search"],                        present: WEB_PRESENT },
  chat:           { actions: ["read"] }, // no positive signal — the no-domain fallback
};

// Build-183 — the travel lane master kill-switch (default ON). When off, scoreMessage
// zeroes the travel row so scoreMessage/pickDomain/resolveIntent are BYTE-IDENTICAL to
// pre-travel routing (the identity test). Read at call time (env is fixed per deploy).
function travelLaneEnabled() {
  const v = String(process.env.M8_TRAVEL_LANE || "").trim().toLowerCase();
  return v !== "off" && v !== "0";
}

// ── PURE SCORER ───────────────────────────────────────────────────────────────
// Score every domain from the message TEXT alone. strong→2, present→1, none→0.
function scoreMessage(message) {
  const s = String(message || "");
  const scores = {};
  for (const d of DOMAINS) {
    const def = REGISTRY[d];
    if (!def) { scores[d] = 0; continue; }
    // B-183 kill-switch: travel row is inert when M8_TRAVEL_LANE=off ⇒ score 0 can
    // never win/second, so pickDomain/resolveIntent are byte-identical to pre-travel.
    if (d === "travel" && !travelLaneEnabled()) { scores[d] = 0; continue; }
    if (def.strong && def.strong.test(s)) scores[d] = 2;
    else if (def.present && def.present.test(s)) scores[d] = 1;
    else scores[d] = 0;
  }
  return scores;
}

// ── DETERMINISTIC PICK ────────────────────────────────────────────────────────
// Choose the domain from a score map. A genuine tie between two scoring domains →
// ambiguous. All-zero → chat. DOMAINS order breaks pure ties (matches lane priority).
function pickDomain(scores) {
  let best = "chat", bestScore = 0, second = null, secondScore = 0;
  for (const d of DOMAINS) {
    const v = scores[d] || 0;
    if (v > bestScore) { second = best; secondScore = bestScore; best = d; bestScore = v; }
    else if (v > secondScore && d !== best) { second = d; secondScore = v; }
  }
  if (bestScore === 0) return { domain: "chat", confidence: 0.5, ambiguous: false, runnerUp: null, top: 0 };
  const ambiguous = secondScore === bestScore && second && second !== best;
  const confidence = ambiguous ? 0.5 : (bestScore >= 2 ? 0.9 : 0.7);
  return { domain: best, confidence, ambiguous: !!ambiguous, runnerUp: ambiguous ? second : null, top: bestScore };
}

// ── BUILD-176: THE INTENT GATE (one meaning-first decision per turn) ───────────
// resolveIntent() is the SINGLE routing decision the orchestrator threads through
// every downstream lane (behind M8_INTENT_GATE, default ON). It is PURE over
// (message, opts) — no DB, no LLM, no network — so the PS-5.1 mirror
// (tests/intent_gate_test.ps1) asserts the EXACT same logic on this Node-less host.
//
// WHY IT EXISTS: M8's routing had ~8 keyword gates re-deciding the same question,
// and the arbiter's `*_context` topic-lean (conf 0.60) stole genuinely novel turns
// ("My notes", "what does my CV say…", "what date is today" all mis-routed to fleet
// live because a 2-word turn tripped isBareFollowUp). THE FIX: a positive registry
// signal BEATS the lean. resolveIntent computes the registry pick ALWAYS, and only
// falls to the context-lean when the registry finds NOTHING (and the turn actually
// looks like an anaphoric follow-up — greetings no longer lean).
//
// The wallet⇄fleet arbiter stays SENIOR for the money-safety boundary: on a genuine
// contest, its (possibly LLM-resolved) verdict is passed in as opts.arb and adopted.
//
// opts = { fleetSignal?, memberHit?, walletRef?, fleetRef?, arb? } — the hints the
// orchestrator feeds it (looksFleet / a household-name hit / whether the last turn
// was a wallet|fleet reply / the arbitrate() result).
// returns { domain, band, confidence, runnerUp, why, scores }
//   band: "strong" (registry score 2 / conf ≥ 0.9) · "medium" (present-level or
//   ambiguous) · "weak" (context-lean only) · "none" (no signal → chat).

// DOC-READ DOMINANT (mirrors lib/domain-arbiter.js DOC_READ_DOMINANT): a read of the
// owner's OWN ingested docs is unambiguously knowledge even when a money/fleet topic
// word co-occurs ("what does my CV say about my EARNINGS" → knowledge, not wallet).
const _DOC_NOUN_RE = "(?:cv|resumes?|r\\u00e9sum\\u00e9s?|docs?|documents?|books?|sources?|knowledge\\s*base)";
const DOC_READ_DOMINANT = new RegExp(
  "\\bmy\\s+" + _DOC_NOUN_RE + "\\b[^?.!]{0,45}?\\b(?:say|says|said|states?|mentions?|shows?|covers?|includes?|about)\\b" +
  "|\\b(?:in|according\\s+to|from|search(?:ing)?|pull\\s+from|look\\s+in|check)\\s+(?:my\\s+)?" + _DOC_NOUN_RE + "\\b" +
  "|\\bwhat(?:'?s| is| are| does| do| did)?\\b[^?.!]{0,30}?\\bmy\\s+" + _DOC_NOUN_RE + "\\b",
  "i"
);

// TIGHT context-lean gate — only reached when the registry finds NO signal. Requires
// an anaphor/continuation cue + ≤7 words, so greetings ("hey M8") and novel questions
// ("what date is today") never lean on the last topic. (The old arbiter isBareFollowUp
// leaned on ANY ≤3-word turn — that is the bug this tightening removes.)
const _LEAN_CUE = /^(?:and|also|now|then|so|what\s+about|how\s+about|and\s+in|in)\b|\b(?:it|that|this|these|those|them|same|instead|too|again)\b|نفس|ده|دي|كده/i;
function _leanFollowUp(s) {
  const words = String(s || "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 7) return false;
  return _LEAN_CUE.test(s);
}

function resolveIntent(message, opts) {
  const o = opts || {};
  const s = String(message || "").trim();
  if (!s || s.length > 200) {
    return { domain: "chat", band: "none", confidence: 0.5, runnerUp: null, why: "empty_or_long", scores: {} };
  }
  const scores = scoreMessage(s);
  // Fold in the SAME prod-tuned hints the arbiter trusts (the registry can't see them).
  if (o.fleetSignal) scores.fleet = Math.max(scores.fleet || 0, 2);
  // A household name (o.memberHit) is a WALLET hint ONLY when the turn isn't an identity/
  // recall question — "who is Sara" / "is Sara my wife" are MEMORY even though Sara owns
  // the household wallet. Gate on the registry's OWN memory signal (no new vocab), so a
  // real money word ("how much did Sara spend") keeps the bump and still routes wallet.
  if (o.memberHit && !o.fleetSignal && !(scores.memory > 0)) scores.wallet = Math.max(scores.wallet || 0, 2);

  // Read-my-docs dominates before the money-safety contest (CV/book text is the topic).
  if (DOC_READ_DOMINANT.test(s)) {
    return { domain: "knowledge", band: "strong", confidence: 0.9, runnerUp: null, why: "doc_read_dominant", scores };
  }

  // WALLET⇄FLEET money-safety contest — a STRONG wallet signal wins (protect personal
  // money); else defer to the SENIOR arbiter (may have LLM-resolved it); else ASK.
  const w = scores.wallet || 0, f = scores.fleet || 0;
  if (w > 0 && f > 0) {
    if (w >= 2) return { domain: "wallet", band: "strong", confidence: 0.7, runnerUp: "fleet", why: "contest_wallet_strong", scores };
    const arb = o.arb;
    if (arb && (arb.domain === "wallet" || arb.domain === "fleet") && Number(arb.confidence) >= 0.6) {
      const band = Number(arb.confidence) >= 0.85 ? "strong" : "medium";
      return { domain: arb.domain, band, confidence: Number(arb.confidence), runnerUp: arb.domain === "wallet" ? "fleet" : "wallet", why: "arb:" + (arb.why || "llm"), scores };
    }
    return { domain: "ask", band: "medium", confidence: 0.5, runnerUp: "fleet", why: "contest_wallet_fleet", scores };
  }

  const pick = pickDomain(scores);
  if (pick.domain === "chat") {
    // No registry signal — the context-lean is the ONLY hint, tightly gated.
    if (_leanFollowUp(s)) {
      if (o.walletRef) return { domain: "wallet", band: "weak", confidence: 0.6, runnerUp: null, why: "wallet_context", scores };
      if (o.fleetRef)  return { domain: "fleet",  band: "weak", confidence: 0.6, runnerUp: null, why: "fleet_context", scores };
    }
    return { domain: "chat", band: "none", confidence: pick.confidence, runnerUp: null, why: "no_signal", scores };
  }
  let band = "medium";
  if (!pick.ambiguous) band = pick.top >= 2 ? "strong" : "medium";
  return { domain: pick.domain, band, confidence: pick.confidence, runnerUp: pick.runnerUp, why: pick.ambiguous ? "contest" : "registry", scores };
}

// ── MEANING-FIRST v2 (S2 step 1): CAPABILITIES — the SINGLE capability source ──
// spec §4.4. Per domain: `label`/`blurb` = the human prompt line; `canDo`/`cantDo`
// = the machine-readable honesty facts the claim-audit deny-check reads. The
// abilities prompt is COMPOSED from this at module load, so it can never drift from
// the registry again (fixes G6) and honesty runs in BOTH directions (deny-nothing-
// real, promise-nothing-fake). Order = prompt order. Composed once ⇒ still a static
// constant per deploy ⇒ the B-178 static-head cache is unaffected.
const CAPABILITIES = {
  tasks:          { label: "Reminders & tasks", blurb: 'add, list, complete, snooze, delete (e.g. "remind me to call the bank tomorrow", "what\'s on my list?")',
                    canDo: ["add a reminder/task", "list open tasks", "mark a task done", "edit/rate a task"], cantDo: [] },
  wallet:         { label: "Wallet", blurb: 'log, edit, and total his personal/household expenses (e.g. "add 50 sar lunch", "how much did I spend this month?")',
                    canDo: ["add/log an expense", "read spending totals", "edit an expense"], cantDo: ["delete an expense from chat", "send or transfer money"] },
  fleet:          { label: "Fleet", blurb: "driver earnings, rankings, the daily brief, tiers, cash collection, projections (from his live Bolt data)",
                    canDo: ["read driver earnings/rankings/tiers", "the daily brief", "projections"], cantDo: [] },
  finance:        { label: "Business finance", blurb: "P&L, margins, unit economics",
                    canDo: ["read P&L / margins / unit economics"], cantDo: [] },
  driver_profile: { label: "Driver profiles", blurb: "set or update a driver's rental, salary, or fuel cost",
                    canDo: ["set/update a driver's rental/salary/fuel", "read a driver profile"], cantDo: [] },
  notes:          { label: "Notes", blurb: "save and recall quick notes",
                    canDo: ["capture a note", "search/read notes"], cantDo: [] },
  knowledge:      { label: "Knowledge & web", blurb: "answer from his OWN ingested docs/books/CV, and look things up online (weather, scores, prices, news)",
                    canDo: ["read your ingested CV/documents", "search your books/notes"], cantDo: [] },
  travel:         { label: "Travel", blurb: "find flights, hotels, restaurants and plan trips, then hand him BOOKING LINKS. M8 NEVER books or pays — he confirms and pays on the airline/hotel site",
                    canDo: ["find flights/hotels/restaurants", "plan trips", "hand over booking links"], cantDo: ["book or pay for travel"] },
};

// Two HARD RULES = D4 in both directions. Rule 1 (never claim you LACK an ability)
// is B-176's guarantee, preserved verbatim. Rule 2 (never claim you PERFORMED a
// write) is new — a false "done" is the reverse capability lie (spec §4.4 / D4).
const _ABILITY_RULE_NO_DENY = 'HARD RULE — NEVER claim you lack one of these abilities. Do NOT say "I can\'t set reminders", "I can\'t track expenses", "I don\'t have access to your fleet data", or any equivalent — you CAN. If a turn looks like one of these but a detail is unclear, CONFIRM the action back or ask ONE short question ("Want me to set that reminder — what time?"). Ask or confirm; never decline an ability you have.';
const _ABILITY_RULE_NO_DONE = 'HARD RULE — NEVER say, claim, or tell him you set, added, saved, logged, scheduled, or recorded something yourself. A LANE performs writes and tags the reply — you do not. Do NOT say "Done", "I\'ve saved that", or "Noted, it\'s marked" unless a lane actually handled it. If you can\'t see a lane confirmation, OFFER or ASK instead ("Want me to log that — 30 EGP for groceries?"). A false "done" breaks trust worse than a question.';

// Compose the abilities prompt from CAPABILITIES (spec §4.4). Pure + deterministic
// ⇒ two composes are byte-identical (asserted in tests/meaning_v2_test.js).
function buildAbilitiesPrompt() {
  const lines = Object.keys(CAPABILITIES).map((d) => `• ${CAPABILITIES[d].label} — ${CAPABILITIES[d].blurb}.`);
  return ["WHAT YOU CAN ACTUALLY DO — real, working tools (NEVER deny these exist):"]
    .concat(lines, [_ABILITY_RULE_NO_DENY, _ABILITY_RULE_NO_DONE])
    .join("\n");
}

module.exports = {
  REGISTRY,
  DOMAINS,
  ACTIONS,
  scoreMessage,
  pickDomain,
  resolveIntent,        // Build-176 — the intent gate (pure)
  CAPABILITIES,             // Meaning-First v2 (S2 step 1) — the single capability source
  buildAbilitiesPrompt,    // Meaning-First v2 (S2 step 1) — abilities prompt composed from it
  DOC_READ_DOMINANT,    // exported so the PS mirror / tests assert the exact rule
  travelLaneEnabled,    // Build-183 — the travel-lane kill-switch predicate
  // exported individually so the PowerShell mirror + tests can assert each signal:
  WALLET_STRONG, WALLET_PRESENT, DRIVER_PROFILE_STRONG, FINANCE_STRONG,
  FLEET_STRONG, FLEET_PRESENT, TASK_PRESENT, NOTE_STRONG, NOTE_PRESENT,
  KNOWLEDGE_STRONG, MEMORY_PRESENT, DOCS_STRONG, WEB_PRESENT,
  TRAVEL_STRONG, TRAVEL_PRESENT, // Build-183
};
