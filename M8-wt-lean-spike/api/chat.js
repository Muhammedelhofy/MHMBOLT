/**
 * api/chat.js — Router (Hobby 12-function consolidation pass 2, 2026-07-05)
 *
 * The buffered chat handler and the SSE streaming handler now share ONE
 * serverless function, dispatched by ?fn=. Handler bodies are UNCHANGED — each
 * lives verbatim in lib/handlers/. vercel.json rewrites keep both original URLs
 * working (method/body/headers pass through untouched):
 *   /api/chat         -> /api/chat            (no fn -> buffered; default path)
 *   /api/chat-stream  -> /api/chat?fn=stream   (Server-Sent Events)
 *
 * Both handlers are POST-only and share lib/orchestrator + lib/turn-lock, so the
 * merge adds no new dependency. maxDuration (180) is set in vercel.json — the same
 * budget both endpoints had before.
 */
"use strict";

const chatBuffered = require("../lib/handlers/chat-buffered");
const chatStream   = require("../lib/handlers/chat-stream");

module.exports = async (req, res) => {
  const fn = String((req.query && req.query.fn) || "").toLowerCase();
  switch (fn) {
    case "stream": return chatStream(req, res);
    // Default (no fn) = the original buffered /api/chat flow.
    case "":
    case "buffered": return chatBuffered(req, res);
    default:
      return res.status(404).json({ error: `unknown chat fn: '${fn}'` });
  }
};

// Both chat paths can take ~90-180s; mirrors the original endpoints' budget.
module.exports.config = { maxDuration: 180 };
