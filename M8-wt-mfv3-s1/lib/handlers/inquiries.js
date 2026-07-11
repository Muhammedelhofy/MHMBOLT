/**
 * lib/handlers/inquiries.js — Build-R6 (Inquiry ledger): read-only surface.
 *
 * GET /api/knowledge?fn=inquiries
 *   • no params            → { ok, count, inquiries:[{ thread, title, status, entries, last, seed_backed }] }
 *   • &q=<question>        → the assembled CITED thread for that standing question
 *   • &thread=<slug> | &id=<slug>
 *                          → the assembled thread for that notebook thread
 *
 * The assembled thread = { question, thread, status, evidence_so_far (established
 * vs speculative, cited), checks_run (OBSERVED/FALSIFIED/verified), dead_ends,
 * next_checks, not_yet_proven, packet }. No LLM call, no write — notebook +
 * curated-literature reads only. The 12-fn router (api/knowledge.js) dispatches
 * here; the Vercel function cap is untouched.
 *
 * Kill-switch M8_INQUIRY_LEDGER (default ON): OFF ⇒ { ok:false, disabled:true }.
 */
"use strict";

const inq = require("../inquiry-ledger");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }
  if (!inq.inquiryLedgerEnabled()) {
    return res.status(200).json({ ok: false, disabled: true, error: "inquiry ledger disabled (M8_INQUIRY_LEDGER=off)" });
  }
  const query = req.query || {};
  const q = query.q != null ? String(query.q).trim() : "";
  const threadParam = (query.thread != null ? String(query.thread)
                     : query.id != null ? String(query.id) : "").trim();

  try {
    // No target → list the standing questions on record.
    if (!q && !threadParam) {
      const list = await inq.listInquiries({});
      return res.status(200).json({ ok: true, ...list });
    }
    // A target → assemble its thread.
    const thread = await inq.buildInquiryThread(q || threadParam, {
      thread: threadParam || null,
    });
    if (!thread) {
      return res.status(200).json({
        ok: true, found: false,
        query: q || threadParam,
        note: "no notebook thread and no on-file literature for that question yet",
      });
    }
    return res.status(200).json({ ok: true, found: true, ...thread });
  } catch (e) {
    console.error("[knowledge/inquiries]", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
