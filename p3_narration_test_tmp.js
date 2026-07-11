"use strict";
const {
  renderDriverPnLPacket, renderFleetPnLPacket, computeDriverPnLV2, computeFleetPnL,
  computeFleetBonusPacket, bonusFor, bonusGapFor, sN
} = require("./lib/finance");

const results = {};

// â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function makeEntries(drivers, month0, year) {
  return [{
    period: "1 Jun " + year + " - 28 Jun " + year,
    periodInfo: { end: { month: month0, year: year } },
    drivers: drivers
  }];
}
const MONTH = "2026-06";

// â”€â”€ R model driver: Farouk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Foreigner driving on Saudi account.
// carRent IN 1000, acctRent IN 500, other OUT 800 (Saudi holder payment)
// driverNet = 5500 (their own money) -> company earns rent only
const rProfile = {
  "farouk": {
    model: "R", modelCustom: null,
    carRent:    { dir: "IN",  amount: 1000 },
    accountRent:{ dir: "IN",  amount: 500  },
    salary: 0, autoSalary: false,
    fleetCut: { type: "NONE", value: 0 },
    other:      { dir: "OUT", amount: 800  },
    startDate: null
  }
};
const rEntries = makeEntries([{ name: "Farouk", netEarnings: 5500 }], 5, 2026);
const rPl = computeDriverPnLV2("Farouk", MONTH, rEntries, rProfile, {});
// income=0, driverNet=5500, acctRent=500, carRent=1000, other=-800, netPnL=700
// bonus: 5500 -> T5 (5000 floor) -> company 1000
const rBonus = bonusFor(rPl.driverNet);
const rGap   = bonusGapFor(rPl.driverNet);
const rPacket = renderDriverPnLPacket(rPl, MONTH, { bonus: rBonus, gap: rGap });

results.r_pl_income     = String(rPl.income);       // 0
results.r_pl_driverNet  = String(rPl.driverNet);    // 5500
results.r_pl_netPnL     = String(rPl.netPnL);       // 700

// Narration must contain model-aware labels
results.r_hasRentModel    = String(rPacket.includes("RENT MODEL"));
results.r_hasDriverMoney  = String(rPacket.includes("5,500") && rPacket.includes("their money"));
results.r_hasRentIn       = String(rPacket.includes("1,000") && rPacket.includes("500") && rPacket.includes("rent collected"));
results.r_hasHolderPay    = String(rPacket.includes("800") && rPacket.includes("Account holder"));
results.r_hasCarCostNote  = String(rPacket.includes("no maintenance"));
results.r_netPnLLine      = String(rPacket.includes("700") && rPacket.includes("NET P&L"));
// Bonus: driverNet 5500 -> T5 -> company 1000, combined = 700+1000=1700
results.r_bonusCompany    = String(rBonus.companyBonus); // 1000
results.r_hasBonusLine    = String(rPacket.includes("1,000") && rPacket.includes("BOLT BONUS"));
results.r_hasCombined     = String(rPacket.includes("1,700") && rPacket.includes("Combined"));

// â”€â”€ F model driver: Fahed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Saudi on own account. driverNet=5200 -> incentiveOut=400, netPnL=4800
const fProfile = {
  "fahed": {
    model: "F", modelCustom: null,
    carRent:    { dir: "NONE", amount: 0 },
    accountRent:{ dir: "NONE", amount: 0 },
    salary: 0, autoSalary: false,
    fleetCut: { type: "NONE", value: 0 },
    other:      { dir: "NONE", amount: 0 },
    startDate: null
  }
};
const fEntries = makeEntries([{ name: "Fahed", netEarnings: 5200 }], 5, 2026);
const fPl = computeDriverPnLV2("Fahed", MONTH, fEntries, fProfile, {});
const fBonus = bonusFor(fPl.driverNet);
const fGap   = bonusGapFor(fPl.driverNet);
const fPacket = renderDriverPnLPacket(fPl, MONTH, { bonus: fBonus, gap: fGap });

// Income = 5200, incentiveOut=400, netPnL=4800
// Bonus: 5200 -> T5 -> company 1000, combined=5800
results.f_hasRevenueLabel = String(fPacket.includes("collected to company"));
results.f_hasIncentiveLine= String(fPacket.includes("incentive paid to driver") && fPacket.includes("400"));
results.f_netPnLLine      = String(fPacket.includes("4,800") && fPacket.includes("NET P&L"));
// F bonus: T5 (5000 floor), company 1000, combined 4800+1000=5800
results.f_hasBonusLine    = String(fPacket.includes("BOLT BONUS") && fPacket.includes("1,000"));
results.f_hasCombined     = String(fPacket.includes("5,800") && fPacket.includes("Combined"));

// â”€â”€ F model driver below bonus tier (no bonus) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const fEntries3k = makeEntries([{ name: "Fahed", netEarnings: 3000 }], 5, 2026);
const fPl3k = computeDriverPnLV2("Fahed", MONTH, fEntries3k, fProfile, {});
const fBonus3k = bonusFor(fPl3k.driverNet);
const fGap3k   = bonusGapFor(fPl3k.driverNet);
const fPacket3k = renderDriverPnLPacket(fPl3k, MONTH, { bonus: fBonus3k, gap: fGap3k });
// Below 4000: bonus=0, gap.sarToNextTier=1000, gap.bonusUnlocked=750
results.f3k_hasNoBonusTier = String(fPacket3k.includes("not yet reached") || fPacket3k.includes("below 4,000"));

// â”€â”€ S model driver with car rent OUT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Salaried driver on company car: carRent OUT 2000
const sProfile = {
  "sara": {
    model: "S", modelCustom: null,
    carRent:    { dir: "OUT", amount: 2000 },
    accountRent:{ dir: "OUT", amount: 600  },
    salary: 0, autoSalary: true,
    salaryBase: 4000, salaryThreshold: 10000, salaryPerK: 500,
    fleetCut: { type: "NONE", value: 0 },
    other:      { dir: "NONE", amount: 0   },
    startDate: null
  }
};
const sEntries = makeEntries([{ name: "Sara", netEarnings: 10000 }], 5, 2026);
const sPl = computeDriverPnLV2("Sara", MONTH, sEntries, sProfile, {});
const sBonus = bonusFor(sPl.driverNet);
const sGap   = bonusGapFor(sPl.driverNet);
const sPacket = renderDriverPnLPacket(sPl, MONTH, { bonus: sBonus, gap: sGap });
// income=10000, salary=-4000, acctRent=-600, carRent=-2000, netPnL=3400
// bonus: 10000 -> T6 -> company 1250, combined=4650
results.s_netPnL           = String(sPl.netPnL);                // 3400
results.s_hasCarCostLine   = String(sPacket.includes("Car cost") && sPacket.includes("2,000"));
results.s_hasCarNoMaint    = String(sPacket.includes("no maintenance"));
// Sara at 10000 -> T6 bonus -> company 1250
results.s_hasBonusT6       = String(sPacket.includes("BOLT BONUS") && sPacket.includes("1,250"));
results.s_hasCombined      = String(sPacket.includes("4,650") && sPacket.includes("Combined"));

// â”€â”€ renderFleetPnLPacket model-aware revenue-by-source â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Fleet: Farouk R (carRent+acctRent IN, other OUT, driverNet 5500)
//        Fahed  F (net 5200, incentiveOut 400)
const mixedProfiles = { ...rProfile, ...fProfile };
const mixedEntries  = makeEntries([
  { name: "Farouk", netEarnings: 5500 },
  { name: "Fahed",  netEarnings: 5200 }
], 5, 2026);
const fleet = computeFleetPnL(MONTH, mixedEntries, mixedProfiles, {});
const bonusPkt = computeFleetBonusPacket(MONTH, mixedEntries, mixedProfiles, {});
const fleetPacket = renderFleetPnLPacket(fleet, bonusPkt);

// Farouk R: income=0, acctRent=500, carRent=1000, other=-800, incentiveOut=0, netPnL=700
// Fahed  F: income=5200, incentiveOut=400, netPnL=4800
// totals: income=5200, inflow=1500, costs=400+800=1200, netPnL=5500
// bonus: Farouk T5(1000) + Fahed T5(1000) = 2000 company total
// totalWithBonus = 5500 + 2000 = 7500
results.fleet_hasRevenueBySource = String(fleetPacket.includes("REVENUE BY SOURCE"));
results.fleet_hasNetCollected    = String(fleetPacket.includes("5,200") && fleetPacket.includes("F/S drivers"));
results.fleet_hasRentalIncome    = String(fleetPacket.includes("1,500") && fleetPacket.includes("rental income"));
results.fleet_hasBonusLine       = String(fleetPacket.includes("2,000") && fleetPacket.includes("Bolt bonus"));
results.fleet_hasDealNetPnL      = String(fleetPacket.includes("5,500") && fleetPacket.includes("NET P&L from deals"));
results.fleet_hasTotalWithBonus  = String(fleetPacket.includes("7,500") && fleetPacket.includes("real bottom line"));
results.fleet_hasCarCostNote     = String(fleetPacket.includes("no maintenance"));

console.log(JSON.stringify(results));