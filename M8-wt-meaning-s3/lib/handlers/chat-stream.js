/**
 * M8 Streaming Chat — SSE handler (POST /api/chat-stream, dispatched by the
 * api/chat.js router). Body relocated VERBATIM from the original api/chat-stream.js
 * (Hobby 12-fn pass 2, 2026-07-05). Only the require paths changed
 * (../lib/X -> ../X). No business logic changed.
 *
 * Wire format (one JSON object per SSE `data:` line):
 *   {delta:"..."}      a token chunk to append/speak
 *   {done:true, full}  end of the reply (full = the complete text, for safety)
 *   {error:"..."}      something failed (client should fall back to /api/chat)
 */
const { orchestrateStream } = require("../orchestrator");
// E1 turn integrity (§P1): guard lives in the HTTP handler ONLY (not the
// orchestrator — the delegation trap). See M8/E1_TURN_INTEGRITY_SPEC.md.
const { acquireTurnLock, releaseTurnLock, BUSY_MESSAGE } = require("../turn-lock");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  const { message, sessionId, history, attachments } = req.body || {};
  if (!message) return res.status(400).json({ error: "Message required" });

  res.setHeader("Content-Type",  "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");          // ask proxies not to buffer
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (_) {} };

  // E1 §P1: acquire BEFORE streaming. Busy → emit the friendly text as one chunk
  // (same shape as the existing single-chunk fallback), then done. Fail-open.
  const lock = await acquireTurnLock(sessionId);
  if (!lock.acquired) {
    send({ delta: BUSY_MESSAGE });
    send({ done: true, full: BUSY_MESSAGE });
    try { res.write("data: [DONE]\n\n"); } catch (_) {}
    try { res.end(); } catch (_) {}
    return;
  }

  try {
    const full = await orchestrateStream({
      message, sessionId, history, attachments,
      onChunk: (delta) => send({ delta }),
      onReset: () => send({ reset: true }),   // discard a partial that's being superseded by a fallback
    });
    send({ done: true, full });
  } catch (err) {
    console.error("[M8] /api/chat-stream error:", err?.message || err);
    send({ error: err?.message || "stream failed" });
  } finally {
    await releaseTurnLock(sessionId);
    try { res.write("data: [DONE]\n\n"); } catch (_) {}
    try { res.end(); } catch (_) {}
  }
};
