"use strict";
const {
  computeDriverPnLV2, computeFleetPnL,
  FLEET_FINANCE_CONFIG, bonusFor
} = require("./lib/finance");

const results = {};

// â”€â”€ Shared synthetic data helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function makeEntries(drivers, month, year) {
  // month is 0-indexed (Jan=0) to match entryMonthYear convention
  return [{
    period: "1 " + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month] + " " + year +
            " - 28 " + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month] + " " + year,
    periodInfo: { end: { month: month, year: year } },
    drivers: drivers
  }];
}
// YYYY-MM monthKey where month param is 0-indexed
function mk(year, month0) {
  return year + "-" + String(month0 + 1).padStart(2, "0");
}

// â”€â”€ computeDriverPnLV2: R model â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// R driver: net 5200, carRent IN 1500, no salary. Company gets rent only (0 net income).
const rentProfiles = {
  "ahmed": {
    model: "R", modelCustom: null,
    carRent: { dir: "IN", amount: 1500 },
    accountRent: { dir: "NONE", amount: 0 },
    salary: 0, autoSalary: false,
    fleetCut: { type: "NONE", value: 0 },
    other: { dir: "NONE", amount: 0 },
    startDate: null
  }
};
const rentEntries = makeEntries([{ name: "Ahmed", netEarnings: 5200 }], 5, 2026); // Jun 2026
const rentPl = computeDriverPnLV2("Ahmed", mk(2026, 5), rentEntries, rentProfiles, {});
results.r_income    = String(rentPl.income);    // 0 -- R model, not company's money
results.r_driverNet = String(rentPl.driverNet); // 5200 -- real net, exposed for bonus
results.r_carRent   = String(rentPl.carRent);   // 1500 -- rent the company collects
results.r_netPnL    = String(rentPl.netPnL);    // 1500 (0 + 1500)
results.r_modelAware = String(rentPl._modelAware); // true

// R model with accountRent IN 800 and car rent OUT 0
const rentProfiles2 = {
  "khalid": {
    model: "R", modelCustom: null,
    carRent: { dir: "NONE", amount: 0 },
    accountRent: { dir: "IN", amount: 800 },
    salary: 0, autoSalary: false,
    fleetCut: { type: "NONE", value: 0 },
    other: { dir: "NONE", amount: 0 },
    startDate: null
  }
};
const rentEntries2 = makeEntries([{ name: "Khalid", netEarnings: 4200 }], 5, 2026);
const rentPl2 = computeDriverPnLV2("Khalid", mk(2026, 5), rentEntries2, rentProfiles2, {});
results.r2_income  = String(rentPl2.income);   // 0
results.r2_acctRent = String(rentPl2.acctRent); // 800
results.r2_netPnL  = String(rentPl2.netPnL);   // 800

// â”€â”€ computeDriverPnLV2: F model (fleet-account, same as legacy) â”€â”€â”€
const fleetProfiles = {
  "majed": {
    model: "F", modelCustom: null,
    carRent: { dir: "NONE", amount: 0 },
    accountRent: { dir: "NONE", amount: 0 },
    salary: 2000, autoSalary: false,
    fleetCut: { type: "NONE", value: 0 },
    other: { dir: "NONE", amount: 0 },
    startDate: null
  }
};
const fleetEntries = makeEntries([{ name: "Majed", netEarnings: 6000 }], 5, 2026);
const fleetPl = computeDriverPnLV2("Majed", mk(2026, 5), fleetEntries, fleetProfiles, {});
results.f_income    = String(fleetPl.income);    // 6000 -- F model: earnings land in company
results.f_driverNet = String(fleetPl.driverNet); // 6000
results.f_salary    = String(fleetPl.salary);    // -2000
results.f_netPnL    = String(fleetPl.netPnL);    // 3250 (6000 - 2000 - 750 F-incentive at T6)

// â”€â”€ computeDriverPnLV2: S model (salaried, same as F) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const salProfiles = {
  "sara": {
    model: "S", modelCustom: null,
    carRent: { dir: "NONE", amount: 0 },
    accountRent: { dir: "NONE", amount: 0 },
    salary: 1500, autoSalary: false,
    fleetCut: { type: "NONE", value: 0 },
    other: { dir: "NONE", amount: 0 },
    startDate: null
  }
};
const salEntries = makeEntries([{ name: "Sara", netEarnings: 4500 }], 5, 2026);
const salPl = computeDriverPnLV2("Sara", mk(2026, 5), salEntries, salProfiles, {});
results.s_income = String(salPl.income);    // 4500 -- S treated same as F
results.s_netPnL = String(salPl.netPnL);   // 3000 (4500 - 1500)

// â”€â”€ spec S2e worked example â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Rent driver, net 5200, pays 1500 car rent. No salary, no carFixedCost yet.
// Company P&L from computeDriverPnLV2: income=0, carRent=1500, netPnL=1500
// Bonus (separate): bonusFor(5200).companyBonus = 1000
// Combined (as narrated): 1500 + 1000 = 2500 -- matches spec "revenue = 1500 rent + 1000 bonus"
results.s2e_pnl     = String(rentPl.netPnL);                      // 1500
results.s2e_bonus   = String(bonusFor(5200).companyBonus);         // 1000
results.s2e_combined = String(rentPl.netPnL + bonusFor(5200).companyBonus); // 2500

// â”€â”€ computeFleetPnL with V2 flag â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Fleet: Ahmed R (net 5200, carRent IN 1500), Majed F (net 6000, salary 2000)
const mixedProfiles = { ...rentProfiles, ...fleetProfiles };
const mixedEntries = makeEntries([
  { name: "Ahmed", netEarnings: 5200 },
  { name: "Majed", netEarnings: 6000 }
], 5, 2026);
const v2Fleet = computeFleetPnL(mk(2026, 5), mixedEntries, mixedProfiles, {}, { modelAwarePnL: true });
// Ahmed R: income=0, carRent=+1500, netPnL=1500
// Majed F: income=6000, salary=-2000, incentiveOut=750 (T6), netPnL=3250
// totals: income=6000 (only Majed's), inflow=1500 (Ahmed's rent), costs=2750, netPnL=4750
results.v2_income   = String(v2Fleet.totals.income);   // 6000
results.v2_inflow   = String(v2Fleet.totals.inflow);   // 1500
results.v2_costs    = String(v2Fleet.totals.costs);    // 2750
results.v2_netPnL   = String(v2Fleet.totals.netPnL);  // 4750
results.v2_drivers  = String(v2Fleet.totals.drivers);  // 2
results.v2_flag     = String(v2Fleet.modelAware);      // true

// â”€â”€ legacy mode unchanged (same fleet, V2 flag OFF) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const legacyFleet = computeFleetPnL(mk(2026, 5), mixedEntries, mixedProfiles, {}, { modelAwarePnL: false });
// Ahmed R legacy: income=5200, carRent=+1500, netPnL=5200+1500=6700 (old inflated number)
// Majed F: 6000 - 2000 = 4000
// totals: income=11200, inflow=1500, costs=2000, netPnL=11200+1500-2000=10700... wait
// Actually let me recalculate:
// Ahmed: income=5200, acctRent=0, carRent=1500, salary=0, fleetCut=0, other=0, netPnL=6700
// inFlow = max(0,0) + max(0,1500) + max(0,0) = 1500
// outFlow = 0+0+0+0+0 = 0
// Majed: income=6000, salary=-2000, netPnL=4000
// inFlow = 0, outFlow = 2000
// totals: income=11200, inflow=1500, costs=2000, netPnL=10700
results.leg_income  = String(legacyFleet.totals.income);  // 11200
results.leg_netPnL  = String(legacyFleet.totals.netPnL);  // 10700
results.leg_flag    = String(legacyFleet.modelAware);     // false

// Default (no financeConfig arg) uses FLEET_FINANCE_CONFIG â€” now true since P3a
const defaultFleet = computeFleetPnL(mk(2026, 5), mixedEntries, mixedProfiles, {});
results.def_flag = String(defaultFleet.modelAware); // true (P3a flipped default on)

console.log(JSON.stringify(results));