/**
 * M8 Chat — buffered handler (POST /api/chat, dispatched by api/chat.js router)
 * Body relocated VERBATIM from the original api/chat.js (Hobby 12-fn pass 2,
 * 2026-07-05). Only the require paths changed (../lib/X -> ../X) because this now
 * lives in lib/handlers/. No business logic changed.
 */
const { orchestrate } = require("../orchestrator");
// E1 turn integrity (§P1): the per-session in-flight guard lives in the HTTP
// handler ONLY — never inside orchestrate() (orchestrateStream delegates back
// into it, which would self-block). See M8/E1_TURN_INTEGRITY_SPEC.md.
const { acquireTurnLock, releaseTurnLock, BUSY_MESSAGE } = require("../turn-lock");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  try {
    const { message, sessionId, history, attachments } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    // E1 §P1: acquire the per-session lock. Busy → a friendly 200 (never a red
    // error). Fail-open on infra trouble (Layer 1 owns correctness).
    const lock = await acquireTurnLock(sessionId);
    if (!lock.acquired) {
      return res.status(200).json({ response: BUSY_MESSAGE });
    }
    try {
      const response = await orchestrate({ message, sessionId, history, attachments });
      return res.status(200).json({ response });
    } finally {
      await releaseTurnLock(sessionId);
    }

  } catch (error) {
    const errMsg  = error?.message || String(error);
    const errStatus = error?.status || error?.statusCode || "unknown";
    const model   = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    console.error(`=== M8 ERROR === model:${model} status:${errStatus} msg:${errMsg}`);

    let hint = "Check Vercel logs for details";
    if (errMsg.includes("API key") || errMsg.includes("401")) hint = "Invalid GEMINI_API_KEY";
    if (errStatus === 429) hint = "Quota exceeded — check Google AI Studio";
    if (errMsg.includes("not found") || errMsg.includes("404")) hint = `Model '${model}' not found`;

    return res.status(500).json({ error: errMsg, hint });
  }
};
