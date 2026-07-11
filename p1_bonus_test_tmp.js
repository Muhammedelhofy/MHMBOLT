"use strict";
const {
  bonusFor, bonusGapFor, computeFleetBonusPacket, renderFleetBonusLines, BOLT_BONUS_CONFIG
} = require("./lib/finance");

const results = {};

// â”€â”€ bonusFor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function bf(net) {
  const r = bonusFor(net);
  return r.grossBonus + "," + r.companyBonus + "," + r.tierFloor;
}
results.bf0    = bf(0);
results.bf3999 = bf(3999);
results.bf4000 = bf(4000);
results.bf4999 = bf(4999);
results.bf5000 = bf(5000);
results.bf5999 = bf(5999);
results.bf6000 = bf(6000);
results.bf7500 = bf(7500);

// custom config: 60% to company
const customCfg = { splitPctToCompany: 0.6, tiers: [{ floor: 5000, gross: 2000 }, { floor: 4000, gross: 1000 }] };
const cust = bonusFor(4500, customCfg);
results.bfCustom = cust.grossBonus + "," + cust.companyBonus + "," + cust.tierFloor;

// â”€â”€ bonusGapFor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function bg(net) {
  const r = bonusGapFor(net);
  if (!r) return "null";
  return r.sarToNextTier + "," + r.bonusUnlocked + "," + r.nextTierFloor;
}
results.bg0    = bg(0);
results.bg3999 = bg(3999);
results.bg4000 = bg(4000);
results.bg4500 = bg(4500);
results.bg5000 = bg(5000);
results.bg5500 = bg(5500);
results.bg6000 = bg(6000);
results.bg7000 = bg(7000);

// â”€â”€ computeFleetBonusPacket â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Synthetic fleet: Ahmed 5200 (T5), Khalid 3800 (none, 200 from T4), Majed 6100 (T6)
const entries = [{
  period: "1 Jun 2026 - 30 Jun 2026",
  periodInfo: { end: { month: 5, year: 2026 } },
  drivers: [
    { name: "Ahmed", netEarnings: 5200 },
    { name: "Khalid", netEarnings: 3800 },
    { name: "Majed", netEarnings: 6100 }
  ]
}];
const packet = computeFleetBonusPacket("2026-06", entries, {}, {});

results.pktGross   = String(packet.totalGross);    // 2000+0+2500 = 4500
results.pktCompany = String(packet.totalCompany);  // 1000+0+1250 = 2250
results.pktLen     = String(packet.driverBonuses.length); // 3

const ahmed  = packet.driverBonuses.find(d => d.name === "Ahmed");
const khalid = packet.driverBonuses.find(d => d.name === "Khalid");
const majed  = packet.driverBonuses.find(d => d.name === "Majed");

results.ahmedTier    = String(ahmed.tierFloor);    // 5000
results.ahmedBonus   = String(ahmed.companyBonus); // 1000
results.khalidTier   = String(khalid.tierFloor);   // null
results.khalidGapSar = String(khalid.gap.sarToNextTier); // 200
results.khalidUnlock = String(khalid.gap.bonusUnlocked); // 750
results.majedTier    = String(majed.tierFloor);    // 6000
results.majedBonus   = String(majed.companyBonus); // 1250

// Ahmed at 5200: next tier is 6k, needs 800 SAR -> unlocks 1250 company
results.ahmedGapSar  = String(ahmed.gap.sarToNextTier); // 800
results.ahmedUnlock  = String(ahmed.gap.bonusUnlocked); // 1250
// Majed at 6100: at max, gap = null
results.majedGap     = String(majed.gap);          // null

// â”€â”€ renderFleetBonusLines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const lines = renderFleetBonusLines(packet);
results.linesIsArray     = Array.isArray(lines) ? "true" : "false";
results.line0HasHeader   = lines[0].indexOf("BOLT BONUS THIS MONTH") >= 0 ? "true" : "false";
results.line0HasGross    = lines[0].indexOf("4,500") >= 0 ? "true" : "false";  // 4500 SAR gross
results.line0HasCompany  = lines[0].indexOf("2,250") >= 0 ? "true" : "false";  // 2250 SAR company
results.line1HasAhmed    = lines[1].indexOf("Ahmed") >= 0 ? "true" : "false";
results.line1HasMajed    = lines[1].indexOf("Majed") >= 0 ? "true" : "false";
// Khalid is within 500 SAR of T4 (needs 200) -> should appear in nearTier line
results.line2HasKhalid   = lines[2] && lines[2].indexOf("Khalid") >= 0 ? "true" : "false";
results.line2HasSar200   = lines[2] && lines[2].indexOf("200") >= 0 ? "true" : "false";

// renderFleetBonusLines(null) must return []
const nullLines = renderFleetBonusLines(null);
results.nullLinesIsEmpty = (nullLines.length === 0) ? "true" : "false";

// splitPct on packet
results.splitPct = String(packet.splitPct); // 0.5

console.log(JSON.stringify(results));