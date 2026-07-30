"use strict";
/**
 * IDENTITY UNIFICATION test mirror  (BOLT_IDENTITY_UNIFICATION_SPEC.md, S7)
 *
 * Guards the fix for the money bug in the spec: the dashboard identified captains three
 * different ways, and Finance keyed on the NAME — so two captains sharing a name collapsed
 * into one row AND lost a day's earnings each time both of them worked.
 *
 * The functions under test are EXTRACTED FROM index.html by name and evaluated here, exactly
 * like tests/codec_parity.test.js does for the c1 codec. Nothing is re-implemented, so this
 * test cannot pass against a copy that has drifted from the shipped page.
 *
 * Covers the spec's acceptance criteria:
 *   AC1  each same-name pair is two rows, per-uuid nets exact, and Finance == Captains
 *   AC2  editing one twin's profile/override never touches the other's
 *   AC3  the migration orphans no profile (ph: -> id: carried; undecidable ones parked)
 *   AC4  a captain who CHANGES PHONE is still one person (Build-191 regression guard)
 *   plus: shared-phone poisoning, reconcile keying, idempotency, Model B two accounts.
 *
 * Run (host Node is bundled in Kimi, not on PATH):
 *   node tests/identity_unification.test.js
 * Exit code 0 = pass, 1 = fail.
 */

const fs = require("fs");
const path = require("path");

// ── Extract named top-level declarations from index.html by brace matching ──────────
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function sliceBalanced(src, from) {
  // from = index of the 'f' in "function". Walk to the first '{' then brace-count out,
  // skipping strings, template literals, regex-ish slashes and comments well enough for
  // this file's style.
  let i = src.indexOf("{", from);
  if (i < 0) throw new Error("no body brace after offset " + from);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {           // skip a string / template
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        else if (q === "`" && src[i] === "$" && src[i + 1] === "{") {
          let d = 1; i += 2;
          while (i < src.length && d > 0) {              // skip ${ ... } (may nest)
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
  throw new Error("unbalanced braces from offset " + from);
}

function grabFunction(name) {
  const re = new RegExp("\\n(?:async\\s+)?function\\s+" + name + "\\s*\\(", "g");
  const m = re.exec(HTML);
  if (!m) throw new Error("function " + name + " not found in index.html — an anchor moved; update this test.");
  return sliceBalanced(HTML, m.index + 1);
}
function grabConst(name) {
  // `const NAME = …;` — may span lines (OVERRIDABLE_FIELDS does), so scan to the terminating
  // semicolon at bracket depth 0 rather than to the end of the line.
  const re = new RegExp("\\n(?:const|let)\\s+" + name + "\\s*=", "g");
  const m = re.exec(HTML);
  if (!m) throw new Error("const " + name + " not found in index.html");
  const start = m.index + 1;
  let depth = 0;
  for (let i = m.index + m[0].length; i < HTML.length; i++) {
    const c = HTML[i];
    if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < HTML.length && HTML[i] !== q) { if (HTML[i] === "\\") i++; i++; } continue; }
    if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") depth--;
    else if (c === ";" && depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error("unterminated declaration for " + name);
}

const FUNCS = [
  // identity core
  "driverKey", "identSigsOf", "normPhoneForMatch", "buildProfileResolver", "getProfileResolver",
  "courierIdentityKey", "isIdentityKey", "identityOf", "identKeyOf", "identNameOf", "isTwinName", "twinSuffix",
  "driverRowMatches", "courierKeyToName", "courierProfileNames",
  // profile store
  "defaultProfile", "loadCourierProfiles", "saveCourierProfiles",
  "getCourierProfile", "upsertCourierProfile", "hasCourierProfile",
  // overrides
  "loadOverrides", "saveOverrides", "overrideKey", "getOverride", "upsertOverride", "getEffectiveProfile",
  // money
  "entryMonthYear", "entryInMonth", "loadReconcile", "getReconciledNet",
  "monthlyNetIndex", "monthlyNetEntry", "daysWorkedForMonth", "firstSeenIndex", "driverFirstSeenMs",
  "sumDriverNetForMonth", "rawDailyNetForMonth", "invalidateNetCache",
  "computeDriverNetForPeriod", "getDriversInMonth", "profileOnlyIdentities",
  "getAllDriverIdentities", "identityByKey",
  // migrations
  "_profFieldIsBlank", "mergeProfileRecords", "rekeyProfileStore", "rekeyOverrideStore", "frozenProfileRecords",
  // merge
  "mergeStampedByKey",
  // data-conflicts panel
  "dkDataConflicts",
];
const CONSTS = [
  "COURIER_PROFILES_KEY", "COURIER_OVERRIDES_KEY", "COURIER_PROFILES_SCHEMA_KEY",
  "COURIER_PROFILES_BACKUP_KEY", "RECONCILE_KEY", "OVERRIDABLE_FIELDS", "PROFILE_SCHEMA_S7",
];

// ── Sandbox: only what the extracted code actually touches ─────────────────────────
function buildSandbox(history) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    get length() { return store.size; },
    key: i => [...store.keys()][i],
  };
  const preamble = `
    const localStorage = __ls;
    let currentDrivers = [];
    let sheetAmbassadorSyncCache = [];
    let stageSnapshotCache = [];
    const MONTH_MAP = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const sN = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const fmt = v => String(Math.round(v || 0));
    const toast = () => {};
    const monthLabel = m => m;
    // Mirrors the real getHistory's cache handshake: a stable array reference while the data is
    // unchanged. The net/first-seen indexes memoise against _histCacheArr, so the stub must
    // maintain it or they would never see a cache hit (and the perf claim would be untested).
    let _histCacheArr = null;
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
    let _dcCache = null, _dcH = null, _dcP = null;
    let _monthNetIdx = null, _monthNetIdxSrc = null, _monthNetIdxRes = null;
    let _firstSeenIdx = null, _firstSeenIdxSrc = null, _firstSeenIdxRes = null;
  `;
  const body = preamble
    + "\n" + CONSTS.map(grabConst).join("\n")
    + "\n" + FUNCS.map(grabFunction).join("\n")
    + "\n return { " + FUNCS.join(", ") + ", "
    + "resetCaches: () => { _netCache = new Map(); _profRes = null; _profResSrc = null; _profResCd = -1; _profResSc = -1; _allIdentCache = null; _allIdentH = null; _allIdentP = null; _monthNetIdx = null; _monthNetIdxSrc = null; _monthNetIdxRes = null; _firstSeenIdx = null; _firstSeenIdxSrc = null; _firstSeenIdxRes = null; },"
    + "COURIER_PROFILES_KEY, COURIER_OVERRIDES_KEY, RECONCILE_KEY, PROFILE_SCHEMA_S7, ls: __ls };";
  // eslint-disable-next-line no-new-func
  const api = new Function("__ls", "__history", body)(localStorage, history);
  api._setHistory = h => { history.length = 0; h.forEach(x => history.push(x)); api.resetCaches(); };
  return api;
}

// ── Fixture: the four same-name pairs from the spec, with their real uuids/phones ───
const PAIRS = {
  turki:    { name: "Turki Aldawsari",   a: { id: "d0bae47e-0000-4000-8000-000000000001", ph: "557299821" }, b: { id: "a07cd173-0000-4000-8000-000000000002", ph: "581788152" }, netA: 1901, netB: 181,  total: 2082 },
  meshari:  { name: "Meshari Alanazi",   a: { id: "c3e33201-0000-4000-8000-000000000003", ph: "539708036" }, b: { id: "b0f1545a-0000-4000-8000-000000000004", ph: "501538495" }, netA: 2304, netB: 425,  total: 2729 },
  alsubaie: { name: "Mohammed Alsubaie", a: { id: "33e2387b-0000-4000-8000-000000000005", ph: "542720081" }, b: { id: "a90589ca-0000-4000-8000-000000000006", ph: "508846337" }, netA: 4800, netB: 363,  total: 5163 },
  asiri:    { name: "Khalid Asiri",      a: { id: "0a47be95-0000-4000-8000-000000000007", ph: "546583867" }, b: { id: "90181c43-0000-4000-8000-000000000008", ph: "559660777" }, netA: 150,  netB: 21,   total: 171  },
};

const row = (name, ident, net, extra) => Object.assign(
  { name, driverId: ident.id, phone: ident.ph, netEarnings: net, grossEarnings: net, orders: net > 0 ? 5 : 0, isActive: net > 0 }, extra || {});

// Days are built so that on SOME days both twins worked and A is listed first, on others B is
// first. That ordering is what the old name-keyed `.find` was sensitive to, and it is why the
// under-count was invisible: the total still looked plausible.
function buildHistory() {
  const P = PAIRS;
  const split = (v, parts) => {                       // deterministic split of v across `parts` days
    const out = [], base = Math.floor(v / parts);
    for (let i = 0; i < parts; i++) out.push(i === parts - 1 ? v - base * (parts - 1) : base);
    return out;
  };
  const days = [];
  const dayName = d => `${d} Jul 2026`;
  const tA = split(P.turki.netA, 3),   tB = split(P.turki.netB, 3);
  const mA = split(P.meshari.netA, 3), mB = split(P.meshari.netB, 3);
  const sA = split(P.alsubaie.netA, 2), sB = split(P.alsubaie.netB, 2);
  const kA = split(P.asiri.netA, 2),   kB = split(P.asiri.netB, 2);
  for (let i = 0; i < 3; i++) {
    const drivers = [];
    // alternate which twin Bolt lists first
    if (i % 2 === 0) { drivers.push(row(P.turki.name, P.turki.a, tA[i]), row(P.turki.name, P.turki.b, tB[i])); }
    else             { drivers.push(row(P.turki.name, P.turki.b, tB[i]), row(P.turki.name, P.turki.a, tA[i])); }
    if (i % 2 === 1) { drivers.push(row(P.meshari.name, P.meshari.a, mA[i]), row(P.meshari.name, P.meshari.b, mB[i])); }
    else             { drivers.push(row(P.meshari.name, P.meshari.b, mB[i]), row(P.meshari.name, P.meshari.a, mA[i])); }
    if (i < 2) {
      drivers.push(row(P.alsubaie.name, P.alsubaie.a, sA[i]), row(P.alsubaie.name, P.alsubaie.b, sB[i]));
      drivers.push(row(P.asiri.name, P.asiri.b, kB[i]), row(P.asiri.name, P.asiri.a, kA[i]));
    }
    // a captain with a UNIQUE name, as the control
    drivers.push(row("Solo Captain", { id: "50100000-0000-4000-8000-00000000000a", ph: "500111222" }, 300));
    days.push({ period: dayName(i + 1), drivers });
  }
  return days;
}

// ── Tiny assert harness ────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const results = [];
function check(label, fn) {
  try { fn(); pass++; results.push("  PASS  " + label); }
  catch (e) { fail++; results.push("  FAIL  " + label + "\n          " + e.message); }
}
function eq(actual, expected, what) {
  if (actual !== expected) throw new Error((what || "value") + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}
function ok(cond, msg) { if (!cond) throw new Error(msg || "expected truthy"); }

// ── Setup ──────────────────────────────────────────────────────────────────────────
const history = buildHistory();
const S = buildSandbox(history);
S.ls.setItem("khair_perf_history", JSON.stringify(history));   // getProfileResolver memo key
const identOf = (pair, which) => S.identityOf({ name: PAIRS[pair].name, driverId: PAIRS[pair][which].id, phone: PAIRS[pair][which].ph });

console.log("\n=== S7 IDENTITY UNIFICATION ===\n");

// ── 0 · the identity itself ────────────────────────────────────────────────────────
console.log("0 · identity keys");
check("a captain's canonical key is their Bolt uuid, not their phone", () => {
  const a = identOf("turki", "a");
  eq(a.key, "id:" + PAIRS.turki.a.id, "turki A key");
});
check("the two halves of a pair get DIFFERENT keys", () => {
  ok(identOf("turki", "a").key !== identOf("turki", "b").key, "twin keys collided");
});
check("a colliding name is reported as a twin; a unique one is not", () => {
  ok(S.isTwinName(PAIRS.turki.name), "Turki should be a twin name");
  ok(!S.isTwinName("Solo Captain"), "Solo Captain should not be a twin name");
});
check("the twin chip shows the phone's last 3 digits, and only for twins", () => {
  eq(S.twinSuffix(identOf("turki", "a")), "·" + PAIRS.turki.a.ph.slice(-3), "turki A suffix");
  eq(S.twinSuffix({ name: "Solo Captain", driverId: "50100000-0000-4000-8000-00000000000a", phone: "500111222" }), "", "solo suffix");
});

// ── 0b · a roster row's `key` is a NAME key — never mistake it for an identity ──────
// Found on prod: computeRosterForMonth rows carry `key` = driverKey(name) with the real identity
// in `ik`. identKeyOf trusted any `.key`, so every Today / Command Center lookup fell back to a
// name key and re-collapsed two twins onto one cache slot and one profile record.
console.log("\n0b · roster rows must not be mistaken for identities");
check("isIdentityKey only accepts a prefixed key", () => {
  ok(S.isIdentityKey("id:abc"), "id: should be an identity key");
  ok(S.isIdentityKey("ph:557299821"), "ph: should be an identity key");
  ok(S.isIdentityKey("nm:someone"), "nm: should be an identity key");
  ok(!S.isIdentityKey("turki aldawsari"), "a bare name key must NOT be an identity key");
  ok(!S.isIdentityKey(undefined), "undefined must not be an identity key");
});
check("a roster-shaped row resolves through its `ik`, not its name `key`", () => {
  const real = identOf("turki", "a");
  const rosterRow = { key: S.driverKey(PAIRS.turki.name), ik: real.key,
                      name: PAIRS.turki.name, driverId: PAIRS.turki.a.id, phone: PAIRS.turki.a.ph };
  eq(S.identKeyOf(rosterRow), real.key, "identKeyOf on a roster row");
  eq(S.identityOf(rosterRow).key, real.key, "identityOf on a roster row");
});
check("two roster-shaped twin rows do NOT collapse onto one key", () => {
  const A = identOf("turki", "a"), B = identOf("turki", "b");
  const rowA = { key: S.driverKey(PAIRS.turki.name), ik: A.key, name: PAIRS.turki.name, driverId: PAIRS.turki.a.id, phone: PAIRS.turki.a.ph };
  const rowB = { key: S.driverKey(PAIRS.turki.name), ik: B.key, name: PAIRS.turki.name, driverId: PAIRS.turki.b.id, phone: PAIRS.turki.b.ph };
  ok(S.identKeyOf(rowA) !== S.identKeyOf(rowB), "twin roster rows collapsed onto one key");
  eq(S.sumDriverNetForMonth(rowA, 6, 2026), PAIRS.turki.netA, "roster row A net");
  eq(S.sumDriverNetForMonth(rowB, 6, 2026), PAIRS.turki.netB, "roster row B net");
});
check("a roster row with NO ik still resolves from its uuid/phone", () => {
  const A = identOf("turki", "a");
  const row = { key: S.driverKey(PAIRS.turki.name), name: PAIRS.turki.name, driverId: PAIRS.turki.a.id, phone: PAIRS.turki.a.ph };
  eq(S.identityOf(row).key, A.key, "fell back to resolving the uuid");
});

// ── 0c · the month index must agree with a per-captain scan ─────────────────────────
console.log("\n0c · monthlyNetIndex agrees with scanning, and counts worked days");
check("the index returns the same net as summing that captain's rows by hand", () => {
  const mismatch = [];
  Object.keys(PAIRS).forEach(k => ["a", "b"].forEach(w => {
    const id = identOf(k, w);
    // by hand: per period, per distinct account, rows whose identity key matches
    const seenP = new Set(); let total = 0;
    history.forEach(h => {
      if (seenP.has(h.period)) return;
      seenP.add(h.period);
      const day = new Set();
      h.drivers.forEach(d => {
        if (S.courierIdentityKey(d) !== id.key) return;
        const sig = String(d.driverId || '') || ('p' + d.phone);
        if (day.has(sig)) return;
        day.add(sig);
        total += d.netEarnings;
      });
    });
    const viaIndex = S.rawDailyNetForMonth(id, 6, 2026);
    if (viaIndex !== total) mismatch.push(`${PAIRS[k].name}/${w}: index ${viaIndex} vs hand ${total}`);
  }));
  if (mismatch.length) throw new Error(mismatch.join("; "));
  return "8 captains agree";
});
check("worked-days counts a day ONCE per captain, and only when a row earned > 0", () => {
  // Turki A earns on 3 of the 3 July days in the fixture; B has a 0 day in the fixture
  const A = identOf("turki", "a");
  eq(S.daysWorkedForMonth(A, 6, 2026), 3, "Turki A worked days");
  const solo = S.identityOf({ name: "Solo Captain", driverId: "50100000-0000-4000-8000-00000000000a", phone: "500111222" });
  eq(S.daysWorkedForMonth(solo, 6, 2026), 3, "Solo worked days");
});
check("a captain with two accounts on one day counts ONE day but BOTH nets", () => {
  const hist4 = [{ period: "1 Jun 2026", drivers: [
    row("Two Acct", { id: "cc110000-0000-4000-8000-0000000000c1", ph: "532000001" }, 300),
    row("Two Acct", { id: "cc110000-0000-4000-8000-0000000000c1", ph: "532000001" }, 300),
  ] }];
  const S4 = buildSandbox(hist4);
  S4.ls.setItem("khair_perf_history", JSON.stringify(hist4));
  const id = S4.identityOf({ name: "Two Acct", driverId: "cc110000-0000-4000-8000-0000000000c1", phone: "532000001" });
  eq(S4.daysWorkedForMonth(id, 5, 2026), 1, "should be one worked day");
  eq(S4.rawDailyNetForMonth(id, 5, 2026), 300, "duplicate account row must not double-count");
});

// ── 1 · AC1 — the money splits, and the parts sum to the whole ─────────────────────
console.log("\n1 · AC1 · per-uuid money (the bug in the spec)");
Object.keys(PAIRS).forEach(k => {
  const P = PAIRS[k];
  check(`${P.name}: each uuid reports its OWN net (${P.netA} / ${P.netB})`, () => {
    eq(S.sumDriverNetForMonth(identOf(k, "a"), 6, 2026), P.netA, P.name + " A");
    eq(S.sumDriverNetForMonth(identOf(k, "b"), 6, 2026), P.netB, P.name + " B");
  });
  check(`${P.name}: the two rows sum to the real total (${P.total})`, () => {
    const sum = S.sumDriverNetForMonth(identOf(k, "a"), 6, 2026) + S.sumDriverNetForMonth(identOf(k, "b"), 6, 2026);
    eq(sum, P.total, P.name + " pair total");
  });
});
check("a bare AMBIGUOUS name resolves to neither captain (never one's money)", () => {
  // 'nm:' key -> no rows match -> 0. The point is that it is NOT silently one of the pair.
  const byName = S.sumDriverNetForMonth(PAIRS.turki.name, 6, 2026);
  ok(byName !== PAIRS.turki.netA && byName !== PAIRS.turki.netB,
     "a bare twin name returned one captain's net (" + byName + ")");
});
check("a UNIQUE name still works by name alone (no regression)", () => {
  eq(S.sumDriverNetForMonth("Solo Captain", 6, 2026), 900, "Solo Captain 3 days x 300");
});

console.log("\n1b · AC1 · Finance enumeration == Captains population");
check("getDriversInMonth returns one entry per CAPTAIN, not per name", () => {
  const ids = S.getDriversInMonth("2026-07");
  const turkis = ids.filter(i => i.name === PAIRS.turki.name);
  eq(turkis.length, 2, "Turki rows in getDriversInMonth");
  eq(ids.length, 9, "total captains in July (4 pairs + 1 solo)");
});
check("summing every Finance row equals summing every captain's net (nothing dropped)", () => {
  const ids = S.getDriversInMonth("2026-07");
  const financeTotal = ids.reduce((s, id) => s + S.computeDriverNetForPeriod(id, "2026-07"), 0);
  const captainsTotal = history.reduce((s, h) => s + h.drivers.reduce((t, d) => t + d.netEarnings, 0), 0);
  eq(financeTotal, captainsTotal, "Finance total vs Captains total");
});
check("the OLD name-first-match algorithm really did under-count (the bug is real)", () => {
  // Reproduce the pre-S7 read: per day, the FIRST row whose name matches.
  const oldRead = name => {
    const nk = S.driverKey(name);
    let total = 0; const seen = new Set();
    for (const h of history) {
      if (seen.has(h.period)) continue;
      seen.add(h.period);
      const d = h.drivers.find(x => S.driverKey(x.name) === nk);
      if (d) total += d.netEarnings;
    }
    return total;
  };
  const old = oldRead(PAIRS.turki.name);
  ok(old < PAIRS.turki.total, "old read " + old + " should be less than the true " + PAIRS.turki.total);
});

// ── 2 · AC2 — edits do not bleed between twins ─────────────────────────────────────
console.log("\n2 · AC2 · edit isolation");
Object.keys(PAIRS).forEach(k => {
  const P = PAIRS[k];
  check(`${P.name}: a profile saved on one twin leaves the other untouched`, () => {
    const A = identOf(k, "a"), B = identOf(k, "b");
    const pA = Object.assign(S.defaultProfile(), { ambassador: "Omar-" + k, salary: 1234, nationality: "saudi" });
    S.upsertCourierProfile(A, pA);
    eq(S.getCourierProfile(A).ambassador, "Omar-" + k, "A ambassador after save");
    eq(S.getCourierProfile(B).ambassador, null, "B ambassador must stay unset");
    eq(S.getCourierProfile(B).salary, 0, "B salary must stay 0");
    ok(S.hasCourierProfile(A), "A should have a profile");
    ok(!S.hasCourierProfile(B), "B must NOT have a profile");
  });
  check(`${P.name}: a monthly override on one twin leaves the other untouched`, () => {
    const A = identOf(k, "a"), B = identOf(k, "b");
    S.upsertOverride(A, "2026-07", { salary: 999 });
    ok(!!S.getOverride(A, "2026-07"), "A override missing");
    eq(S.getOverride(B, "2026-07"), null, "B must have no override");
    eq(S.getEffectiveProfile(A, "2026-07").salary, 999, "A effective salary");
    eq(S.getEffectiveProfile(B, "2026-07").salary, 0, "B effective salary");
  });
});
check("a twin does NOT read a legacy name-keyed profile (it belongs to the pair)", () => {
  const st = S.loadCourierProfiles();
  st[S.driverKey(PAIRS.asiri.name)] = Object.assign(S.defaultProfile(), { ambassador: "LEGACY", _t: 1 });
  S.saveCourierProfiles(st);
  eq(S.getCourierProfile(identOf("asiri", "b")).ambassador, null, "twin B must not inherit the legacy tag");
});
check("a UNIQUE name DOES still read its legacy name-keyed profile (no blank-out)", () => {
  const st = S.loadCourierProfiles();
  st[S.driverKey("Solo Captain")] = Object.assign(S.defaultProfile(), { ambassador: "SOLO-LEGACY", _t: 1 });
  S.saveCourierProfiles(st);
  eq(S.getCourierProfile("Solo Captain").ambassador, "SOLO-LEGACY", "unambiguous legacy read");
});

// ── 3 · AC4 — a phone change must not create a second person ───────────────────────
console.log("\n3 · AC4 · phone change stays ONE captain (Build-191 guard)");
check("same uuid, new phone => same identity key", () => {
  const before = S.identityOf({ name: "Solo Captain", driverId: "50100000-0000-4000-8000-00000000000a", phone: "500111222" });
  const after  = S.identityOf({ name: "Solo Captain", driverId: "50100000-0000-4000-8000-00000000000a", phone: "599888777" });
  eq(after.key, before.key, "key changed when only the phone changed");
});
check("a profile saved before the phone change is still read after it", () => {
  const before = S.identityOf({ name: "Solo Captain", driverId: "50100000-0000-4000-8000-00000000000a", phone: "500111222" });
  S.upsertCourierProfile(before, Object.assign(S.defaultProfile(), { ambassador: "Stays" }));
  const after = S.identityOf({ name: "Solo Captain", driverId: "50100000-0000-4000-8000-00000000000a", phone: "599888777" });
  eq(S.getCourierProfile(after).ambassador, "Stays", "profile lost after a phone change");
});

// ── 4 · shared-phone poisoning (the reason uuid wins) ──────────────────────────────
console.log("\n4 · a phone on two uuids never merges two captains");
{
  const shared = "555000111";
  const hist2 = [{
    period: "1 Jun 2026",
    drivers: [
      row("Recycled One", { id: "11110000-0000-4000-8000-0000000000aa", ph: shared }, 700),
      row("Recycled Two", { id: "22220000-0000-4000-8000-0000000000bb", ph: shared }, 900),
    ],
  }];
  const S2 = buildSandbox(hist2);
  S2.ls.setItem("khair_perf_history", JSON.stringify(hist2));
  check("two captains sharing a phone keep separate keys and separate money", () => {
    const one = S2.identityOf({ name: "Recycled One", driverId: "11110000-0000-4000-8000-0000000000aa", phone: shared });
    const two = S2.identityOf({ name: "Recycled Two", driverId: "22220000-0000-4000-8000-0000000000bb", phone: shared });
    ok(one.key !== two.key, "shared phone merged two captains");
    eq(S2.sumDriverNetForMonth(one, 5, 2026), 700, "Recycled One net");
    eq(S2.sumDriverNetForMonth(two, 5, 2026), 900, "Recycled Two net");
  });
  check("driverRowMatches refuses to match across two different uuids", () => {
    const one = S2.identityOf({ name: "Recycled One", driverId: "11110000-0000-4000-8000-0000000000aa", phone: shared });
    const otherRow = hist2[0].drivers[1];
    ok(!S2.driverRowMatches(otherRow, one), "matched a different captain's row via the shared phone");
  });
}

// ── 5 · Model B — one person, two Bolt accounts ────────────────────────────────────
console.log("\n5 · Model B (two accounts) — money sums, a day counts once");
{
  const hist3 = [
    { period: "1 Jun 2026", drivers: [
      row("Model B Guy", { id: "bb110000-0000-4000-8000-0000000000b1", ph: "531000001" }, 400),
      row("Model B Guy", { id: "bb110000-0000-4000-8000-0000000000b1", ph: "531000001" }, 400), // duplicated row (merged entry)
    ] },
  ];
  const S3 = buildSandbox(hist3);
  S3.ls.setItem("khair_perf_history", JSON.stringify(hist3));
  check("a duplicated account row in one day is counted ONCE (no double-count)", () => {
    const id = S3.identityOf({ name: "Model B Guy", driverId: "bb110000-0000-4000-8000-0000000000b1", phone: "531000001" });
    eq(S3.sumDriverNetForMonth(id, 5, 2026), 400, "duplicate row double-counted");
  });
}

// ── 6 · AC3 — the migration orphans nothing ────────────────────────────────────────
console.log("\n6 · AC3 · migration (ph: -> id:, undecidable parked, idempotent)");
{
  const R = S.getProfileResolver();
  const legacyStore = {};
  // a phone-keyed profile for a captain the data knows -> must move to their uuid
  legacyStore["ph:" + PAIRS.turki.a.ph] = { ambassador: "PhoneKeyed", _name: PAIRS.turki.name, _t: 100 };
  // a phone-keyed profile for a phone the data has never seen -> must stay reachable as-is
  legacyStore["ph:900000000"] = { ambassador: "UnknownPhone", _name: "Ghost Captain", _t: 100 };
  // a legacy NAME key for a unique captain -> must move to their uuid
  legacyStore[S.driverKey("Solo Captain")] = { ambassador: "NameKeyed", _name: "Solo Captain", _t: 100 };
  // a legacy NAME key for a COLLIDING name with no evidence -> must be PARKED, not guessed
  legacyStore[S.driverKey(PAIRS.meshari.name)] = { ambassador: "Unknowable", _name: PAIRS.meshari.name, _t: 100 };
  const out1 = S.rekeyProfileStore(legacyStore, R, new Map());

  check("a ph:-keyed profile moves onto the captain's uuid", () => {
    eq(out1.migrated["id:" + PAIRS.turki.a.id].ambassador, "PhoneKeyed", "moved profile");
    ok(!("ph:" + PAIRS.turki.a.ph in out1.migrated), "old ph: key should be gone");
    eq(out1.report.uuidMoved, 1, "uuidMoved count");
  });
  check("a ph: key with no known uuid STAYS phone-keyed (still reachable, not dropped)", () => {
    eq(out1.migrated["ph:900000000"].ambassador, "UnknownPhone", "unknown-phone profile lost");
  });
  check("a legacy name key for a unique captain moves onto their uuid", () => {
    eq(out1.migrated["id:50100000-0000-4000-8000-00000000000a"].ambassador, "NameKeyed", "name-keyed move");
  });
  check("an undecidable same-name profile is PARKED, never handed to one twin", () => {
    const parked = out1.migrated["nm:" + S.driverKey(PAIRS.meshari.name)];
    ok(!!parked, "parked record missing");
    eq(parked._collision, true, "_collision flag");
    eq(parked._collisionIdents.length, 2, "candidate identities recorded");
    ok(!("id:" + PAIRS.meshari.a.id in out1.migrated), "twin A must not inherit the tag");
    ok(!("id:" + PAIRS.meshari.b.id in out1.migrated), "twin B must not inherit the tag");
    ok(out1.report.flagged.indexOf(PAIRS.meshari.name) >= 0, "not reported for a human");
  });
  check("no profile is LOST — every input key produces an output record", () => {
    eq(Object.keys(out1.migrated).length, Object.keys(legacyStore).length, "record count changed");
    const ambs = Object.values(out1.migrated).map(p => p.ambassador).sort();
    eq(JSON.stringify(ambs), JSON.stringify(["NameKeyed", "PhoneKeyed", "Unknowable", "UnknownPhone"]), "settings lost");
  });
  check("the migration is IDEMPOTENT — running it again changes nothing", () => {
    const out2 = S.rekeyProfileStore(out1.migrated, R, new Map());
    eq(JSON.stringify(out2.migrated), JSON.stringify(out1.migrated), "second run differed");
    eq(out2.report.uuidMoved, 0, "second run moved something");
  });
  check("sheet EVIDENCE (not a guess) does split a collision onto the right twin", () => {
    const evid = new Map();
    evid.set("id:" + PAIRS.meshari.b.id, new Set(["unknowable"]));   // the sheet says: this uuid was referred by 'Unknowable'
    const out3 = S.rekeyProfileStore(legacyStore, R, evid);
    eq(out3.migrated["id:" + PAIRS.meshari.b.id].ambassador, "Unknowable", "evidence-based split failed");
    ok(!("nm:" + S.driverKey(PAIRS.meshari.name) in out3.migrated), "should not be parked when evidence is clear");
    eq(out3.report.split, 1, "split count");
  });
  check("newest _t wins when two old keys land on the same uuid", () => {
    const dup = {};
    dup["ph:" + PAIRS.turki.a.ph] = { ambassador: "Older", _name: PAIRS.turki.name, _t: 100 };
    dup["id:" + PAIRS.turki.a.id] = { ambassador: "Newer", _name: PAIRS.turki.name, _t: 200 };
    const outD = S.rekeyProfileStore(dup, R, new Map());
    eq(outD.migrated["id:" + PAIRS.turki.a.id].ambassador, "Newer", "older record won a collision");
    eq(outD.report.conflicts.length, 1, "a real disagreement must be reported");
    eq(outD.report.conflicts[0].discarded, "Older", "discarded value not recorded");
  });

  // ── The defect found on his REAL 352-profile store (2026-07-30) ──────────────────
  // 24 captains had an OLDER ph: record holding their real ambassador plus a NEWER nm: shadow
  // record (written by the name-keyed-edit bug) whose ambassador was null. Plain key-level
  // newest-wins kept the shadow and ERASED 24 live ambassador tags — 24 incentives that would
  // silently stop being paid. A blank must never beat a real value.
  check("a NEWER record with a BLANK field does not erase an OLDER real value", () => {
    const shadowed = {};
    shadowed["ph:" + PAIRS.turki.a.ph] = { ...S.defaultProfile(), ambassador: "Engy", nationality: "saudi", _name: PAIRS.turki.name, _t: 100 };
    shadowed["nm:" + S.driverKey(PAIRS.turki.name) + "-x"] = null;   // placeholder, replaced below
    delete shadowed["nm:" + S.driverKey(PAIRS.turki.name) + "-x"];
    shadowed["id:" + PAIRS.turki.a.id] = { ...S.defaultProfile(), ambassador: null, nationality: "saudi", _name: PAIRS.turki.name, _t: 999 };
    const outS = S.rekeyProfileStore(shadowed, R, new Map());
    const rec = outS.migrated["id:" + PAIRS.turki.a.id];
    eq(rec.ambassador, "Engy", "the real ambassador tag was erased by a blank shadow record");
    eq(rec._t, 999, "the newer timestamp should be kept");
    eq(outS.report.conflicts.length, 0, "a blank-vs-real fill is not a conflict");
  });
  check("a real DISAGREEMENT still resolves newest-wins (not a blind fill)", () => {
    const two = {};
    two["ph:" + PAIRS.turki.a.ph] = { ...S.defaultProfile(), ambassador: "Boda", _name: PAIRS.turki.name, _t: 100 };
    two["id:" + PAIRS.turki.a.id] = { ...S.defaultProfile(), ambassador: "Khaled Met3eb", _name: PAIRS.turki.name, _t: 999 };
    const outT = S.rekeyProfileStore(two, R, new Map());
    eq(outT.migrated["id:" + PAIRS.turki.a.id].ambassador, "Khaled Met3eb", "newest should win a real disagreement");
    eq(outT.report.conflicts.length, 1, "the dropped value must be reported");
  });
  check("a default-valued field is recognised as blank; a real one is not", () => {
    ok(S._profFieldIsBlank("accountRent", { dir: "NONE", amount: 0 }), "default accountRent should be blank");
    ok(!S._profFieldIsBlank("accountRent", { dir: "OUT", amount: 900 }), "a real rent must not be blank");
    ok(S._profFieldIsBlank("salary", 0), "salary 0 is the default");
    ok(!S._profFieldIsBlank("salary", 2500), "a real salary must not be blank");
    ok(S._profFieldIsBlank("ambassador", null), "null ambassador is blank");
  });
  check("a MONEY field is never overwritten by a default (rent/salary/cut survive a merge)", () => {
    const m = {};
    m["ph:" + PAIRS.turki.a.ph] = { ...S.defaultProfile(), carRent: { dir: "OUT", amount: 1500 }, salary: 2500,
                                    fleetCut: { type: "PCT", value: 20 }, _name: PAIRS.turki.name, _t: 100 };
    m["id:" + PAIRS.turki.a.id] = { ...S.defaultProfile(), _name: PAIRS.turki.name, _t: 999 };
    const outM = S.rekeyProfileStore(m, R, new Map());
    const rec = outM.migrated["id:" + PAIRS.turki.a.id];
    eq(rec.carRent.amount, 1500, "car rent lost");
    eq(rec.salary, 2500, "salary lost");
    eq(rec.fleetCut.value, 20, "fleet cut lost");
  });
}

console.log("\n6c · override merge keeps sparse fields from both copies");
{
  const R = S.getProfileResolver();
  const all = {};
  // Same captain + month reachable under two prefixes, each carrying a DIFFERENT changed field.
  all["ph:" + PAIRS.turki.a.ph + "::2026-07"] = { carRent: { dir: "OUT", amount: 900 }, _t: 100 };
  all["id:" + PAIRS.turki.a.id + "::2026-07"] = { salary: 700, _t: 999 };
  const out = S.rekeyOverrideStore(all, R);
  check("an override field present in only the OLDER copy is not dropped", () => {
    const rec = out.migrated["id:" + PAIRS.turki.a.id + "::2026-07"];
    eq(rec.salary, 700, "newer field lost");
    ok(!!rec.carRent && rec.carRent.amount === 900, "older-only field was dropped");
  });
}

console.log("\n6b · override migration");
{
  const R = S.getProfileResolver();
  const all = {};
  all["ph:" + PAIRS.turki.a.ph + "::2026-07"] = { salary: 500, _t: 100 };
  all[S.driverKey("Solo Captain") + "::2026-06"] = { salary: 300, _t: 100 };
  all[S.driverKey(PAIRS.asiri.name) + "::2026-07"] = { salary: 700, _t: 100 };   // collision -> park
  const out = S.rekeyOverrideStore(all, R);
  check("a ph:-prefixed override moves onto the captain's uuid", () => {
    ok(!!out.migrated["id:" + PAIRS.turki.a.id + "::2026-07"], "override not moved");
  });
  check("a unique captain's legacy override moves onto their uuid", () => {
    ok(!!out.migrated["id:50100000-0000-4000-8000-00000000000a::2026-06"], "solo override not moved");
  });
  check("a same-name override is PARKED under nm:, never given to one twin", () => {
    ok(!!out.migrated["nm:" + S.driverKey(PAIRS.asiri.name) + "::2026-07"], "collision override not parked");
    ok(!("id:" + PAIRS.asiri.a.id + "::2026-07" in out.migrated), "twin A inherited the override");
    ok(!("id:" + PAIRS.asiri.b.id + "::2026-07" in out.migrated), "twin B inherited the override");
    ok(out.report.flagged.indexOf(S.driverKey(PAIRS.asiri.name)) >= 0, "not reported");
  });
  check("the override migration is IDEMPOTENT", () => {
    const again = S.rekeyOverrideStore(out.migrated, R);
    eq(JSON.stringify(again.migrated), JSON.stringify(out.migrated), "second run differed");
  });
  check("the month is preserved (keys keep their ::YYYY-MM suffix)", () => {
    Object.keys(out.migrated).forEach(k => ok(/::\d{4}-\d{2}$/.test(k), "malformed override key: " + k));
  });
}

// ── 6d · a parked ambassador conflict must clear itself once resolved ───────────────
// Bug found live on his dashboard (2026-07-30): he assigned the ambassador on the correct twin
// via the Ambassadors picker, but the "Needs your decision" panel kept listing the pair. The
// parked 'nm:' record and the twin's real id:-keyed record are two unrelated pieces of storage —
// assigning the ambassador writes only the twin's own record, and nothing ever told the parked
// entry it had been handled. dkDataConflicts must now recognise that and stop surfacing it.
console.log("\n6d · a resolved parked conflict stops appearing in the panel");
{
  const R = S.getProfileResolver();
  const store = {};
  store["nm:" + S.driverKey(PAIRS.asiri.name)] = {
    _name: PAIRS.asiri.name, ambassador: "Omar", _collision: true,
    _collisionIdents: ["id:" + PAIRS.asiri.a.id, "id:" + PAIRS.asiri.b.id],
  };
  S.saveCourierProfiles(store);
  check("an untouched parked conflict IS listed", () => {
    const c = S.dkDataConflicts();
    ok(c.parked.some(p => p.name === PAIRS.asiri.name), "parked entry missing before resolution");
  });
  check("assigning the ambassador on ONE twin clears it from the panel", () => {
    const A = identOf("asiri", "a");
    S.upsertCourierProfile(A, { ...S.defaultProfile(), ambassador: "Real Ambassador" });
    const c = S.dkDataConflicts();
    ok(!c.parked.some(p => p.name === PAIRS.asiri.name), "still listed after being resolved");
  });
  check("the OTHER twin is untouched by that assignment (still no ambassador)", () => {
    const B = identOf("asiri", "b");
    eq(S.getCourierProfile(B).ambassador, null, "twin B should not have inherited the tag");
  });
  check("a genuinely still-open conflict (neither twin assigned) keeps showing", () => {
    const store2 = {};
    store2["nm:" + S.driverKey(PAIRS.meshari.name)] = {
      _name: PAIRS.meshari.name, ambassador: "Someone", _collision: true,
      _collisionIdents: ["id:" + PAIRS.meshari.a.id, "id:" + PAIRS.meshari.b.id],
    };
    S.saveCourierProfiles(store2);
    const c = S.dkDataConflicts();
    ok(c.parked.some(p => p.name === PAIRS.meshari.name), "an unresolved conflict must still show");
  });
}

// ── 7 · month-end reconcile keying ─────────────────────────────────────────────────
console.log("\n7 · reconcile is identity-keyed");
{
  const A = identOf("turki", "a"), B = identOf("turki", "b");
  S.ls.setItem(S.RECONCILE_KEY, JSON.stringify({ "2026-07": { byKey: { ["id:" + PAIRS.turki.a.id]: 5000 } } }));
  S.invalidateNetCache();
  check("a locked month applies to the captain it was locked for, and only them", () => {
    eq(S.sumDriverNetForMonth(A, 6, 2026), 5000, "A should read Bolt's locked net");
    eq(S.sumDriverNetForMonth(B, 6, 2026), PAIRS.turki.netB, "B must fall back to their own daily sum");
  });
  S.ls.setItem(S.RECONCILE_KEY, JSON.stringify({ "2026-07": { byKey: { [S.driverKey(PAIRS.turki.name)]: 9999, [S.driverKey("Solo Captain")]: 1111 } } }));
  S.invalidateNetCache();
  check("a LEGACY name-keyed lock is ignored for a twin (it is the merged pair figure)", () => {
    eq(S.sumDriverNetForMonth(A, 6, 2026), PAIRS.turki.netA, "twin A wrongly read the merged lock");
    eq(S.sumDriverNetForMonth(B, 6, 2026), PAIRS.turki.netB, "twin B wrongly read the merged lock");
  });
  check("a LEGACY name-keyed lock is still honoured for a unique captain (no regression)", () => {
    eq(S.sumDriverNetForMonth("Solo Captain", 6, 2026), 1111, "unique captain lost its locked net");
  });
  S.ls.removeItem(S.RECONCILE_KEY);
  S.invalidateNetCache();
}

// ── 8 · frozen records + cloud-merge trap ──────────────────────────────────────────
console.log("\n8 · frozen records and the cloud merge");
check("frozenProfileRecords finds a future-stamped profile and nothing else", () => {
  const st = S.loadCourierProfiles();
  st["id:frozen-one"] = { _name: "Frozen Guy", ambassador: "X", _t: Date.now() + 5 * 365 * 86400000 };
  S.saveCourierProfiles(st);
  const f = S.frozenProfileRecords();
  eq(f.length, 1, "frozen count");
  eq(f[0].name, "Frozen Guy", "frozen name");
});
check("mergeStampedByKey still lets the NEWER copy win per key", () => {
  const merged = S.mergeStampedByKey({ k: { v: "cloud", _t: 200 } }, { k: { v: "local", _t: 100 } });
  eq(merged.k.v, "cloud", "newer cloud copy should win");
});

// ── Report ─────────────────────────────────────────────────────────────────────────
console.log("");
results.forEach(r => console.log(r));
console.log("\n" + (fail === 0 ? "ALL GREEN" : "RED") + " — " + pass + " passed, " + fail + " failed\n");
process.exit(fail === 0 ? 0 : 1);
