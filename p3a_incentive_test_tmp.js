"use strict";
const {
  driverIncentiveFor, computeDriverPnLV2, computeFleetPnL,
  DRIVER_INCENTIVE_CONFIG, FLEET_FINANCE_CONFIG
} = require("./lib/finance");

const results = {};

// â”€â”€ driverIncentiveFor: default config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
results.di0    = String(driverIncentiveFor(0,    {}));  // 0
results.di4999 = String(driverIncentiveFor(4999, {}));  // 0
results.di5000 = String(driverIncentiveFor(5000, {}));  // 400
results.di5999 = String(driverIncentiveFor(5999, {}));  // 400
results.di6000 = String(driverIncentiveFor(6000, {}));  // 750
results.di7000 = String(driverIncentiveFor(7000, {}));  // 750

// â”€â”€ driverIncentiveFor: profile-level override â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Custom deal: 600 at 5k, 900 at 6k
const customProfile = {
  driverIncentive: {
    tiers: [{ floor: 6000, amount: 900 }, { floor: 5000, amount: 600 }]
  }
};
results.diCustom5k = String(driverIncentiveFor(5200, customProfile)); // 600
results.diCustom6k = String(driverIncentiveFor(6100, customProfile)); // 900
results.diCustom4k = String(driverIncentiveFor(4999, customProfile)); // 0

// â”€â”€ FLEET_FINANCE_CONFIG.modelAwarePnL is now ON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
results.switchOn = String(FLEET_FINANCE_CONFIG.modelAwarePnL); // true

// â”€â”€ computeDriverPnLV2: F model with incentive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// F driver: net 5200. Incentive: 400 (at 5k). No salary, no rent.
// income = 5200 (F model), incentiveOut = 400, netPnL = 5200 - 400 = 4800
function makeEntries(drivers, month0, year) {
  return [{
    period: "1 Jun " + year + " - 28 Jun " + year,
    periodInfo: { end: { month: month0, year: year } },
    drivers: drivers
  }];
}
const fProfiles = {
  "fahed": {
    model: "F", modelCustom: null,
    carRent: { dir: "NONE", amount: 0 },
    accountRent: { dir: "NONE", amount: 0 },
    salary: 0, autoSalary: false,
    fleetCut: { type: "NONE", value: 0 },
    other: { dir: "NONE", amount: 0 },
    startDate: null
  }
};
const fEntries = makeEntries([{ name: "Fahed", netEarnings: 5200 }], 5, 2026);
const fPl = computeDriverPnLV2("Fahed", "2026-06", fEntries, fProfiles, {});
results.f_income      = String(fPl.income);       // 5200
results.f_incentive   = String(fPl.incentiveOut); // 400
results.f_netPnL      = String(fPl.netPnL);       // 4800

// F driver at 6k: incentive = 750, netPnL = 6000 - 750 = 5250
const fEntries6k = makeEntries([{ name: "Fahed", netEarnings: 6000 }], 5, 2026);
const fPl6k = computeDriverPnLV2("Fahed", "2026-06", fEntries6k, fProfiles, {});
results.f6k_incentive = String(fPl6k.incentiveOut); // 750
results.f6k_netPnL    = String(fPl6k.netPnL);       // 5250

// F driver below 5k: incentive = 0
const fEntries4k = makeEntries([{ name: "Fahed", netEarnings: 4000 }], 5, 2026);
const fPl4k = computeDriverPnLV2("Fahed", "2026-06", fEntries4k, fProfiles, {});
results.f4k_incentive = String(fPl4k.incentiveOut); // 0
results.f4k_netPnL    = String(fPl4k.netPnL);       // 4000

// F driver with custom profile override (600 at 5k)
const fProfilesCustom = { "fahed": { ...fProfiles["fahed"], driverIncentive: { tiers: [{ floor: 5000, amount: 600 }] } } };
const fPlCustom = computeDriverPnLV2("Fahed", "2026-06", fEntries, fProfilesCustom, {});
results.f_customIncentive = String(fPlCustom.incentiveOut); // 600
results.f_customNetPnL    = String(fPlCustom.netPnL);       // 4600

// â”€â”€ R model: incentiveOut = 0 (foreigners get no incentive) â”€â”€â”€â”€â”€â”€â”€
const rProfiles = {
  "ahmad": {
    model: "R", modelCustom: null,
    carRent: { dir: "IN", amount: 1000 },
    accountRent: { dir: "IN", amount: 500 },
    salary: 0, autoSalary: false,
    fleetCut: { type: "NONE", value: 0 },
    other: { dir: "OUT", amount: 800 },
    startDate: null
  }
};
const rEntries = makeEntries([{ name: "Ahmad", netEarnings: 6000 }], 5, 2026);
const rPl = computeDriverPnLV2("Ahmad", "2026-06", rEntries, rProfiles, {});
results.r_income    = String(rPl.income);       // 0
results.r_incentive = String(rPl.incentiveOut); // 0
results.r_netPnL    = String(rPl.netPnL);       // 1000+500-800 = 700

// â”€â”€ S model: incentiveOut = 0 (salaried gets salary not incentive) â”€
const sProfiles = {
  "sam": {
    model: "S", modelCustom: null,
    carRent: { dir: "NONE", amount: 0 },
    accountRent: { dir: "OUT", amount: 600 },
    salary: 0, autoSalary: true,
    salaryBase: 4000, salaryThreshold: 10000, salaryPerK: 500,
    fleetCut: { type: "NONE", value: 0 },
    other: { dir: "NONE", amount: 0 },
    startDate: null
  }
};
const sEntries = makeEntries([{ name: "Sam", netEarnings: 10000 }], 5, 2026);
const sPl = computeDriverPnLV2("Sam", "2026-06", sEntries, sProfiles, {});
results.s_income    = String(sPl.income);       // 10000
results.s_salary    = String(sPl.salary);       // -4000 (autoSalary at 10k)
results.s_acctRent  = String(sPl.acctRent);     // -600 (company pays Saudi account holder)
results.s_incentive = String(sPl.incentiveOut); // 0
results.s_netPnL    = String(sPl.netPnL);       // 10000 - 4000 - 600 = 5400

// â”€â”€ Fleet-level: incentiveOut appears in totals.costs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Fleet: Fahed F (net 5200, incentive 400), Ahmad R (net 6000, carRent+acctRent in, out 800)
const mixedProfiles = { ...fProfiles, ...rProfiles };
const mixedEntries = makeEntries([
  { name: "Fahed", netEarnings: 5200 },
  { name: "Ahmad", netEarnings: 6000 }
], 5, 2026);
// Use default config (modelAwarePnL: true now)
const fleet = computeFleetPnL("2026-06", mixedEntries, mixedProfiles, {});
// Fahed F: income=5200, incentiveOut=400, netPnL=4800, outFlow=400
// Ahmad R: income=0, acctRent=+500, carRent=+1000, other=-800, netPnL=700, outFlow=800
// totals: income=5200, inflow=1500, costs=400+800=1200, netPnL=4800+700=5500
results.fleet_income  = String(fleet.totals.income);  // 5200
results.fleet_inflow  = String(fleet.totals.inflow);  // 1500
results.fleet_costs   = String(fleet.totals.costs);   // 1200 (400 incentive + 800 Saudi holder)
results.fleet_netPnL  = String(fleet.totals.netPnL);  // 5500
results.fleet_aware   = String(fleet.modelAware);     // true

console.log(JSON.stringify(results));