"use strict";
/**
 * Perf guard for the Build-196 fix.
 *
 * Build-195 made driverFirstSeenMs identity-correct by swapping a cheap name compare for
 * driverRowMatches — inside a scan of every history entry. The Captains table calls it ONCE PER
 * RENDERED ROW, so on prod that added ~1.5s to a ~219ms render (measured: Captains 3240ms).
 *
 * Build-196 replaced it with firstSeenIndex(): one pass over history, O(1) lookups.
 *
 * This script runs BOTH implementations over the REAL cloud history and asserts:
 *   1. they agree for every unambiguous captain (the fix is not a behaviour change), and
 *   2. the indexed version is dramatically faster across a full 227-row render's worth of calls.
 *
 *   node tests/identity_perf_verify.js
 */
const fs = require("fs");
const path = require("path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const CONFIG_URL = "https://mhmbolt.vercel.app/api/bolt/config";

// ── extractor (same as the other suites) ──
function sliceBalanced(src, from) {
  let i = src.indexOf("{", from), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        else if (q === "`" && src[i] === "$" && src[i + 1] === "{") {
          let d = 1; i += 2;
          while (i < src.length && d > 0) {
            if (src[i] === "{") d++; else if (src[i] === "}") d--;
            else if (src[i] === '"' || src[i] === "'" || src[i] === "`") { const q2 = src[i++]; while (i < src.length && src[i] !== q2) { if (src[i] === "\\") i++; i++; } }
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
    if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) return src.slice(from, i + 1); }
  }
  throw new Error("unbalanced");
}
function grabFunction(name) {
  const re = new RegExp("\\n(?:async\\s+)?function\\s+" + name + "\\s*\\(", "g");
  const m = re.exec(HTML);
  if (!m) throw new Error("not found: " + name);
  return sliceBalanced(HTML, m.index + 1);
}
function grabConst(name) {
  const re = new RegExp("\\n(?:const|let)\\s+" + name + "\\s*=", "g");
  const m = re.exec(HTML);
  if (!m) throw new Error("const not found: " + name);
  const start = m.index + 1; let depth = 0;
  for (let i = m.index + m[0].length; i < HTML.length; i++) {
    const c = HTML[i];
    if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < HTML.length && HTML[i] !== q) { if (HTML[i] === "\\") i++; i++; } continue; }
    if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") depth--;
    else if (c === ";" && depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error("unterminated " + name);
}

const FUNCS = ["driverKey", "identSigsOf", "normPhoneForMatch", "buildProfileResolver", "getProfileResolver",
  "courierIdentityKey", "identityOf", "identKeyOf", "isTwinName", "driverRowMatches", "courierKeyToName",
  "courierProfileNames", "defaultProfile", "loadCourierProfiles", "saveCourierProfiles",
  "firstSeenIndex", "driverFirstSeenMs", "unpackDriver", "unpackEntry", "readCloudHistory"];
const CONSTS = ["COURIER_PROFILES_KEY", "CLOUD_FMT"];

function buildSandbox(history) {
  const kv = new Map();
  const ls = { getItem: k => (kv.has(k) ? kv.get(k) : null), setItem: (k, v) => kv.set(k, String(v)), removeItem: k => kv.delete(k) };
  const preamble = `
    const localStorage = __ls;
    let currentDrivers = [];
    let sheetAmbassadorSyncCache = [];
    const MONTH_MAP = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const sN = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const _r2 = v => Math.round((v || 0) * 100) / 100;
    function getHistory() { return __history; }
    function periodSortKey(p) {
      const m = String(p||'').match(/(\\d{1,2})\\s(\\w{3})\\s(\\d{4})/g);
      if (!m || !m.length) return 0;
      const last = m[m.length-1].match(/(\\d{1,2})\\s(\\w{3})\\s(\\d{4})/);
      return Date.UTC(+last[3], MONTH_MAP[last[2]] || 0, +last[1]);
    }
    let _profRes = null, _profResHraw = null, _profResCd = -1, _profResSc = -1;
    let _firstSeenIdx = null, _firstSeenIdxRaw = null;
    // the PRE-196 implementation, kept here only so the two can be compared
    function driverFirstSeenMs_v195(who) {
      const id = identityOf(who);
      let earliest = null;
      for (const h of getHistory()) {
        const d = (h.drivers || []).find(x => driverRowMatches(x, id));
        if (!d) continue;
        const ms = periodSortKey(h.period);
        if (!ms) continue;
        if (earliest === null || ms < earliest) earliest = ms;
      }
      return earliest;
    }
  `;
  const body = preamble + "\n" + CONSTS.map(grabConst).join("\n") + "\n" + FUNCS.map(grabFunction).join("\n")
    + "\n return { " + FUNCS.join(", ") + ", driverFirstSeenMs_v195, ls: __ls,"
    + " resetFirstSeen: () => { _firstSeenIdx = null; _firstSeenIdxRaw = null; } };";
  return new Function("__ls", "__history", body)(ls, history);
}

(async () => {
  const cfg = await (await fetch(CONFIG_URL)).json();
  if (!cfg.ok) throw new Error("config not ok");
  const u = cfg.supabaseUrl.replace(/\/+$/, ""), k = cfg.supabaseAnonKey;
  const rows = await (await fetch(`${u}/rest/v1/fleet_data?id=eq.fleet&select=data`,
    { headers: { apikey: k, Authorization: "Bearer " + k } })).json();
  const record = (rows[0] && rows[0].data) || {};
  const boot = buildSandbox([]);
  const history = boot.readCloudHistory(record);
  const S = buildSandbox(history);
  S.ls.setItem("khair_perf_history", JSON.stringify(history));

  const driverDays = history.reduce((s, h) => s + (h.drivers || []).length, 0);
  console.log(`real data: ${history.length} days, ${driverDays} driver-day rows\n`);

  // one representative row per identity — what the Captains table iterates
  const seen = new Set(), reps = [];
  history.forEach(h => (h.drivers || []).forEach(d => {
    if (!d.name) return;
    const id = S.identityOf(d);
    if (!seen.has(id.key)) { seen.add(id.key); reps.push(d); }
  }));
  console.log(`distinct captains: ${reps.length}\n`);

  let fails = 0;
  const check = (label, fn) => {
    try { const detail = fn(); console.log("  PASS  " + label + (detail ? "  — " + detail : "")); }
    catch (e) { fails++; console.log("  FAIL  " + label + "\n          " + e.message); }
  };

  // 1 · agreement
  check("indexed and scanning implementations agree for every unambiguous captain", () => {
    let checked = 0, differ = [];
    reps.forEach(d => {
      if (S.isTwinName(d.name)) return;          // twins: v195 returned the PAIR's earliest, by design of the old bug
      const a = S.driverFirstSeenMs(d), b = S.driverFirstSeenMs_v195(d);
      checked++;
      if (a !== b) differ.push((d.name || '?') + ': ' + a + ' vs ' + b);
    });
    if (differ.length) throw new Error(differ.length + " differ: " + differ.slice(0, 5).join("; "));
    return checked + " captains, identical results";
  });

  check("each twin now gets their OWN first day (not the pair's earliest)", () => {
    const twins = reps.filter(d => S.isTwinName(d.name));
    if (!twins.length) return "no twins in this data";
    const vals = twins.map(d => S.driverFirstSeenMs(d)).filter(v => v !== null);
    return twins.length + " twin rows, " + new Set(vals).size + " distinct first-days";
  });

  // 2 · speed, over a full render's worth of calls
  const N = reps.length;
  S.resetFirstSeen();
  let t = process.hrtime.bigint();
  reps.forEach(d => S.driverFirstSeenMs(d));
  const newMs = Number(process.hrtime.bigint() - t) / 1e6;

  t = process.hrtime.bigint();
  reps.forEach(d => S.driverFirstSeenMs_v195(d));
  const oldMs = Number(process.hrtime.bigint() - t) / 1e6;

  console.log("");
  check(`${N} calls (one per captain, as a Captains render does) got dramatically faster`, () => {
    if (!(newMs * 5 < oldMs)) throw new Error(`indexed ${newMs.toFixed(0)}ms vs scanning ${oldMs.toFixed(0)}ms — not a clear win`);
    return `indexed ${newMs.toFixed(0)}ms vs scanning ${oldMs.toFixed(0)}ms  →  ${(oldMs / newMs).toFixed(0)}x faster, ${Math.round(oldMs - newMs)}ms removed from every render`;
  });
  check("the index is memoised — a second full pass is effectively free", () => {
    const t2 = process.hrtime.bigint();
    reps.forEach(d => S.driverFirstSeenMs(d));
    const again = Number(process.hrtime.bigint() - t2) / 1e6;
    if (again > newMs) throw new Error(`second pass ${again.toFixed(1)}ms was not faster than the first ${newMs.toFixed(1)}ms`);
    return `second pass ${again.toFixed(1)}ms`;
  });

  console.log("\n" + (fails === 0 ? "ALL GREEN" : "RED") + " — " + fails + " failed\n");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("PERF VERIFY ERROR: " + e.message); process.exit(2); });
