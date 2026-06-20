"use strict";
/**
 * GET /api/bolt/config
 * Returns Supabase URL + anon key so any browser auto-configures on first load.
 * Only returns the anon (publishable) key — never the service key.
 * Requires SUPABASE_URL + SUPABASE_ANON_KEY in Vercel env vars.
 */
module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const supabaseUrl     = process.env.SUPABASE_URL     || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({ ok: false, error: "SUPABASE_URL or SUPABASE_ANON_KEY not set in Vercel env vars" });
  }

  res.json({ ok: true, supabaseUrl, supabaseAnonKey });
};
