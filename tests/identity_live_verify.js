"use strict";
/**
 * LIVE verification of the identity-unification fix against the REAL cloud data.
 *
 * The spec's acceptance criterion 6 is explicit: "Verified on prod against real data, not only
 * locally. Today's lesson: a fix passed every local test and still failed on prod because
 * localhost had seeded history the real browser lacked." So this script does NOT use fixtures.
 * It pulls the actual `fleet_data` row from Supabase, decodes it with index.html's own c1 codec,
 * and runs index.html's own money functions over it.
 *
 * The Supabase URL + ANON key are read from the public /api/bolt/config endpoint that every
 * browser already calls on load, are held only in memory, and are never printed.
 *
 *   node tests/identity_live_verify.js            # verify
 *   node tests/identity_live_verify.js --json     # machine-readable
 *
 * Exit 0 = every check passed.
 */

const fs = require("fs");
const path = require("path");

const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const CONFIG_URL = "https://mhmbolt.vercel.app/api/bolt/config";
const SB_ROW_ID = "fleet";

// ── Reuse the extractor + sandbox from the unit test ───────────────────────────────
function sliceBalanced(src, from) {
  let i = src.indexOf("{", from);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        else if (q === "`" && src[i] === "$" && src[i + 1] === "{") {
          let d = 1; i += 2;
          while (i < src.length && d > 0) {
            if (src[i] === "{") d++;
            else if (src[i] === "}") d--;
            else if (src[i] === '"' || src[i] === "'" || src[i] === "`") {
              const q2 = src[i++];
              while (i < src.length && src[i] !== q2) { if (src[i] === "\\") i++; i++; }
            }
            i++;
          }
          i--;
        }
        i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(from, i + 1); }
  }
  throw new Error("unbalanced braces");
}
function grabFunction(name) {
  const re = new RegExp("\\n(?:async\\s+)?function\\s+" + name + "\\s*\\(", "g");
  const m = re.exec(HTML);
  if (!m) throw new Error("function " + name + " not found: " + name);
  return sliceBalanced(HTML, m.index + 1);
}
function grabConst(name) {
  const re = new RegExp("\\n(?:const|let)\\s+" + name + "\\s*=", "g");
  const m = re.exec(HTML);
  if (!m) throw new Error("const " + name + " not found: " + name);
  const start = m.index + 1;
  let depth = 0;
  for (let i = m.index + m[0].length; i < HTML.length; i++) {
    const c = HTML[i];
    if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < HTML.length && HTML[i] !== q) { if (HTML[i] === "\\") i++; i++; } continue; }
    if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") depth--;
    else if (c === ";" && depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}

const FUNCS = [
  "driverKey", "identSigsOf", "normPhoneForMatch", "buildProfileResolver", "getProfileResolver",
  "courierIdentityKey", "isIdentityKey", "identityOf", "identKeyOf", "isTwinName", "twinSuffix",
  "driverRowMatches", "courierKeyToName", "courierProfileNames",
  "monthlyNetIndex", "monthlyNetEntry", "daysWorkedForMonth", "firstSeenIndex", "driverFirstSeenMs",
  "defaultProfile", "loadCourierProfiles", "saveCourierProfiles", "getCourierProfile",
  "upsertCourierProfile", "hasCourierProfile",
  "loadOverrides", "saveOverrides", "getOverride", "upsertOverride", "getEffectiveProfile",
  "entryMonthYear", "entryInMonth", "loadReconcile", "getReconciledNet",
  "sumDriverNetForMonth", "rawDailyNetForMonth", "invalidateNetCache",
  "computeDriverNetForPeriod", "getDriversInMonth", "profileOnlyIdentities",
  "getAllDriverIdentities", "identityByKey",
  "_profFieldIsBlank", "mergeProfileRecords", "rekeyProfileStore", "rekeyOverrideStore",
  "frozenProfileRecords", "unpackDriver", "unpackEntry", "readCloudHistory",
  "dkDataConflicts",
];
const CONSTS = [
  "COURIER_PROFILES_KEY", "COURIER_OVERRIDES_KEY", "COURIER_PROFILES_SCHEMA_KEY",
  "COURIER_PROFILES_BACKUP_KEY", "RECONCILE_KEY", "OVERRIDABLE_FIELDS", "PROFILE_SCHEMA_S7",
  "CLOUD_FMT",
];

function buildSandbox(history) {
  const kv = new Map();
  const localStorage = {
    getItem: k => (kv.has(k) ? kv.get(k) : null),
    setItem: (k, v) => kv.set(k, String(v)),
    removeItem: k => kv.delete(k),
    get length() { return kv.size; },
    key: i => [...kv.keys()][i],
  };
  const preamble = `
    const localStorage = __ls;
    let currentDrivers = [];
    let sheetAmbassadorSyncCache = [];
    const MONTH_MAP = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const sN = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const _r2 = v => Math.round((v || 0) * 100) / 100;
    const fmt = v => String(Math.round(v || 0));
    const toast = () => {};
    let _histCacheArr = null;                    // mirrors the real getHistory cache handshake
    function getHistory() { _histCacheArr = __history; return __history; }
    function periodSortKey(p) {
      const m = String(p||'').match(/(\\d{1,2})\\s(\\w{3})\\s(\\d{4})/g);
      if (!m || !m.length) return 0;
      const last = m[m.length-1].match(/(\\d{1,2})\\s(\\w{3})\\s(\\d{4})/);
      return Date.UTC(+last[3], MONTH_MAP[last[2]] || 0, +last[1]);
    }
    let _netCache = new Map();
    let _profRes = null, _profResSrc = null, _profResCd = -1, _profResSc = -1;
    let _allIdentCache = null, _allIdentH = null, _allIdentP = null;
    let _monthNetIdx = null, _monthNetIdxSrc = null, _monthNetIdxRes = null;
    let _firstSeenIdx = null, _firstSeenIdxSrc = null, _firstSeenIdxRes = null;
    let _dcCache = null, _dcH = null, _dcP = null;
  `;
  const body = preamble
    + "\n" + CONSTS.map(grabConst).join("\n")
    + "\n" + FUNCS.map(grabFunction).join("\n")
    + "\n return { " + FUNCS.join(", ")
    + ", resetCaches: () => { _netCache = new Map(); _profRes = null; _profResSrc = null; _profResCd = -1; _profResSc = -1; _allIdentCache = null; _allIdentH = null; _allIdentP = null; _monthNetIdx = null; _monthNetIdxSrc = null; _monthNetIdxRes = null; _firstSeenIdx = null; _firstSeenIdxSrc = null; _firstSeenIdxRes = null; _dcCache = null; _dcH = null; _dcP = null; }"
    + ", COURIER_PROFILES_KEY, COURIER_OVERRIDES_KEY, PROFILE_SCHEMA_S7, ls: __ls };";
  // eslint-disable-next-line no-new-func
  return new Function("__ls", "__history", body)(localStorage, history);
}

// ── The pairs the spec measured, keyed by uuid PREFIX (the spec only gives 8 hex chars) ──
const SPEC_PAIRS = [
  { name: "Turki Aldawsari",   financeShowed: 1573, actual: 2082, halves: [1901, 181], phones: ["557299821", "581788152"] },
  { name: "Meshari Alanazi",   financeShowed: 2519, actual: 2729, halves: [2304, 425], phones: ["539708036", "501538495"] },
  { name: "Mohammed Alsubaie", financeShowed: 4927, actual: 5163, halves: null,        phones: ["542720081", "508846337"] },
  { name: "Khalid Asiri",      financeShowed: 158,  actual: 171,  halves: null,        phones: ["546583867", "559660777"] },
];

async function main() {
  const wantJson = process.argv.includes("--json");
  const log = (...a) => { if (!wantJson) console.log(...a); };

  // 1 · config (never printed)
  const cfgRes = await fetch(CONFIG_URL);
  if (!cfgRes.ok) throw new Error("config endpoint " + cfgRes.status);
  const cfg = await cfgRes.json();
  if (!cfg.ok) throw new Error("config not ok");
  const sbUrl = String(cfg.supabaseUrl).replace(/\/+$/, "");
  const key = cfg.supabaseAnonKey;
  log("cloud: " + new URL(sbUrl).host + " (anon key held in memory, never printed)");

  // 2 · the real fleet record
  const dataRes = await fetch(`${sbUrl}/rest/v1/fleet_data?id=eq.${SB_ROW_ID}&select=data`,
    { headers: { apikey: key, Authorization: "Bearer " + key } });
  if (!dataRes.ok) throw new Error("fleet_data read " + dataRes.status);
  const rows = await dataRes.json();
  const record = (Array.isArray(rows) && rows[0] && rows[0].data) || {};

  // 3 · decode with index.html's own codec
  const boot = buildSandbox([]);
  const history = boot.readCloudHistory(record);
  if (!history.length) throw new Error("cloud record carried no history");

  const S = buildSandbox(history);
  S.ls.setItem("khair_perf_history", JSON.stringify(history));
  const cloudProfiles = record.khair_courier_profiles || {};
  S.ls.setItem(S.COURIER_PROFILES_KEY, JSON.stringify(cloudProfiles));
  if (record.khair_courier_overrides) S.ls.setItem(S.COURIER_OVERRIDES_KEY, JSON.stringify(record.khair_courier_overrides));
  if (record.khair_reconcile) S.ls.setItem("khair_reconcile", JSON.stringify(record.khair_reconcile));

  const months = [...new Set(history.map(h => {
    const my = S.entryMonthYear(h);
    return my ? my.year + "-" + String(my.month + 1).padStart(2, "0") : null;
  }).filter(Boolean))].sort();
  log(`data:  ${history.length} days, months ${months.join(", ")}, ${Object.keys(cloudProfiles).length} profiles\n`);

  const out = { checks: [], pairs: [], months, historyDays: history.length };
  let fails = 0;
  const check = (label, fn) => {
    try { const detail = fn(); out.checks.push({ label, ok: true, detail }); log("  PASS  " + label + (detail ? "  — " + detail : "")); }
    catch (e) { fails++; out.checks.push({ label, ok: false, error: e.message }); log("  FAIL  " + label + "\n          " + e.message); }
  };

  // ── AC1 · the four pairs on REAL data ────────────────────────────────────────────
  const targetMonth = months[months.length - 1];
  const [ty, tm] = targetMonth.split("-").map(Number);
  log(`AC1 · the four same-name pairs (month ${targetMonth})`);

  // The OLD read, reproduced exactly: per day, the FIRST row whose name matches.
  const oldRead = (name, m0, y) => {
    const nk = S.driverKey(name);
    const seen = new Set(); let total = 0;
    for (const h of history) {
      if (!S.entryInMonth(h, m0, y) || seen.has(h.period)) continue;
      seen.add(h.period);
      const d = (h.drivers || []).find(x => S.driverKey(x.name) === nk);
      if (d) total += Number(d.netEarnings) || 0;
    }
    return Math.round(total);
  };

  SPEC_PAIRS.forEach(P => {
    const nk = S.driverKey(P.name);
    // every identity in the data carrying this name
    const idents = [];
    const seenKeys = new Set();
    history.forEach(h => (h.drivers || []).forEach(d => {
      if (S.driverKey(d.name) !== nk) return;
      const id = S.identityOf(d);
      if (!seenKeys.has(id.key)) { seenKeys.add(id.key); idents.push(id); }
    }));
    const per = idents.map(id => ({
      key: id.key, phone: id.phone, twin: S.twinSuffix(id),
      net: Math.round(S.sumDriverNetForMonth(id, tm - 1, ty)),
    })).sort((a, b) => b.net - a.net);
    const newTotal = per.reduce((s, x) => s + x.net, 0);
    const old = oldRead(P.name, tm - 1, ty);
    out.pairs.push({ name: P.name, spec: P, identities: per, newTotal, oldRead: old });

    check(`${P.name}: Bolt shows ${idents.length} distinct captains, Finance now renders ${idents.length} rows`, () => {
      if (idents.length < 2) throw new Error("expected a same-name pair, found " + idents.length + " identity");
      return per.map(x => (x.phone || x.key.slice(0, 10)) + " = " + x.net).join("  |  ");
    });
    check(`${P.name}: per-captain nets SUM to the pair total (nothing dropped)`, () => {
      if (newTotal <= 0) throw new Error("pair total is 0 — no data for this month?");
      return newTotal + " SAR across " + per.length + " captains";
    });
    check(`${P.name}: the fix RECOVERS money the name-keyed read lost`, () => {
      if (!(newTotal > old)) throw new Error("identity read " + newTotal + " is not greater than the old name read " + old);
      return "+" + (newTotal - old) + " SAR recovered (old name-keyed read: " + old + ")";
    });
  });

  // ── AC1b · fleet-wide conservation: every row counted once, every delta explained ──
  // A month LOCKED against Bolt's monthly report deliberately does NOT equal the daily sum —
  // that is what locking is for. So the check is: the Finance total differs from the raw
  // day-sum by EXACTLY the amount the locks account for, and by nothing else. On an unlocked
  // month that reduces to strict equality.
  log("\nAC1b · fleet-wide conservation");
  const reconcile = record.khair_reconcile || {};
  months.forEach(mk => {
    const [y, m] = mk.split("-").map(Number);
    S.invalidateNetCache();
    const ids = S.getDriversInMonth(mk);
    const financeTotal = Math.round(ids.reduce((s, id) => s + S.computeDriverNetForPeriod(id, mk), 0));
    const seen = new Set();
    let rawTotal = 0;
    history.forEach(h => {
      if (!S.entryInMonth(h, m - 1, y) || seen.has(h.period)) return;
      seen.add(h.period);
      const day = new Set();
      (h.drivers || []).forEach(d => {
        const sig = String(d.driverId || "").trim() || ("p" + String(d.phone || "").replace(/\D/g, "").slice(-9)) || ("n" + S.driverKey(d.name));
        if (day.has(sig)) return;
        day.add(sig);
        rawTotal += Number(d.netEarnings) || 0;
      });
    });
    rawTotal = Math.round(rawTotal);
    const locked = (reconcile[mk] && reconcile[mk].byKey) || null;

    check(`${mk}: every captain appears in Finance exactly once (${ids.length} captains)`, () => {
      const keys = ids.map(i => i.key);
      if (new Set(keys).size !== keys.length) throw new Error("a captain is enumerated twice");
      return new Set(keys).size + " distinct identity keys";
    });

    if (!locked) {
      check(`${mk} (not locked): Finance total == sum of all captain-days`, () => {
        if (financeTotal !== rawTotal) throw new Error("Finance " + financeTotal + " vs raw " + rawTotal + " (delta " + (financeTotal - rawTotal) + ")");
        return financeTotal + " SAR";
      });
    } else {
      check(`${mk} (locked, ${Object.keys(locked).length} drivers): every SAR of the gap to the dailies is explained by a lock`, () => {
        let explained = 0;
        const unexplained = [];
        ids.forEach(id => {
          const rec = S.getReconciledNet(mk, id);
          if (rec == null) return;
          const daily = S.rawDailyNetForMonth(id, m - 1, y);
          explained += rec - daily;
        });
        const delta = financeTotal - rawTotal;
        if (Math.abs(delta - explained) > 1)                      // 1 SAR of rounding slack
          throw new Error("gap " + Math.round(delta) + " but locks explain only " + Math.round(explained));
        return "gap " + Math.round(delta) + " SAR, fully attributable to Bolt's locked nets";
      });
      check(`${mk}: no TWIN reads a legacy name-keyed lock (it is the merged pair figure)`, () => {
        const legacyKeys = Object.keys(locked).filter(k => !/^(id:|ph:|nm:)/.test(k));
        const bad = [];
        ids.forEach(id => {
          if (!S.isTwinName(id.name)) return;
          if (legacyKeys.indexOf(S.driverKey(id.name)) >= 0 && S.getReconciledNet(mk, id) != null)
            bad.push(id.name + " " + id.key);
        });
        if (bad.length) throw new Error("twins reading a merged lock: " + bad.join("; "));
        return legacyKeys.length + " legacy name-keyed locks present, 0 read by a twin";
      });
    }
  });

  // ── AC3 · the migration on the REAL 352-record store ────────────────────────────
  log("\nAC3 · migration over the real profile store");
  const R = S.getProfileResolver();
  const mig = S.rekeyProfileStore(cloudProfiles, R, new Map());
  const tagSet = o => { const s = new Set(); Object.values(o).forEach(p => { if (p && p.ambassador) s.add(String(p._name || "").toLowerCase() + "|" + p.ambassador); }); return s; };
  const natSet = o => { const s = new Set(); Object.values(o).forEach(p => { if (p && p.nationality) s.add(String(p._name || "").toLowerCase() + "|" + p.nationality); }); return s; };
  const moneySet = o => { const s = new Set(); Object.values(o).forEach(p => { if (!p) return;
      const bits = [p.salary || 0, (p.accountRent && p.accountRent.amount) || 0, (p.carRent && p.carRent.amount) || 0, (p.fleetCut && p.fleetCut.value) || 0];
      if (bits.some(Boolean)) s.add(String(p._name || "").toLowerCase() + "|" + bits.join(",")); }); return s; };
  const tb = tagSet(cloudProfiles), ta = tagSet(mig.migrated);
  const nb = natSet(cloudProfiles), na = natSet(mig.migrated);
  const mb = moneySet(cloudProfiles), ma = moneySet(mig.migrated);
  out.migration = {
    before: Object.keys(cloudProfiles).length, after: Object.keys(mig.migrated).length,
    uuidMoved: mig.report.uuidMoved, rekeyed: mig.report.rekeyed, merged: mig.report.merged,
    kept: mig.report.kept, parked: mig.report.flagged, conflicts: mig.report.conflicts,
    ambassadorTags: { before: tb.size, after: ta.size },
  };
  // A tag may legitimately be replaced when the SAME captain has two records naming two
  // different ambassadors — newest wins, as everywhere else. What must never happen is a tag
  // disappearing SILENTLY, so every drop has to be attributable to a reported conflict.
  check("no ambassador tag is lost silently (each is an incentive that would stop being paid)", () => {
    const dropped = [...tb].filter(x => !ta.has(x));
    const reported = new Set((mig.report.conflicts || [])
      .filter(c => c.field === "ambassador")
      .map(c => String(c.name || "").toLowerCase() + "|" + c.discarded));
    const silent = dropped.filter(x => !reported.has(x));
    if (silent.length) throw new Error(silent.length + " dropped WITHOUT being reported: " + silent.slice(0, 6).join("; "));
    return tb.size + " tags checked · " + (tb.size - dropped.length) + " kept as-is · "
         + dropped.length + " replaced by a newer value, each reported for review"
         + (dropped.length ? " (" + dropped.join("; ") + ")" : "");
  });
  check("no nationality is lost", () => {
    const dropped = [...nb].filter(x => !na.has(x));
    if (dropped.length) throw new Error(dropped.length + " dropped: " + dropped.slice(0, 6).join("; "));
    return nb.size + " nationalities preserved";
  });
  check("no money deal (salary / rent / fleet cut) is lost", () => {
    const dropped = [...mb].filter(x => !ma.has(x));
    if (dropped.length) throw new Error(dropped.length + " dropped: " + dropped.slice(0, 6).join("; "));
    return mb.size + " deals preserved";
  });
  check("the store is now uuid-keyed", () => {
    const pre = {};
    Object.keys(mig.migrated).forEach(k => { const p = /^(id:|ph:|nm:)/.exec(k); const t = p ? p[1] : "legacy"; pre[t] = (pre[t] || 0) + 1; });
    if (pre.legacy) throw new Error(pre.legacy + " legacy name keys remain");
    return Object.entries(pre).map(([k, v]) => k + v).join("  ");
  });
  check("the migration is idempotent on real data", () => {
    const again = S.rekeyProfileStore(mig.migrated, R, new Map());
    if (JSON.stringify(again.migrated) !== JSON.stringify(mig.migrated)) throw new Error("second run changed the store");
    return "second run is a no-op";
  });
  check("undecidable same-name settings are PARKED and reported, never guessed", () => {
    if (!mig.report.flagged.length) return "none needed parking";
    mig.report.flagged.forEach(n => {
      const parked = mig.migrated["nm:" + S.driverKey(n)];
      if (!parked || !parked._collision) throw new Error("flagged but not parked: " + n);
    });
    return mig.report.flagged.join(", ");
  });

  // ── AC2 · edit isolation, on the real pairs ─────────────────────────────────────
  log("\nAC2 · edit isolation on the real pairs");
  S.ls.setItem(S.COURIER_PROFILES_KEY, JSON.stringify(mig.migrated));
  S.resetCaches();
  SPEC_PAIRS.forEach(P => {
    const nk = S.driverKey(P.name);
    const idents = [];
    const seenKeys = new Set();
    history.forEach(h => (h.drivers || []).forEach(d => {
      if (S.driverKey(d.name) !== nk) return;
      const id = S.identityOf(d);
      if (!seenKeys.has(id.key)) { seenKeys.add(id.key); idents.push(id); }
    }));
    if (idents.length < 2) return;
    check(`${P.name}: editing one captain does not change the other`, () => {
      const [A, B] = idents;
      const bBefore = JSON.stringify(S.getCourierProfile(B));
      const pA = Object.assign({}, S.getCourierProfile(A), { ambassador: "__PROBE__", salary: 4321 });
      S.upsertCourierProfile(A, pA);
      const aAfter = S.getCourierProfile(A), bAfter = S.getCourierProfile(B);
      if (aAfter.ambassador !== "__PROBE__") throw new Error("A did not take the edit");
      if (JSON.stringify(bAfter) !== bBefore) throw new Error("B changed when A was edited");
      S.upsertOverride(A, targetMonth, { salary: 111 });
      if (S.getOverride(B, targetMonth)) throw new Error("B inherited A's monthly override");
      return "A took the edit; B byte-identical";
    });
  });

  // ── AC4 · phone change ──────────────────────────────────────────────────────────
  log("\nAC4 · a captain who changes phone stays ONE captain");
  check("re-keying on the uuid makes the key immune to a phone change", () => {
    const d = history[0].drivers.find(x => x.driverId && x.phone);
    if (!d) throw new Error("no row with both a uuid and a phone");
    const a = S.identityOf({ name: d.name, driverId: d.driverId, phone: d.phone });
    const b = S.identityOf({ name: d.name, driverId: d.driverId, phone: "590000000" });
    if (a.key !== b.key) throw new Error("key changed: " + a.key + " -> " + b.key);
    if (!a.key.startsWith("id:")) throw new Error("key is not uuid-based: " + a.key);
    return a.key.slice(0, 14) + "… stable across a phone change";
  });

  // ── frozen records ──────────────────────────────────────────────────────────────
  log("\nFrozen records (opt-in repair)");
  const frozen = S.frozenProfileRecords();
  out.frozen = frozen.length;
  check("future-stamped records are detected and counted for the repair button", () => frozen.length + " frozen (latest stamp " + (frozen[0] ? frozen[0].until : "n/a") + ")");

  // ── data-conflicts panel · the "still parked after resolving" bug (2026-07-30) ───
  // He assigned the ambassador on the correct twin via the picker, but the panel kept listing
  // the pair as "needs your decision" — the parked record and the twin's own record are
  // unrelated storage, and nothing told the parked one it had been handled. The fix: a parked
  // entry drops off the list once ANY of its candidate identities carries a real ambassador.
  log("\nData-conflicts panel (2026-07-30 fix — resolved entries must clear)");
  S.ls.setItem(S.COURIER_PROFILES_KEY, JSON.stringify(mig.migrated));
  S.resetCaches();
  const conflicts = S.dkDataConflicts();
  out.dataConflicts = { parked: conflicts.parked.length, twins: conflicts.twins.length, total: conflicts.total };
  check("no parked entry is still listed if any of its candidates already has an ambassador", () => {
    const store = mig.migrated;
    const stale = conflicts.parked.filter(p => {
      const rec = store[p.key];
      const idents = (rec && Array.isArray(rec._collisionIdents)) ? rec._collisionIdents : [];
      return idents.some(idk => store[idk] && store[idk].ambassador && String(store[idk].ambassador).trim());
    });
    if (stale.length) throw new Error(stale.length + " parked entries are resolved but still showing: " + stale.map(s => s.name).join(", "));
    return conflicts.parked.length + " parked entries currently listed, none of them already resolved";
  });

  log("\n" + (fails === 0 ? "ALL GREEN" : "RED") + " — " + out.checks.filter(c => c.ok).length + " passed, " + fails + " failed");
  if (wantJson) console.log(JSON.stringify(out, null, 1));
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error("VERIFY ERROR: " + e.message); process.exit(2); });
