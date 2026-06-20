"use strict";
const { fetchAndAggregateFleet } = require("./lib");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.BOLT_CLIENT_ID || !process.env.BOLT_CLIENT_SECRET) {
    return res.status(503).json({ ok: false, error: "Bolt credentials not configured on server" });
  }

  const { date } = req.body || {};
  if (!date) return res.status(400).json({ ok: false, error: "date required (yyyy-MM-dd)" });

  try {
    const { allOrders, drivers } = await fetchAndAggregateFleet(date);
    res.json({ ok: true, date, totalOrders: allOrders.length, driverCount: drivers.length, drivers });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
