/**
 * lib/handlers/source-card.js — Build-R1 (D5): read-only source card.
 *
 * GET /api/knowledge?fn=source-card&id=<N>
 * Returns the citation-grade dossier for one ingested source:
 * {
 *   ok: true,
 *   id, title, source_class,
 *   citation,                    // "Author, Work (Year), locator" | null (never invented)
 *   citation_incomplete,         // true when the core author/work/year triple is missing
 *   word_count,
 *   node_counts: { established, speculative, pending },
 *   sample_claims: [{ label, content }]   // ≤ 5
 * }
 *
 * No Gemini/LLM call, no write — a DB read only. The 12-fn router (api/knowledge.js)
 * dispatches here; the Vercel function cap is untouched.
 */
"use strict";

const { getSourceCard } = require("../knowledge-intake");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }
  const raw = req.query && (req.query.id != null ? req.query.id : req.query.source_id);
  if (raw == null || String(raw).trim() === "") {
    return res.status(400).json({ ok: false, error: "id required (?fn=source-card&id=<N>)" });
  }
  try {
    const card = await getSourceCard(raw);
    if (!card) {
      return res.status(404).json({ ok: false, error: `source ${raw} not found` });
    }
    return res.status(200).json({ ok: true, ...card });
  } catch (e) {
    console.error("[knowledge/source-card]", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
