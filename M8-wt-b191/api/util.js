/**
 * api/util.js — Router (Hobby 12-function consolidation pass 2, 2026-07-05)
 *
 * tasks + transcribe share ONE serverless function, dispatched by ?fn=. The
 * handler bodies are UNCHANGED — each lives verbatim in lib/handlers/. vercel.json
 * rewrites keep the original URLs working (query params pass through):
 *   /api/tasks      -> /api/util?fn=tasks       (GET/POST/PATCH/DELETE m8_tasks CRUD)
 *   /api/transcribe -> /api/util?fn=transcribe   (POST base64 audio -> Groq Whisper)
 *
 * Config note: this router owns the function config for both routes.
 *   - bodyParser 12mb: required by transcribe (base64 audio). Harmless to tasks,
 *     whose JSON bodies are tiny — a higher ceiling changes no observable behavior.
 *   - maxDuration 30: >= both originals (tasks had 15 in-file; transcribe ran at
 *     the platform default). Neither route loses budget; neither loops.
 */
"use strict";

const tasks      = require("../lib/handlers/tasks");
const transcribe = require("../lib/handlers/transcribe");

module.exports = async (req, res) => {
  const fn = String((req.query && req.query.fn) || "").toLowerCase();
  switch (fn) {
    case "tasks":      return tasks(req, res);
    case "transcribe": return transcribe(req, res);
    default:
      return res.status(404).json({ error: `unknown util fn: '${fn}'` });
  }
};

module.exports.config = { maxDuration: 30, api: { bodyParser: { sizeLimit: "12mb" } } };
