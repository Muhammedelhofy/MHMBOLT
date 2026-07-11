/**
 * M8 Build-43 · Option D — Speculative-Kernel → Conjecture bridge
 * lib/kernel-conjecture.js
 *
 * The first rung of the problem-solving engine. The Build-41/42 epistemic axis
 * already CLASSIFIES a fringe idea (vortex math, number patterns, "geometria")
 * and EXTRACTS its established KERNEL (e.g. "the digital root of a number cycles
 * mod 9"). This module makes that kernel DO WORK: it turns the kernel into a
 * concrete, machine-CHECKABLE number-pattern claim and tests it deterministically
 * by exhaustive computation — reporting "observed through N" or the first
 * counterexample. It NEVER proves anything and NEVER touches the speculative leap.
 *
 * HONESTY (load-bearing, mirrors the spine):
 *   - The strongest verdict is "observed by exhaustive computation through N" →
 *     verification_state 'empirical' AT MOST. NEVER 'proven' (only Lean proves),
 *     never "true for all n". A held claim is evidence-to-N, not a theorem.
 *   - The speculative LEAP is untouched and stays speculative. We only test the
 *     kernel-derived claim.
 *   - The LLM proposer can ONLY pick from a CLOSED, code-checkable template +
 *     generator whitelist. Anything off-schema → null. So the LLM cannot smuggle
 *     an unverifiable claim — the same discipline as the M3-lite generator
 *     (proposal narrowed to what the deterministic checker can falsify).
 *   - A kernel that yields no expressible computable claim → null ("couldn't form
 *     a checkable claim"), never a fabricated one.
 *
 * Pure functions for the checker (no eval, no BigInt — modular arithmetic only,
 * so it stays fast + exhaustive to large N). The proposer is the only async/LLM
 * part and fails safe → null. Mirrored by tests/kernel-conjecture-verify.ps1.
 */
const { generate } = require("./llm");
const { seedKnownMatch } = require("./seed-pack");
const { leanHealth, runLeanCheck } = require("./leanClient");

// ── tunables (FIXED) ──────────────────────────────────────────────
const N_DEFAULT = 10000;
const N_MIN     = 100;
const N_MAX     = 200000;     // exhaustive, modular — sub-second well past this
const MOD_MAX   = 1000;       // residue modulus cap
const PERIOD_MAX = 100;       // claimed period cap

// ── Build-R3 "Base-b lens" kill-switch (default ON) ────────────────
// Read at CALL time (not module load), mirroring M8_CITED_RECALL (knowledge-intake.js).
// OFF ⇒ TEMPLATES/GENERATORS whitelists, validateClaim, genValueMod resolution, and the
// proposer prompts are all byte-identical to pre-R3 — proven in tests/buildR3_baselens.test.js.
function baseLensEnabled() {
  const v = String(process.env.M8_BASE_LENS || "").trim().toLowerCase();
  return v !== "off" && v !== "0";
}
const BASE_MIN = 3;      // radix must be >=3 (radix=2 ⇒ modulus 1, a degenerate always-constant case)
const BASE_MAX = 1000;   // matches MOD_MAX's order of magnitude
const KGON_SIDES_MIN = 3;
const KGON_SIDES_MAX = 1000;
const PRIMES_MOD_BOUND_MAX = 20000;   // sieve-cost cap for the primes_mod generator

// ── Build-CM1 "Classical-math checker pack" kill-switch (default ON) ────────────
// Read at CALL time (not module load), exactly like M8_BASE_LENS / M8_CITED_RECALL.
// OFF ⇒ the CLASSICAL_TEMPLATES family is rejected by isTemplateAllowed/validateClaim/
// evaluateClaim exactly as if absent, detectClassicalMathTest never routes, runKernelTest's
// classical dispatch is skipped, and the digital-root proposer prompts are untouched EITHER WAY
// (this lane never edits buildProposeSystem/buildLiteralSystem/buildMultiProposeSystem — the
// R3 base-lens OFF-identity is preserved unchanged). Proven byte-identical in
// tests/buildCM1_classical_math.test.js.
function classicalMathEnabled() {
  const v = String(process.env.M8_CLASSICAL_MATH || "").trim().toLowerCase();
  return v !== "off" && v !== "0";
}
// Compute-cost caps (the classical analog of PRIMES_MOD_BOUND_MAX). Every integer the checkers
// construct stays < 2^53 (Number.MAX_SAFE_INTEGER), so the sum-of-proper-divisors + trial-
// division primality are EXACT without BigInt (all bounds hand-verified + Python-verified).
const CLASSICAL_INT_MAX  = Number.MAX_SAFE_INTEGER;   // hard exactness ceiling (2^53 - 1)
const AMICABLE_MAX       = 1000000000;   // |m|,|n| ceiling for an amicable-pair claim (1e9)
const PERFECT_MAX        = 1000000000000; // n ceiling for a perfect-number / aliquot claim (1e12)
const EUCLID_EXP_MIN     = 2;
const EUCLID_EXP_MAX     = 26;           // 2^(p-1)*(2^p-1) < 2^53 for p<=26 (verified)
const THABIT_INDEX_MIN   = 2;
const THABIT_INDEX_MAX   = 16;           // 2^n*(9*2^(2n-1)-1) < 2^53 for n<=16 (verified)

// ── Build-CM2 "Classical-math checker pack v2" kill-switch (default ON) ──────────
// Read at CALL time, exactly like M8_CLASSICAL_MATH / M8_BASE_LENS / M8_CITED_RECALL.
// OFF ⇒ the CLASSICAL_V2_TEMPLATES family (figurate_identity / pell_fundamental) is rejected by
// isTemplateAllowed/validateClaim/evaluateClaim exactly as if absent, detectClassicalMathV2Test
// never routes, runKernelTest's V2 dispatch is skipped, and NONE of the digital-root proposer
// prompts NOR the CM1 classical proposer prompt are touched EITHER WAY (this lane adds its OWN
// buildClassicalV2ProposeSystem and never edits buildProposeSystem/buildLiteralSystem/
// buildMultiProposeSystem/buildClassicalProposeSystem — the R3 base-lens + CM1 OFF-identities both
// stay byte-identical). Proven in tests/buildCM2_classical_math_v2.test.js.
function classicalMathV2Enabled() {
  const v = String(process.env.M8_CLASSICAL_MATH_V2 || "").trim().toLowerCase();
  return v !== "off" && v !== "0";
}
// Figurate identities are VERIFIED over a BOUNDED RANGE n=1..N by direct computation of BOTH sides
// (never asserted from the theorem). FIGURATE_N_MAX is chosen so the largest integer any identity
// constructs stays exact (< 2^53) WITHOUT BigInt: the binding case is Nicomachus's sum-of-cubes RHS
// T(n)^2, which at n=13000 is 7,141,348,542,250,000 < 2^53 (n=14000 overflows) — Python-verified.
const FIGURATE_N_MIN     = 100;
const FIGURATE_N_DEFAULT = 10000;
const FIGURATE_N_MAX     = 13000;
const FIGURATE_KINDS = ["hexagonal_triangular", "nicomachus_cubes", "square_consecutive_triangular"];
// Pell x^2 - N*y^2 = 1: the fundamental solution's x EXCEEDS 2^53 even for small N (N=61 gives
// x=1766319049, x^2≈3.12e18) — so, UNLIKE every other checker in this file, the Pell VERIFICATION
// runs in BigInt (the only honest way to confirm x^2 - N*y^2 = 1 exactly for these magnitudes). The
// exact-arithmetic guarantee is unchanged, just widened to big integers where the canon demands it.
// Compute cost is bounded the primes_mod way: N in [2..1000] (covers the classical hard cases
// 61/109/149/421/661) and the continued-fraction iteration is capped so no input can spin.
const PELL_N_MIN      = 2;
const PELL_N_MAX      = 1000;
const PELL_CF_MAX_LEN = 5000;

// ── Build-CM3 "Classical-math checker pack v3" kill-switch (default ON) ──────────
// Read at CALL time, exactly like M8_CLASSICAL_MATH / M8_CLASSICAL_MATH_V2 / M8_BASE_LENS. OFF ⇒
// the CLASSICAL_V3_TEMPLATES family (pyth_triple / pyth_primitive / euclid_triple) is rejected by
// isTemplateAllowed/validateClaim/evaluateClaim exactly as if absent, detectClassicalMathV3Test never
// routes, runKernelTest's V3 dispatch is skipped, and NONE of the digital-root proposer prompts NOR
// the CM1 / CM2 classical proposer prompts are touched EITHER WAY (this lane adds its OWN
// buildClassicalV3ProposeSystem and never edits buildProposeSystem/buildLiteralSystem/
// buildMultiProposeSystem/buildClassicalProposeSystem/buildClassicalV2ProposeSystem — the R3 base-
// lens + CM1 + CM2 OFF-identities all stay byte-identical). Proven in
// tests/buildCM3_classical_math_v3.test.js.
function classicalMathV3Enabled() {
  const v = String(process.env.M8_CLASSICAL_MATH_V3 || "").trim().toLowerCase();
  return v !== "off" && v !== "0";
}
// Pythagorean-triple checks are exact integer arithmetic (no BigInt): a,b,c stay well under 2^53 so
// a*a, b*b, c*c never lose precision. TRIPLE_MAX is chosen with a large safety margin —
// TRIPLE_MAX^2 = 1e14, versus the 2^53 ≈ 9.007e15 exactness ceiling (hand-verified). EUCLID_MN_MAX
// bounds m,n for the generator: c = m^2+n^2 <= ~1.8e7 at the cap, so c^2 <= ~3.24e14, still far under
// 2^53 (hand-verified). Every headline figure (3-4-5, 5-12-13, 8-15-17, 20-21-29, and the Euclid
// generator for several m,n) was independently computed and confirmed before this build shipped.
const TRIPLE_MAX     = 10000000;   // cap on a,b,c for pyth_triple / pyth_primitive
const EUCLID_MN_MIN  = 1;
const EUCLID_MN_MAX  = 3000;       // cap on m,n for euclid_triple (m > n >= 1)

// ── E5 miss-mining follow-up "digital-root proposer worked examples" kill-switch (default ON) ──
// Read at CALL time, exactly like M8_BASE_LENS / M8_CLASSICAL_MATH / M8_CLASSICAL_MATH_V2. Mined
// pattern (m8_router_misses, "test the doubling digital-root claim" and similar terse kernel-test
// phrasings recurring 2026-07-04): these fell through to "couldn't form a claim". TWO-PART fix,
// same switch (they only work together):
//   (1) buildProposeSystem()/buildMultiProposeSystem() never got the R3/CM1/CM2 lesson (new
//       proposer vocab needs a concrete worked example, or the free-stack model guesses the shape
//       wrong on a terse kernel) — a worked-examples block is appended to both.
//   (2) POST-DEPLOY FIX (live self-verify caught it): a bare "test X" request has no speculative
//       LEAP, so knowledge-intake's proposeDecomposition (a SEPARATE prompt requiring BOTH a
//       kernel AND a leap) honestly returns null and runKernelTest never even reached (1). Added
//       a fallback in runKernelTest: when decomposition yields no kernel, retry the kernel-derived
//       proposer directly on the RAW MESSAGE as the kernel description (see runKernelTest below).
// OFF ⇒ buildProposeSystem()/buildMultiProposeSystem() are byte-identical to pre-this-build (no
// worked-examples block) AND the raw-message fallback is skipped (runKernelTest byte-identical to
// pre-this-build on the no-kernel path too) — proven in tests/buildE5_dr_proposer_examples.test.js.
// buildLiteralSystem() (explicit user assertions, e.g. "the digital root of 3n is always 3") is
// NEVER touched by this switch — that lane already forms a claim fine; only the KERNEL-derived
// proposers (hit when the request is a terse reference/label, not a literal assertion) needed help.
function drProposerExamplesEnabled() {
  const v = String(process.env.M8_DR_PROPOSER_EXAMPLES || "").trim().toLowerCase();
  return v !== "off" && v !== "0";
}
// Single-candidate worked examples (buildProposeSystem — OUTPUT is one object).
const DR_PROPOSER_WORKED_EXAMPLES_SINGLE = `WORKED EXAMPLES (a terse kernel still maps to a concrete claim — never answer null just because the kernel label is short):
  KERNEL label: "the doubling / vortex digital-root sequence" -> {"template":"dr_periodic","generator":"power","params":{"base":2,"period":6},"bound":10000,"label":"the digital root of 2^n repeats with period 6 (1,2,4,8,7,5,...)"}
  KERNEL label: "multiples of 3 land on the non-unit residues" -> {"template":"dr_set","generator":"multiple","params":{"k":3,"set":[3,6,9]},"bound":10000,"label":"the digital root of 3n is always 3, 6, or 9"}
  KERNEL label: "the Fibonacci digital-root cycle" -> {"template":"dr_periodic","generator":"fib","params":{"period":24},"bound":10000,"label":"the digital root of Fibonacci(n) repeats with period 24"}`;
// Multi-candidate worked example (buildMultiProposeSystem — OUTPUT is a JSON array).
const DR_PROPOSER_WORKED_EXAMPLES_MULTI = `WORKED EXAMPLE (a terse kernel still yields SEVERAL candidates — never answer [] just because the kernel label is short):
  KERNEL label: "the doubling / vortex digital-root sequence" -> [{"template":"dr_periodic","generator":"power","params":{"base":2,"period":6},"bound":10000,"label":"the digital root of 2^n repeats with period 6"},{"template":"dr_set","generator":"power","params":{"base":2,"set":[1,2,4,5,7,8]},"bound":10000,"label":"the digital root of 2^n is always one of {1,2,4,5,7,8}"}]`;
// POST-DEPLOY FIX #2 — live self-verify (against the default gemini-first order) showed Gemini
// does NOT reliably make the "doubling -> base=2 power sequence" inference the worked example
// teaches, even with the example present, while Groq (gpt-oss-120b, the B-177 default) DOES —
// hand-verified locally: given the exact raw-message kernel "test the doubling digital-root
// claim", Groq returns 3 valid candidates (one holds, period 6) on every call. Rather than change
// the APP-WIDE default provider order (LLM_PROVIDER_ORDER, gemini-first — used everywhere else),
// scope a groq-first override to ONLY these two kernel-derived proposer calls. Gated by the SAME
// switch (OFF ⇒ falls back to generate()'s normal default order, gemini-first, byte-identical to
// pre-this-build).
const DR_PROPOSER_PROVIDER_ORDER = "groq,gemini,gemini2,mistral,openrouter";

// ── Build-CM1 classical pure core (exact integer arithmetic, no BigInt) ─────────
// s(k) = sum of the PROPER divisors of k (every positive divisor of k except k itself).
// s(1) = 0. O(sqrt k) sqrt-loop. Returns null if k is out of the exact range. PURE.
function sumProperDivisors(k) {
  if (!Number.isInteger(k) || k < 1 || k > CLASSICAL_INT_MAX) return null;
  if (k === 1) return 0;
  let total = 1;                          // 1 divides every k >= 2
  const r = Math.floor(Math.sqrt(k));
  for (let i = 2; i <= r; i++) {
    if (k % i === 0) {
      total += i;
      const j = k / i;
      if (j !== i) total += j;
    }
  }
  return total;
}
// Deterministic trial-division primality — exact for m < 2^53 (6k±1 wheel). PURE.
function isPrimeTrial(m) {
  if (!Number.isInteger(m) || m < 2) return false;
  if (m % 2 === 0) return m === 2;
  if (m % 3 === 0) return m === 3;
  for (let i = 5; i * i <= m; i += 6) {
    if (m % i === 0 || m % (i + 2) === 0) return false;
  }
  return true;
}
// The two classical CONSTRUCTIONS, each returning the concrete integers so the checker can
// VERIFY the relation by direct computation (never assert it from the theorem). PURE.
function euclidPerfectForm(p) {
  const mersenne = 2 ** p - 1;            // 2^p - 1  (the Mersenne candidate)
  const form = 2 ** (p - 1) * mersenne;   // 2^(p-1)*(2^p-1)  (Euclid's even-perfect form)
  return { mersenne, form };
}
function thabitTriple(n) {
  const p = 3 * 2 ** (n - 1) - 1;         // Thabit's rule (Thabit ibn Qurra, c. 850)
  const q = 3 * 2 ** n - 1;
  const r = 9 * 2 ** (2 * n - 1) - 1;
  const a = 2 ** n * p * q;               // 2^n * p * q
  const b = 2 ** n * r;                   // 2^n * r
  return { p, q, r, a, b };
}

// ── Build-CM2 classical-v2 pure core ────────────────────────────────────────────
// Figurate builders — exact Number arithmetic (every value < 2^53 within FIGURATE_N_MAX). PURE.
function triangularNum(n) { return (n * (n + 1)) / 2; }      // T(n) = n(n+1)/2  (n(n+1) always even)
function hexagonalNum(n)  { return n * (2 * n - 1); }        // H(n) = n(2n-1)
// Verify ONE established figurate identity over the whole range [1..N] by computing BOTH sides
// directly (never asserting from the theorem). Returns { holds, checkedTo, counterexample }. O(N),
// incremental where a running sum is involved. PURE.
function checkFigurateIdentity(kind, N) {
  if (kind === "hexagonal_triangular") {
    // every hexagonal number is triangular: H(n) = T(2n-1)
    for (let n = 1; n <= N; n++) {
      const lhs = hexagonalNum(n), rhs = triangularNum(2 * n - 1);
      if (lhs !== rhs) return { holds: false, checkedTo: N, counterexample: { n, lhs, rhs } };
    }
    return { holds: true, checkedTo: N, counterexample: null };
  }
  if (kind === "nicomachus_cubes") {
    // Nicomachus's theorem: 1^3 + 2^3 + ... + n^3 = T(n)^2  (running cube-sum vs the closed square)
    let cubeSum = 0;
    for (let n = 1; n <= N; n++) {
      cubeSum += n * n * n;
      const rhs = triangularNum(n) ** 2;
      if (cubeSum !== rhs) return { holds: false, checkedTo: N, counterexample: { n, lhs: cubeSum, rhs } };
    }
    return { holds: true, checkedTo: N, counterexample: null };
  }
  if (kind === "square_consecutive_triangular") {
    // every square is the sum of two consecutive triangular numbers: n^2 = T(n-1) + T(n)
    for (let n = 1; n <= N; n++) {
      const lhs = n * n, rhs = triangularNum(n - 1) + triangularNum(n);
      if (lhs !== rhs) return { holds: false, checkedTo: N, counterexample: { n, lhs, rhs } };
    }
    return { holds: true, checkedTo: N, counterexample: null };
  }
  return { holds: false, checkedTo: 0, counterexample: null, invalid: true };
}
// Fundamental solution of the Pell equation x^2 - N*y^2 = 1 via the continued-fraction expansion of
// sqrt(N). The (m,d,a) CF recurrence uses small ints (bounded by ~2*sqrt(N), so exact in Number);
// the convergent numerator/denominator h_k/k_k grow past 2^53, so they — and the defining-equation
// check — run in BigInt. Returns { x, y, cfTerms } with x,y BigInt, or null (perfect-square N, or
// the CF cap was hit). PURE. Verified against the canon incl. N=61 -> (1766319049, 226153980).
function pellFundamental(N) {
  if (!Number.isInteger(N) || N < 2) return null;
  const a0 = Math.floor(Math.sqrt(N));
  if (a0 * a0 === N) return null;                 // perfect square ⇒ no non-trivial solution
  const Nb = BigInt(N);
  let m = 0, d = 1, a = a0;
  let hPrev = 1n, h = BigInt(a0);                 // convergent numerators: h_{-1}=1, h_0=a0
  let kPrev = 0n, k = 1n;                          // convergent denominators: k_{-1}=0, k_0=1
  let steps = 0;
  for (;;) {
    if (h * h - Nb * k * k === 1n) return { x: h, y: k, cfTerms: steps };
    if (steps >= PELL_CF_MAX_LEN) return null;
    steps++;
    m = d * a - m;
    d = (N - m * m) / d;                           // CF recurrence guarantees exact integer division
    a = Math.floor((a0 + m) / d);
    const hNext = BigInt(a) * h + hPrev; hPrev = h; h = hNext;
    const kNext = BigInt(a) * k + kPrev; kPrev = k; k = kNext;
  }
}

// ── Build-CM3 classical-v3 pure core (Pythagorean triples, exact Number arithmetic) ─────────────
// Euclidean gcd — pure, integer-only. PURE.
function gcdInt(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}
function gcd3(a, b, c) { return gcdInt(gcdInt(a, b), c); }
// Euclid's formula (Elements, Book X, Lemma 1, before Prop. 29): for integers m > n > 0,
// (m^2-n^2, 2mn, m^2+n^2) is ALWAYS a Pythagorean triple (an algebraic identity — the checker still
// verifies it by direct computation rather than assuming it); it is PRIMITIVE iff m,n are coprime
// and of opposite parity. PURE.
function euclidTriple(m, n) {
  return { a: m * m - n * n, b: 2 * m * n, c: m * m + n * n };
}

// ── CLOSED generator whitelist: g(n) value mod m, via modular arithmetic ──
// Each returns g(n) reduced mod `m` (no big integers). n >= 1.
function modexp(base, exp, m) {
  if (m === 1) return 0;
  let r = 1; base = ((base % m) + m) % m;
  while (exp > 0) { if (exp & 1) r = (r * base) % m; base = (base * base) % m; exp = Math.floor(exp / 2); }
  return r;
}
const GENERATORS = {
  // g(n) = n
  n:          (n, m) => n % m,
  // g(n) = k * n   (params.k)
  multiple:   (n, m, p) => (((p.k % m) * (n % m)) % m),
  // g(n) = base^n  (params.base) — the canonical "doubling/vortex" sequence is base=2
  power:      (n, m, p) => modexp(p.base, n, m),
  // g(n) = n^2
  square:     (n, m) => (((n % m) * (n % m)) % m),
  // g(n) = n^3
  cube:       (n, m) => ((((n % m) * (n % m)) % m) * (n % m)) % m,
  // g(n) = n(n+1)/2  (triangular)
  triangular: (n, m) => { const t = (n % (2 * m)) * ((n + 1) % (2 * m)); return (t / 2) % m; },
  // g(n) = Fibonacci(n) mod m  (iterative — Pisano, no big ints)
  fib:        (n, m) => { let a = 0, b = 1; for (let i = 1; i <= n; i++) { const c = (a + b) % m; a = b; b = c; } return a % m; },
  // g(n) = Lucas(n) mod m  (2,1,3,4,7,11,… — Fibonacci's companion; iterative, no big ints)
  lucas:      (n, m) => { let a = 2, b = 1; for (let i = 1; i <= n; i++) { const c = (a + b) % m; a = b; b = c; } return ((a % m) + m) % m; },
  // g(n) = pentagonal number n(3n-1)/2  (figurate). n(3n-1) is always even → exact /2.
  pentagonal: (n, m) => ((n * (3 * n - 1)) / 2) % m,
  // g(n) = hexagonal number n(2n-1)  (figurate)
  hexagonal:  (n, m) => (n * (2 * n - 1)) % m,
};
// ── Build-R3 "Base-b lens" — additional CLOSED generators, gated by baseLensEnabled() ──
// Same discipline as GENERATORS above: pure, modular, no big ints.
let _primeCache = [];   // module-level memo — primes are a pure deterministic sequence
function ensurePrimes(count) {
  if (_primeCache.length >= count) return;
  let limit = Math.max(100, Math.ceil((count + 10) * (Math.log(count + 10) + Math.log(Math.log(count + 10) + 1) + 2) * 1.2));
  for (;;) {
    const sieve = new Uint8Array(limit + 1);
    const primes = [];
    for (let i = 2; i <= limit; i++) {
      if (!sieve[i]) {
        primes.push(i);
        for (let j = i * i; j <= limit; j += i) sieve[j] = 1;
      }
    }
    if (primes.length >= count) { _primeCache = primes; return; }
    limit *= 2;
  }
}
function nthPrime(n) { ensurePrimes(n); return _primeCache[n - 1]; }
const BASE_GENERATORS = {
  // g(n) = the n-th k-gonal (figurate) number, ((k-2)n^2-(k-4)n)/2 — generalizes
  // triangular(k=3)/square(k=4)/pentagonal(k=5)/hexagonal(k=6) to arbitrary k.
  kgonal:     (n, m, p) => (((p.sides - 2) * n * n - (p.sides - 4) * n) / 2) % m,
  // g(n) = the n-th prime number (bound capped separately — sieve cost)
  primes_mod: (n, m) => nthPrime(n) % m,
};
function resolveGenerator(name) {
  if (Object.prototype.hasOwnProperty.call(GENERATORS, name)) return GENERATORS[name];
  if (baseLensEnabled() && Object.prototype.hasOwnProperty.call(BASE_GENERATORS, name)) return BASE_GENERATORS[name];
  return null;
}
function isGeneratorAllowed(g) {
  if (Object.prototype.hasOwnProperty.call(GENERATORS, g)) return true;
  return baseLensEnabled() && Object.prototype.hasOwnProperty.call(BASE_GENERATORS, g);
}
function genValueMod(generator, params, n, m) {
  const g = resolveGenerator(generator);
  if (!g) return null;
  let v = g(n, m, params || {});
  v = ((v % m) + m) % m;
  return v;
}
// Digital root of g(n): value mod 9, with 0 → 9 (for positive values; the
// whitelist only produces positive g(n) for n >= 1, k >= 1, base >= 2).
function digitalRootOfGen(generator, params, n) {
  const r = genValueMod(generator, params, n, 9);
  if (r === null) return null;
  return r === 0 ? 9 : r;
}
// Build-R3 — digital root of g(n) in an ARBITRARY radix b (mod b-1, 0 → b-1):
// the exact generalization of digitalRootOfGen's hardcoded base-10/mod-9 rule.
// This is THE honest instrument for "is 9 fundamental, or a base-10 artifact?" —
// run the same g(n) through a different radix and the cycle/value structure changes.
function digitalRootOfGenBase(generator, params, n, radix) {
  const modv = radix - 1;
  const r = genValueMod(generator, params, n, modv);
  if (r === null) return null;
  return r === 0 ? modv : r;
}

// ── CLOSED claim templates ────────────────────────────────────────
const TEMPLATES = ["dr_periodic", "dr_constant", "dr_set", "mod_cycle"];
// Build-R3 — the base-b lens family, gated by baseLensEnabled(). Same three shapes
// as dr_periodic/dr_constant/dr_set, generalized with a "radix" param (named
// distinctly from generator "power"'s own "base" param — the two must never collide
// in the flat params object).
const BASE_TEMPLATES = ["dr_base_periodic", "dr_base_constant", "dr_base_set"];
// Build-CM1 — the classical-math checker family, gated by classicalMathEnabled(). These are
// GENERATOR-LESS: each template names a specific classical construction (a pair, a number, the
// Euclid-Euler form, Thabit's rule), not a g(n) sequence over a generator. So they take a
// SEPARATE validate/evaluate path (validateClassicalClaim / evaluateClassicalClaim) — the
// digital-root generator machinery is never touched.
const CLASSICAL_TEMPLATES = ["amicable_pair", "perfect_number", "euclid_euler", "thabit_rule", "aliquot_class"];
// Build-CM2 — the classical-v2 checker family, gated by classicalMathV2Enabled(). Like the CM1
// classical family these are GENERATOR-LESS (each names a construction: a figurate identity checked
// over a range, or the Pell fundamental solution), so they take a SEPARATE validate/evaluate path
// (validateClassicalV2Claim / evaluateClassicalV2Claim). The digital-root generator machinery and
// the CM1 classical path are both untouched.
const CLASSICAL_V2_TEMPLATES = ["figurate_identity", "pell_fundamental"];
// Build-CM3 — the classical-v3 checker family (Pythagorean triples), gated by
// classicalMathV3Enabled(). GENERATOR-LESS like CM1/CM2 (each names a specific integer instance to
// check, or the Euclid's-formula construction), so they take their OWN validate/evaluate path
// (validateClassicalV3Claim / evaluateClassicalV3Claim). The digital-root machinery and the CM1/CM2
// classical paths are all untouched.
const CLASSICAL_V3_TEMPLATES = ["pyth_triple", "pyth_primitive", "euclid_triple"];
function isTemplateAllowed(t) {
  if (TEMPLATES.includes(t)) return true;
  if (baseLensEnabled() && BASE_TEMPLATES.includes(t)) return true;
  if (classicalMathEnabled() && CLASSICAL_TEMPLATES.includes(t)) return true;
  if (classicalMathV2Enabled() && CLASSICAL_V2_TEMPLATES.includes(t)) return true;
  if (classicalMathV3Enabled() && CLASSICAL_V3_TEMPLATES.includes(t)) return true;
  return false;
}

/**
 * Validate a proposed claim against the closed whitelist. Returns a normalized
 * claim or null (off-schema → null; this IS the anti-smuggling gate).
 *   { template, generator, params, bound, label }
 */
// Build-CM1 — validate a GENERATOR-LESS classical claim against the closed classical whitelist.
// Same anti-smuggling discipline as validateClaim: off-schema / out-of-cap → null, so the LLM
// proposer can only ever hand the checker a claim it can decide by exact computation.
function validateClassicalClaim(c) {
  const p = (c.params && typeof c.params === "object") ? c.params : {};
  const label = String(c.label || "").slice(0, 160);
  const mk = (params) => ({ template: c.template, generator: null, params, label });
  if (c.template === "amicable_pair") {
    if (!Number.isInteger(p.m) || !Number.isInteger(p.n)) return null;
    if (p.m < 2 || p.n < 2 || p.m > AMICABLE_MAX || p.n > AMICABLE_MAX) return null;
    return mk({ m: p.m, n: p.n });
  }
  if (c.template === "perfect_number") {
    if (!Number.isInteger(p.n) || p.n < 2 || p.n > PERFECT_MAX) return null;
    return mk({ n: p.n });
  }
  if (c.template === "euclid_euler") {
    if (!Number.isInteger(p.p) || p.p < EUCLID_EXP_MIN || p.p > EUCLID_EXP_MAX) return null;
    return mk({ p: p.p });
  }
  if (c.template === "thabit_rule") {
    if (!Number.isInteger(p.index) || p.index < THABIT_INDEX_MIN || p.index > THABIT_INDEX_MAX) return null;
    return mk({ index: p.index });
  }
  if (c.template === "aliquot_class") {
    if (!Number.isInteger(p.n) || p.n < 1 || p.n > PERFECT_MAX) return null;
    const kind = String(p.kind || "").toLowerCase();
    if (!["abundant", "deficient", "perfect"].includes(kind)) return null;
    return mk({ n: p.n, kind });
  }
  return null;
}

// Build-CM2 — validate a GENERATOR-LESS classical-v2 claim (figurate identity or Pell fundamental)
// against the closed whitelist. Same anti-smuggling discipline as validateClassicalClaim: off-schema
// / a figurate kind that is not one of the three ESTABLISHED identities / a Pell N out of cap or a
// perfect square → null. So the proposer can only ever hand the checker a claim it can decide.
function validateClassicalV2Claim(c) {
  const p = (c.params && typeof c.params === "object") ? c.params : {};
  const label = String(c.label || "").slice(0, 160);
  if (c.template === "figurate_identity") {
    const kind = String(p.kind || "");
    if (!FIGURATE_KINDS.includes(kind)) return null;
    let bound = Number.isInteger(p.bound) ? p.bound : (Number.isInteger(c.bound) ? c.bound : FIGURATE_N_DEFAULT);
    bound = Math.max(FIGURATE_N_MIN, Math.min(FIGURATE_N_MAX, bound));
    return { template: c.template, generator: null, params: { kind, bound }, label };
  }
  if (c.template === "pell_fundamental") {
    if (!Number.isInteger(p.N) || p.N < PELL_N_MIN || p.N > PELL_N_MAX) return null;
    const a0 = Math.floor(Math.sqrt(p.N));
    if (a0 * a0 === p.N) return null;             // perfect square ⇒ no non-trivial solution
    return { template: c.template, generator: null, params: { N: p.N }, label };
  }
  return null;
}

// Build-CM3 — validate a GENERATOR-LESS classical-v3 claim (a Pythagorean-triple check or the
// Euclid's-formula generator) against the closed whitelist. Same anti-smuggling discipline: off-
// schema / out-of-cap / a degenerate (m,n) with no valid construction → null. So the proposer can
// only ever hand the checker a claim it can decide by exact computation.
function validateClassicalV3Claim(c) {
  const p = (c.params && typeof c.params === "object") ? c.params : {};
  const label = String(c.label || "").slice(0, 160);
  if (c.template === "pyth_triple" || c.template === "pyth_primitive") {
    if (!Number.isInteger(p.a) || !Number.isInteger(p.b) || !Number.isInteger(p.c)) return null;
    if (p.a < 1 || p.b < 1 || p.c < 1) return null;
    if (p.a > TRIPLE_MAX || p.b > TRIPLE_MAX || p.c > TRIPLE_MAX) return null;
    return { template: c.template, generator: null, params: { a: p.a, b: p.b, c: p.c }, label };
  }
  if (c.template === "euclid_triple") {
    if (!Number.isInteger(p.m) || !Number.isInteger(p.n)) return null;
    if (p.n < EUCLID_MN_MIN || p.m > EUCLID_MN_MAX || p.n > EUCLID_MN_MAX) return null;
    if (p.m <= p.n) return null;   // m > n > 0 is structural (a degenerate/negative-leg construction, not a testable-false instance)
    return { template: c.template, generator: null, params: { m: p.m, n: p.n }, label };
  }
  return null;
}

function validateClaim(c) {
  if (!c || typeof c !== "object") return null;
  if (!isTemplateAllowed(c.template)) return null;
  // Build-CM1 — classical-math templates are generator-less; validate + normalize them on their
  // own path (never reaching the generator machinery below). Gated so OFF ⇒ this is never taken.
  if (classicalMathEnabled() && CLASSICAL_TEMPLATES.includes(c.template)) return validateClassicalClaim(c);
  // Build-CM2 — figurate/Pell templates are generator-less; validate on their own path. Gated so
  // OFF ⇒ this is never taken (and the template is already rejected by isTemplateAllowed above).
  if (classicalMathV2Enabled() && CLASSICAL_V2_TEMPLATES.includes(c.template)) return validateClassicalV2Claim(c);
  // Build-CM3 — Pythagorean-triple templates are generator-less; validate on their own path. Gated
  // so OFF ⇒ this is never taken (and the template is already rejected by isTemplateAllowed above).
  if (classicalMathV3Enabled() && CLASSICAL_V3_TEMPLATES.includes(c.template)) return validateClassicalV3Claim(c);
  if (!isGeneratorAllowed(c.generator)) return null;
  const p = (c.params && typeof c.params === "object") ? c.params : {};
  // generator-specific param checks
  if (c.generator === "multiple") { if (!Number.isInteger(p.k) || p.k < 1 || p.k > 10000) return null; }
  if (c.generator === "power")    { if (!Number.isInteger(p.base) || p.base < 2 || p.base > 10000) return null; }
  if (c.generator === "kgonal")   { if (!Number.isInteger(p.sides) || p.sides < KGON_SIDES_MIN || p.sides > KGON_SIDES_MAX) return null; }
  let bound = Number.isInteger(c.bound) ? c.bound : N_DEFAULT;
  bound = Math.max(N_MIN, Math.min(N_MAX, bound));
  if (c.generator === "primes_mod") bound = Math.min(bound, PRIMES_MOD_BOUND_MAX);
  const norm = { template: c.template, generator: c.generator, params: {}, bound, label: String(c.label || "").slice(0, 160) };
  if (c.generator === "multiple") norm.params.k = p.k;
  if (c.generator === "power") norm.params.base = p.base;
  if (c.generator === "kgonal") norm.params.sides = p.sides;
  if (c.template === "dr_periodic") {
    if (!Number.isInteger(p.period) || p.period < 1 || p.period > PERIOD_MAX) return null;
    norm.params.period = p.period;
  } else if (c.template === "dr_constant") {
    if (!Number.isInteger(p.value) || p.value < 1 || p.value > 9) return null;
    norm.params.value = p.value;
  } else if (c.template === "dr_set") {
    if (!Array.isArray(p.set) || p.set.length < 1 || p.set.length > 9) return null;
    const set = [...new Set(p.set)].filter((x) => Number.isInteger(x) && x >= 1 && x <= 9).sort((a, b) => a - b);
    if (set.length < 1 || set.length !== new Set(p.set).size) return null;   // any out-of-range member → reject
    norm.params.set = set;
  } else if (c.template === "mod_cycle") {
    if (!Number.isInteger(p.m) || p.m < 2 || p.m > MOD_MAX) return null;
    if (!Number.isInteger(p.period) || p.period < 1 || p.period > PERIOD_MAX) return null;
    norm.params.m = p.m; norm.params.period = p.period;
  } else if (c.template === "dr_base_periodic") {
    if (!Number.isInteger(p.radix) || p.radix < BASE_MIN || p.radix > BASE_MAX) return null;
    if (!Number.isInteger(p.period) || p.period < 1 || p.period > PERIOD_MAX) return null;
    norm.params.radix = p.radix; norm.params.period = p.period;
  } else if (c.template === "dr_base_constant") {
    if (!Number.isInteger(p.radix) || p.radix < BASE_MIN || p.radix > BASE_MAX) return null;
    const maxV = p.radix - 1;
    if (!Number.isInteger(p.value) || p.value < 1 || p.value > maxV) return null;
    norm.params.radix = p.radix; norm.params.value = p.value;
  } else if (c.template === "dr_base_set") {
    if (!Number.isInteger(p.radix) || p.radix < BASE_MIN || p.radix > BASE_MAX) return null;
    const maxV = p.radix - 1;
    if (!Array.isArray(p.set) || p.set.length < 1 || p.set.length > maxV) return null;
    const set = [...new Set(p.set)].filter((x) => Number.isInteger(x) && x >= 1 && x <= maxV).sort((a, b) => a - b);
    if (set.length < 1 || set.length !== new Set(p.set).size) return null;
    norm.params.radix = p.radix; norm.params.set = set;
  }
  return norm;
}

/**
 * Deterministic exhaustive checker. PURE, sync. Returns
 *   { holds:boolean, checkedTo:N, counterexample:{n,...}|null, observedPeriod:number|null }
 * holds = the claim survived falsification over every n in [1..N].
 */
function evaluateClaim(claim) {
  const c = validateClaim(claim);
  if (!c) return { holds: false, checkedTo: 0, counterexample: null, observedPeriod: null, invalid: true };
  // Build-CM1 — classical-math templates route to the decidable-INSTANCE checker (exact, not
  // "observed-to-N"). For every digital-root template this line is false → no behaviour change.
  if (CLASSICAL_TEMPLATES.includes(c.template)) return evaluateClassicalClaim(c);
  // Build-CM2 — figurate/Pell templates route to their own exact checker. For every digital-root and
  // CM1 template this line is false → no behaviour change. (c only carries a V2 template when V2 is
  // on, since validateClaim gates it — so this needs no extra guard.)
  if (CLASSICAL_V2_TEMPLATES.includes(c.template)) return evaluateClassicalV2Claim(c);
  // Build-CM3 — Pythagorean-triple templates route to their own exact checker. For every digital-
  // root/CM1/CM2 template this line is false → no behaviour change. (c only carries a V3 template
  // when V3 is on, since validateClaim gates it — so this needs no extra guard.)
  if (CLASSICAL_V3_TEMPLATES.includes(c.template)) return evaluateClassicalV3Claim(c);
  const N = c.bound;
  if (c.template === "dr_periodic") {
    const p = c.params.period;
    for (let n = 1; n + p <= N; n++) {
      if (digitalRootOfGen(c.generator, c.params, n) !== digitalRootOfGen(c.generator, c.params, n + p)) {
        return { holds: false, checkedTo: N, counterexample: { n, dr_n: digitalRootOfGen(c.generator, c.params, n), dr_n_plus_p: digitalRootOfGen(c.generator, c.params, n + p), period: p }, observedPeriod: observedDrPeriod(c) };
      }
    }
    return { holds: true, checkedTo: N, counterexample: null, observedPeriod: observedDrPeriod(c) };
  }
  if (c.template === "dr_constant") {
    const v = c.params.value;
    for (let n = 1; n <= N; n++) {
      const dr = digitalRootOfGen(c.generator, c.params, n);
      if (dr !== v) return { holds: false, checkedTo: N, counterexample: { n, dr, expected: v }, observedPeriod: null };
    }
    return { holds: true, checkedTo: N, counterexample: null, observedPeriod: 1 };
  }
  if (c.template === "dr_set") {
    const set = c.params.set;
    for (let n = 1; n <= N; n++) {
      const dr = digitalRootOfGen(c.generator, c.params, n);
      if (!set.includes(dr)) return { holds: false, checkedTo: N, counterexample: { n, dr, set }, observedPeriod: null };
    }
    return { holds: true, checkedTo: N, counterexample: null, observedPeriod: observedDrPeriod(c) };
  }
  if (c.template === "mod_cycle") {
    const { m, period: p } = c.params;
    for (let n = 1; n + p <= N; n++) {
      if (genValueMod(c.generator, c.params, n, m) !== genValueMod(c.generator, c.params, n + p, m)) {
        return { holds: false, checkedTo: N, counterexample: { n, period: p, m }, observedPeriod: observedModPeriod(c) };
      }
    }
    return { holds: true, checkedTo: N, counterexample: null, observedPeriod: observedModPeriod(c) };
  }
  // ── Build-R3 base-b lens: same three shapes as dr_periodic/dr_constant/dr_set,
  // over digitalRootOfGenBase(...,radix) instead of the hardcoded base-10 digitalRootOfGen.
  if (c.template === "dr_base_periodic") {
    const p = c.params.period, radix = c.params.radix;
    for (let n = 1; n + p <= N; n++) {
      if (digitalRootOfGenBase(c.generator, c.params, n, radix) !== digitalRootOfGenBase(c.generator, c.params, n + p, radix)) {
        return { holds: false, checkedTo: N, counterexample: { n, dr_n: digitalRootOfGenBase(c.generator, c.params, n, radix), dr_n_plus_p: digitalRootOfGenBase(c.generator, c.params, n + p, radix), period: p, radix }, observedPeriod: observedDrPeriodBase(c) };
      }
    }
    return { holds: true, checkedTo: N, counterexample: null, observedPeriod: observedDrPeriodBase(c) };
  }
  if (c.template === "dr_base_constant") {
    const v = c.params.value, radix = c.params.radix;
    for (let n = 1; n <= N; n++) {
      const dr = digitalRootOfGenBase(c.generator, c.params, n, radix);
      if (dr !== v) return { holds: false, checkedTo: N, counterexample: { n, dr, expected: v, radix }, observedPeriod: null };
    }
    return { holds: true, checkedTo: N, counterexample: null, observedPeriod: 1 };
  }
  if (c.template === "dr_base_set") {
    const set = c.params.set, radix = c.params.radix;
    for (let n = 1; n <= N; n++) {
      const dr = digitalRootOfGenBase(c.generator, c.params, n, radix);
      if (!set.includes(dr)) return { holds: false, checkedTo: N, counterexample: { n, dr, set, radix }, observedPeriod: null };
    }
    return { holds: true, checkedTo: N, counterexample: null, observedPeriod: observedDrPeriodBase(c) };
  }
  return { holds: false, checkedTo: 0, counterexample: null, observedPeriod: null, invalid: true };
}

/**
 * Build-CM1 — the classical-math checker. Exact, decidable, PURE. Unlike the digital-root
 * checker (which is "observed to N"), each of these fully COMPUTES the claimed relation for the
 * specific instance and returns a definite verdict. Result shape stays compatible with the
 * digital-root one (holds/checkedTo/counterexample) plus a `detail` block the renderer reads.
 */
function evaluateClassicalClaim(c) {
  const base = { holds: false, checkedTo: 0, counterexample: null, observedPeriod: null, classical: true };
  if (c.template === "amicable_pair") {
    const { m, n } = c.params;
    const sm = sumProperDivisors(m), sn = sumProperDivisors(n);
    const holds = sm === n && sn === m && m !== n;
    return { ...base, holds, checkedTo: Math.max(m, n), detail: { m, n, sm, sn },
      counterexample: holds ? null : { m, n, sm, sn,
        reason: m === n ? "m equals n (a number equal to its own aliquot sum is perfect, not an amicable pair)" : "the proper-divisor sums do not swap (need s(m)=n and s(n)=m)" } };
  }
  if (c.template === "perfect_number") {
    const { n } = c.params;
    const sn = sumProperDivisors(n);
    const cls = sn > n ? "abundant" : sn < n ? "deficient" : "perfect";
    const holds = sn === n && n >= 2;
    return { ...base, holds, checkedTo: n, detail: { n, sn, cls },
      counterexample: holds ? null : { n, sn, cls, reason: `s(n) = ${sn} ${sn > n ? ">" : "<"} n, so ${n} is ${cls}, not perfect` } };
  }
  if (c.template === "euclid_euler") {
    const { p } = c.params;
    const { mersenne, form } = euclidPerfectForm(p);
    const mprime = isPrimeTrial(mersenne);
    let perfect = null;
    if (mprime) { const sf = sumProperDivisors(form); perfect = sf === form; }
    const holds = mprime && perfect === true;
    return { ...base, holds, checkedTo: form, detail: { p, mersenne, form, mprime, perfect },
      counterexample: holds ? null : { p, mersenne, form,
        reason: mprime ? "2^p-1 is prime but the Euclid form is not perfect (should not happen — recorded)" : `2^${p}-1 = ${mersenne} is not prime (not a Mersenne prime), so Euclid's construction yields no perfect number` } };
  }
  if (c.template === "thabit_rule") {
    const { index } = c.params;
    const { p, q, r, a, b } = thabitTriple(index);
    const allPrime = isPrimeTrial(p) && isPrimeTrial(q) && isPrimeTrial(r);
    let amicable = null;
    if (allPrime) amicable = sumProperDivisors(a) === b && sumProperDivisors(b) === a && a !== b;
    const holds = allPrime && amicable === true;
    return { ...base, holds, checkedTo: Math.max(a, b), detail: { index, p, q, r, a, b, allPrime, amicable },
      counterexample: holds ? null : { index, p, q, r,
        reason: allPrime ? "p,q,r are all prime but the constructed pair is not amicable (should not happen — recorded)" : "p, q, r are not all prime (Thabit's rule requires all three prime), so no pair is produced at this index" } };
  }
  if (c.template === "aliquot_class") {
    const { n, kind } = c.params;
    const sn = sumProperDivisors(n);
    const actual = sn > n ? "abundant" : sn < n ? "deficient" : "perfect";
    const holds = actual === kind;
    return { ...base, holds, checkedTo: n, detail: { n, sn, kind, actual },
      counterexample: holds ? null : { n, sn, expected: kind, actual, reason: `s(n) = ${sn}, so ${n} is ${actual}, not ${kind}` } };
  }
  return { ...base, invalid: true };
}

/**
 * Build-CM2 — the classical-v2 checker. Figurate identities are VERIFIED over a bounded range by
 * direct computation of BOTH sides; the Pell fundamental solution is found via the sqrt(N) continued
 * fraction and its defining equation confirmed EXACTLY in BigInt. Result shape mirrors the CM1
 * checker (holds/checkedTo/counterexample) plus a `detail` block the renderer reads. PURE.
 */
function evaluateClassicalV2Claim(c) {
  const base = { holds: false, checkedTo: 0, counterexample: null, observedPeriod: null, classical: true, v2: true };
  if (c.template === "figurate_identity") {
    const { kind, bound } = c.params;
    const r = checkFigurateIdentity(kind, bound);
    return { ...base, holds: !!r.holds, checkedTo: r.checkedTo, counterexample: r.counterexample,
      detail: { kind, bound, checkedTo: r.checkedTo } };
  }
  if (c.template === "pell_fundamental") {
    const { N } = c.params;
    const sol = pellFundamental(N);
    if (!sol) {
      return { ...base, holds: false, checkedTo: 0, detail: { N },
        counterexample: { N, reason: `could not compute a fundamental solution for N = ${N} (perfect square, or beyond the continued-fraction cap)` } };
    }
    const lhs = sol.x * sol.x - BigInt(N) * sol.y * sol.y;   // BigInt — x^2 exceeds 2^53
    const holds = lhs === 1n;
    return { ...base, holds, checkedTo: N,
      detail: { N, x: sol.x.toString(), y: sol.y.toString(), cfTerms: sol.cfTerms, lhs: lhs.toString() },
      counterexample: holds ? null : { N, x: sol.x.toString(), y: sol.y.toString(),
        reason: "the computed (x,y) does not satisfy x^2 - N*y^2 = 1 (should not happen — recorded)" } };
  }
  return { ...base, invalid: true };
}

/**
 * Build-CM3 — the classical-v3 checker (Pythagorean triples). Exact, decidable, PURE, no BigInt
 * (every value stays well under 2^53). Result shape mirrors the CM1/CM2 checkers (holds/checkedTo/
 * counterexample) plus a `detail` block the renderer reads.
 */
function evaluateClassicalV3Claim(c) {
  const base = { holds: false, checkedTo: 0, counterexample: null, observedPeriod: null, classical: true, v3: true };
  if (c.template === "pyth_triple" || c.template === "pyth_primitive") {
    const { a, b, c: hyp } = c.params;
    const lhs = a * a + b * b, rhs = hyp * hyp;
    const pyth = lhs === rhs;
    if (c.template === "pyth_triple") {
      return { ...base, holds: pyth, checkedTo: Math.max(a, b, hyp), detail: { a, b, c: hyp, lhs, rhs },
        counterexample: pyth ? null : { a, b, c: hyp, lhs, rhs, reason: `a^2 + b^2 = ${lhs} does not equal c^2 = ${rhs}` } };
    }
    const g = gcd3(a, b, hyp);
    const holds = pyth && g === 1;
    return { ...base, holds, checkedTo: Math.max(a, b, hyp), detail: { a, b, c: hyp, gcd: g, pyth },
      counterexample: holds ? null : { a, b, c: hyp, gcd: g, pyth,
        reason: !pyth ? `a^2 + b^2 = ${lhs} does not equal c^2 = ${rhs} — not even a Pythagorean triple`
          : `gcd(a,b,c) = ${g} (not 1) — (${a},${b},${hyp}) is ${g}x the primitive triple (${a / g},${b / g},${hyp / g}), not itself primitive` } };
  }
  if (c.template === "euclid_triple") {
    const { m, n } = c.params;
    const tr = euclidTriple(m, n);
    const lhs = tr.a * tr.a + tr.b * tr.b, rhs = tr.c * tr.c;
    const pyth = lhs === rhs;
    const preOk = m > n && n > 0 && gcdInt(m, n) === 1 && ((m % 2) !== (n % 2));
    const g = gcd3(tr.a, tr.b, tr.c);
    const holds = pyth && preOk && g === 1;
    return { ...base, holds, checkedTo: Math.max(tr.a, tr.b, tr.c), detail: { m, n, a: tr.a, b: tr.b, c: tr.c, gcd: g, pyth, preOk },
      counterexample: holds ? null : { m, n, a: tr.a, b: tr.b, c: tr.c, gcd: g, pyth, preOk,
        reason: !pyth ? "the computed (a,b,c) does not satisfy a^2+b^2=c^2 (should not happen — recorded)"
          : !preOk ? `m=${m}, n=${n} do not satisfy Euclid's preconditions (coprime AND opposite parity), so the construction is not guaranteed primitive`
          : `gcd(a,b,c) = ${g} (not 1), so the constructed triple is not primitive` } };
  }
  return { ...base, invalid: true };
}

// Minimal observed period of the digital-root sequence (diagnostic, capped scan).
function observedDrPeriod(c) {
  const cap = Math.min(c.bound, PERIOD_MAX * 4);
  const seq = []; for (let n = 1; n <= cap; n++) seq.push(digitalRootOfGen(c.generator, c.params, n));
  return minimalPeriod(seq);
}
function observedModPeriod(c) {
  const cap = Math.min(c.bound, c.params.m * 4 + PERIOD_MAX);
  const seq = []; for (let n = 1; n <= cap; n++) seq.push(genValueMod(c.generator, c.params, n, c.params.m));
  return minimalPeriod(seq);
}
// Build-R3 — base-radix analogs of observedDrPeriod/observedRootSet (added near classifyHeld below).
function observedDrPeriodBase(c) {
  const cap = Math.min(c.bound, PERIOD_MAX * 4);
  const seq = []; for (let n = 1; n <= cap; n++) seq.push(digitalRootOfGenBase(c.generator, c.params, n, c.params.radix));
  return minimalPeriod(seq);
}
function minimalPeriod(seq) {
  for (let p = 1; p <= Math.floor(seq.length / 2); p++) {
    let ok = true;
    for (let i = 0; i + p < seq.length; i++) { if (seq[i] !== seq[i + p]) { ok = false; break; } }
    if (ok) return p;
  }
  return null;
}

// ── LLM proposer: kernel → claim (or null) ────────────────────────
// Build-R3: the base-b lens vocabulary is appended ONLY when baseLensEnabled() —
// with M8_BASE_LENS=off, buildProposeSystem()/buildLiteralSystem()/buildMultiProposeSystem()
// return the EXACT pre-R3 strings (proven byte-identical in tests/buildR3_baselens.test.js).
function baseLensPromptBlock() {
  return `ADDITIONAL TEMPLATES (base-b lens — same discipline, an arbitrary radix instead of the hardcoded base-10):
  - "dr_base_periodic":  the DIGITAL ROOT IN BASE b of g(n) repeats with period P (base-b digital root = 1 + ((g(n)-1) mod (b-1)), the base-10/mod-9 rule generalized).  params: {"radix": <int 3..1000>, "period": <int 1..100>}
  - "dr_base_constant":  the DIGITAL ROOT IN BASE b of g(n) equals a constant C for all n.  params: {"radix": <int 3..1000>, "value": <int 1..radix-1>}
  - "dr_base_set":       the DIGITAL ROOT IN BASE b of g(n) is ALWAYS one of a fixed set of values.  params: {"radix": <int 3..1000>, "set": [<ints 1..radix-1>]}
ADDITIONAL GENERATORS (base-b lens):
  - "kgonal"      g(n) = the n-th k-gonal (figurate) number, ((k-2)n^2-(k-4)n)/2   params also need {"sides": <int 3..1000>} (sides=3 triangular, 4 square, 5 pentagonal, 6 hexagonal — generalizes them)
  - "primes_mod"  g(n) = the n-th prime number  (bound capped at 20,000 — sieve cost)
NOTE: "radix" (the number-system base, e.g. 12) is a DIFFERENT slot from generator "power"'s own "base" (the exponent base, e.g. 2 in 2^n) — a claim about 2^n in base 12 needs BOTH: params {"base":2,"radix":12,...}.
Example: "in base 12 the digital root of 2^n repeats with period 10" -> {"template":"dr_base_periodic","generator":"power","params":{"base":2,"radix":12,"period":10},"bound":10000,"label":"digital root of 2^n in base 12 has period 10"}`;
}
function buildProposeSystem() {
  let s = `You turn an ESTABLISHED arithmetic KERNEL into ONE concrete, machine-checkable number-pattern claim a computer can falsify by exhaustive computation. This is for honest research: the claim will be CHECKED, never assumed true.

You may ONLY use this closed vocabulary (anything else is rejected):
TEMPLATES:
  - "dr_periodic":  the DIGITAL ROOT of g(n) repeats with period P.  params: {"period": <int 1..100>}
  - "dr_constant":  the DIGITAL ROOT of g(n) equals a constant C for all n.  params: {"value": <int 1..9>}
  - "dr_set":       the DIGITAL ROOT of g(n) is ALWAYS one of a fixed set of values.  params: {"set": [<ints 1..9>]}
  - "mod_cycle":    g(n) mod M is periodic with period P.  params: {"m": <int 2..1000>, "period": <int 1..100>}
GENERATORS g(n):
  - "n"           g(n)=n
  - "multiple"    g(n)=k*n        params also need {"k": <int 1..10000>}
  - "power"       g(n)=base^n     params also need {"base": <int 2..10000>}  (base=2 is the classic doubling/vortex sequence)
  - "square"      g(n)=n^2
  - "cube"        g(n)=n^3
  - "triangular"  g(n)=n(n+1)/2
  - "fib"         g(n)=Fibonacci(n)
  - "lucas"       g(n)=Lucas(n)        (Fibonacci's companion: 1,3,4,7,11,…)
  - "pentagonal"  g(n)=n(3n-1)/2       (figurate / "sacred-geometry" number)
  - "hexagonal"   g(n)=n(2n-1)         (figurate number)`;
  if (baseLensEnabled()) s += `\n${baseLensPromptBlock()}`;
  s += `

OUTPUT CONTRACT — exactly one JSON object, no markdown, no prose:
{"template":"...","generator":"...","params":{...},"bound":<int e.g. 10000>,"label":"<one-line plain statement>"}`;
  if (drProposerExamplesEnabled()) s += `\n\n${DR_PROPOSER_WORKED_EXAMPLES_SINGLE}`;
  s += `

RULES:
1. The claim must follow ONLY from the kernel's established arithmetic — NOT from any speculative/energy/mystical framing. Test the arithmetic, never the mysticism.
2. If the kernel yields no claim expressible in the vocabulary above, output exactly: null
3. Invent nothing the kernel does not support. A missing claim is better than a wrong one.
4. params must merge the template's and the generator's required keys into one flat object.`;
  return s;
}

function parseClaim(raw) {
  try {
    let s = String(raw || "").trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    if (/^null$/i.test(s)) return null;
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    return JSON.parse(s.slice(a, b + 1));
  } catch { return null; }
}

// Build-43 Option B: capture the user's LITERAL assertion as a checkable claim —
// even if it looks false. The whole point is to TEST what they actually said and
// hand back a counterexample when it's wrong (the Scenario-B fix). Fidelity over
// truth: do NOT "repair" a false claim into a true one here (the nearest-true
// variant is offered SEPARATELY, by kernelToConjecture on the salvaged kernel).
function buildLiteralSystem() {
  let s = `You convert the user's STATED number-pattern assertion into ONE machine-checkable claim that captures EXACTLY what they said — even if you suspect it is FALSE. We will test it by exhaustive computation and report a counterexample if it fails; that is the goal, so do not "fix" it.

You may ONLY use this closed vocabulary (anything else is rejected):
TEMPLATES:
  - "dr_periodic":  the DIGITAL ROOT of g(n) repeats with period P.  params: {"period": <int 1..100>}
  - "dr_constant":  the DIGITAL ROOT of g(n) equals a constant C for all n.  params: {"value": <int 1..9>}
  - "dr_set":       the DIGITAL ROOT of g(n) is ALWAYS one of a fixed set.  params: {"set": [<ints 1..9>]}
  - "mod_cycle":    g(n) mod M is periodic with period P.  params: {"m": <int 2..1000>, "period": <int 1..100>}
GENERATORS g(n): "n" | "multiple"{"k":1..10000} | "power"{"base":2..10000} | "square" | "cube" | "triangular" | "fib" | "lucas" | "pentagonal" | "hexagonal"`;
  if (baseLensEnabled()) s += `\nALSO AVAILABLE (base-b lens): templates "dr_base_periodic"/"dr_base_constant"/"dr_base_set" (same shapes, params add {"radix":<int 3..1000>}, values/sets range 1..radix-1 — "radix" is the number-system base, a DIFFERENT slot from generator "power"'s own "base") | generators "kgonal"{"sides":3..1000} | "primes_mod" (bound capped 20,000). Example: "in base 12 the digital root of 2^n repeats with period 10" -> {"template":"dr_base_periodic","generator":"power","params":{"base":2,"radix":12,"period":10},"bound":10000,"label":"digital root of 2^n in base 12 has period 10"}`;
  s += `

OUTPUT — exactly one JSON object, no markdown: {"template":"...","generator":"...","params":{...},"bound":<int>,"label":"<the user's claim, restated plainly>"}
RULES:
1. Mirror the user's literal claim. "the digital root of 3n is always 3" -> {"template":"dr_constant","generator":"multiple","params":{"k":3,"value":3},...}. Do NOT widen "always 3" into a set or a period.
2. If the user's assertion cannot be expressed in the vocabulary above, output exactly: null
3. Invent nothing they did not assert.`;
  return s;
}

/** Gemini maps the user's LITERAL assertion to a checkable claim. Fail-safe → null. */
async function proposeLiteralClaim(text) {
  const t = String(text || "");
  if (!t.trim()) return null;
  try {
    const raw = await generate({
      systemInstruction: buildLiteralSystem(),
      contents: [{ role: "user", parts: [{ text: `USER ASSERTION: "${t.slice(0, 600)}"\n\nOutput the JSON object (or null) now.` }] }],
      genConfig: { temperature: 0, maxOutputTokens: 300 },
    });
    return validateClaim(parseClaim(raw));
  } catch (e) {
    console.error("[M8] proposeLiteralClaim error (non-fatal):", e.message);
    return null;
  }
}

// ── Build-CM1 — classical-math proposer: a user's classical-number question → ONE classical
// claim (or null). A SEPARATE closed vocabulary from the digital-root proposer, which it never
// touches (so the R3 OFF-identity of buildProposeSystem/buildLiteralSystem/buildMultiProposeSystem
// is preserved). WORKED EXAMPLES included (the R3 build lesson: new proposer vocab needs a
// concrete worked example or the model guesses the shape). Fail-safe → null; validated. ──
function buildClassicalProposeSystem() {
  return `You convert a user's question about CLASSICAL number theory into ONE machine-checkable claim that a computer verifies by EXACT direct computation (summing proper divisors, trial-division primality). ONLY these templates exist — anything else → null:
TEMPLATES:
  - "amicable_pair"   are m and n an amicable pair (s(m)=n AND s(n)=m, m≠n)?   params: {"m": <int 2..1000000000>, "n": <int 2..1000000000>}
  - "perfect_number"  is n a perfect number (s(n)=n)?                          params: {"n": <int 2..1000000000000>}
  - "euclid_euler"    does the Euclid–Euler form 2^(p-1)(2^p-1) give a perfect number for exponent p (i.e. is 2^p-1 a Mersenne prime)?   params: {"p": <int 2..26>}
  - "thabit_rule"     does Thabit ibn Qurra's rule produce an amicable pair at index n?   params: {"index": <int 2..16>}
  - "aliquot_class"   is n abundant / deficient / perfect (compare s(n) to n)?  params: {"n": <int 1..1000000000000>, "kind": "abundant"|"deficient"|"perfect"}
where s(k) = the sum of the PROPER divisors of k (every positive divisor of k except k itself).

OUTPUT — exactly one JSON object, no markdown, no prose:
{"template":"...","params":{...},"label":"<the user's question restated plainly>"}

WORKED EXAMPLES:
  "are 220 and 284 amicable?"          -> {"template":"amicable_pair","params":{"m":220,"n":284},"label":"220 and 284 are an amicable pair"}
  "is 28 a perfect number?"            -> {"template":"perfect_number","params":{"n":28},"label":"28 is a perfect number"}
  "is 12 perfect?"                     -> {"template":"perfect_number","params":{"n":12},"label":"12 is a perfect number"}
  "does 2^5-1 give a perfect number?"  -> {"template":"euclid_euler","params":{"p":5},"label":"the Euclid-Euler form for p=5 is perfect"}
  "check Thabit's rule for n=2"        -> {"template":"thabit_rule","params":{"index":2},"label":"Thabit's rule yields an amicable pair at index 2"}
  "is 12 abundant?"                    -> {"template":"aliquot_class","params":{"n":12,"kind":"abundant"},"label":"12 is abundant"}

RULES:
1. Capture EXACTLY what the user asked — even if you suspect the answer is "no" (the checker reports it honestly, with the computed witness). Do NOT "fix" a false claim into a true one.
2. If the question is not expressible above — e.g. it asks whether a number is spiritually/cosmically "perfect", or any claim with no checkable arithmetic — output exactly: null
3. Invent no numbers the user did not give.`;
}

/** Gemini maps a classical-number question to a checkable classical claim. Fail-safe → null. */
async function proposeClassicalClaim(text) {
  const t = String(text || "");
  if (!t.trim()) return null;
  try {
    const raw = await generate({
      systemInstruction: buildClassicalProposeSystem(),
      contents: [{ role: "user", parts: [{ text: `USER QUESTION: "${t.slice(0, 400)}"\n\nOutput the JSON object (or null) now.` }] }],
      genConfig: { temperature: 0, maxOutputTokens: 200 },
    });
    return validateClaim(parseClaim(raw));   // classical templates route to validateClassicalClaim
  } catch (e) {
    console.error("[M8] proposeClassicalClaim error (non-fatal):", e.message);
    return null;
  }
}

// ── Build-CM2 — classical-v2 proposer: a figurate-identity or Pell question → ONE claim (or null).
// Its OWN closed vocabulary, separate from the digital-root AND the CM1 classical proposers (never
// touches either — the R3 + CM1 OFF-identities hold). WORKED EXAMPLES included (the R3 lesson: new
// proposer vocab needs a concrete worked example or the model guesses the shape). Fail-safe → null.
function buildClassicalV2ProposeSystem() {
  return `You convert a user's question about CLASSICAL FIGURATE NUMBERS or the PELL EQUATION into ONE machine-checkable claim a computer verifies by EXACT direct computation. ONLY these templates exist — anything else → null:
TEMPLATES:
  - "figurate_identity"  verify a classical figurate identity over a range by computing BOTH sides.  params: {"kind": one of "hexagonal_triangular" | "nicomachus_cubes" | "square_consecutive_triangular"}
        - "hexagonal_triangular"          every hexagonal number is triangular: H(n) = T(2n-1)
        - "nicomachus_cubes"              Nicomachus's theorem: 1^3+2^3+...+n^3 = T(n)^2 (square of the n-th triangular number)
        - "square_consecutive_triangular" every square is the sum of two consecutive triangular numbers: n^2 = T(n-1)+T(n)
  - "pell_fundamental"   find the fundamental (smallest) solution of x^2 - N*y^2 = 1 via the continued fraction of sqrt(N), and verify it.  params: {"N": <int 2..1000, not a perfect square>}
where T(k) = k(k+1)/2 is the k-th triangular number and H(k) = k(2k-1) is the k-th hexagonal number.

OUTPUT — exactly one JSON object, no markdown, no prose:
{"template":"...","params":{...},"label":"<the user's question restated plainly>"}

WORKED EXAMPLES:
  "is every hexagonal number triangular?"                            -> {"template":"figurate_identity","params":{"kind":"hexagonal_triangular"},"label":"every hexagonal number is triangular"}
  "is the sum of the first n cubes a perfect square?"                -> {"template":"figurate_identity","params":{"kind":"nicomachus_cubes"},"label":"the sum of the first n cubes equals the n-th triangular number squared"}
  "is every square the sum of two consecutive triangular numbers?"   -> {"template":"figurate_identity","params":{"kind":"square_consecutive_triangular"},"label":"every square is the sum of two consecutive triangular numbers"}
  "smallest solution to x^2 - 61 y^2 = 1?"                           -> {"template":"pell_fundamental","params":{"N":61},"label":"the fundamental solution of x^2 - 61 y^2 = 1"}
  "solve Pell's equation for N=109"                                  -> {"template":"pell_fundamental","params":{"N":109},"label":"the fundamental solution of x^2 - 109 y^2 = 1"}

RULES:
1. Capture EXACTLY what the user asked. Do NOT invent an N or a figurate kind the user did not indicate.
2. If the question is not expressible above — e.g. it asks about the mystical / "sacred geometry" meaning of triangular numbers, or a Pell N outside 2..1000 or a perfect square — output exactly: null
3. Invent nothing the user did not ask.`;
}

/** Gemini maps a figurate/Pell question to a checkable classical-v2 claim. Fail-safe → null. */
async function proposeClassicalV2Claim(text) {
  const t = String(text || "");
  if (!t.trim()) return null;
  try {
    const raw = await generate({
      systemInstruction: buildClassicalV2ProposeSystem(),
      contents: [{ role: "user", parts: [{ text: `USER QUESTION: "${t.slice(0, 400)}"\n\nOutput the JSON object (or null) now.` }] }],
      genConfig: { temperature: 0, maxOutputTokens: 200 },
    });
    return validateClaim(parseClaim(raw));   // v2 templates route to validateClassicalV2Claim
  } catch (e) {
    console.error("[M8] proposeClassicalV2Claim error (non-fatal):", e.message);
    return null;
  }
}

// ── Build-CM3 — classical-v3 proposer: a Pythagorean-triple question → ONE claim (or null). Its OWN
// closed vocabulary, separate from the digital-root AND the CM1/CM2 classical proposers (never
// touches any of them — the R3 + CM1 + CM2 OFF-identities hold). WORKED EXAMPLES included (the R3
// lesson: new proposer vocab needs a concrete worked example or the model guesses the shape).
// Fail-safe → null. ──
function buildClassicalV3ProposeSystem() {
  return `You convert a user's question about PYTHAGOREAN TRIPLES into ONE machine-checkable claim a computer verifies by EXACT direct computation. ONLY these templates exist — anything else → null:
TEMPLATES:
  - "pyth_triple"     is (a,b,c) a Pythagorean triple (a^2+b^2=c^2)?                                     params: {"a": <int 1..10000000>, "b": <int 1..10000000>, "c": <int 1..10000000>}
  - "pyth_primitive"  is (a,b,c) a PRIMITIVE Pythagorean triple (a^2+b^2=c^2 AND gcd(a,b,c)=1)?           params: {"a": <int 1..10000000>, "b": <int 1..10000000>, "c": <int 1..10000000>}
  - "euclid_triple"   does Euclid's formula (a=m^2-n^2, b=2mn, c=m^2+n^2) at m,n construct a PRIMITIVE triple (checks m>n, coprime, opposite parity, then verifies the result)?   params: {"m": <int 2..3000>, "n": <int 1..2999>}

OUTPUT — exactly one JSON object, no markdown, no prose:
{"template":"...","params":{...},"label":"<the user's question restated plainly>"}

WORKED EXAMPLES:
  "is (3,4,5) a Pythagorean triple?"                          -> {"template":"pyth_triple","params":{"a":3,"b":4,"c":5},"label":"(3,4,5) is a Pythagorean triple"}
  "is 6,8,10 a primitive Pythagorean triple?"                 -> {"template":"pyth_primitive","params":{"a":6,"b":8,"c":10},"label":"(6,8,10) is a primitive Pythagorean triple"}
  "is 20,21,29 primitive?"                                    -> {"template":"pyth_primitive","params":{"a":20,"b":21,"c":29},"label":"(20,21,29) is a primitive Pythagorean triple"}
  "generate a primitive triple from m=2, n=1"                 -> {"template":"euclid_triple","params":{"m":2,"n":1},"label":"Euclid's formula at m=2, n=1 gives a primitive triple"}
  "does Euclid's formula give a primitive triple for m=4, n=2?" -> {"template":"euclid_triple","params":{"m":4,"n":2},"label":"Euclid's formula at m=4, n=2 gives a primitive triple"}

RULES:
1. Capture EXACTLY the numbers the user gave — even if you suspect the answer is "no" (the checker reports it honestly, with the computed witness). Do NOT "fix" a false claim into a true one.
2. If the question is not expressible above — e.g. it asks about the mystical / "sacred" significance of the 3-4-5 triangle, or gives numbers outside the caps — output exactly: null
3. Invent no numbers the user did not give.`;
}

/** Gemini maps a Pythagorean-triple question to a checkable classical-v3 claim. Fail-safe → null. */
async function proposeClassicalV3Claim(text) {
  const t = String(text || "");
  if (!t.trim()) return null;
  try {
    const raw = await generate({
      systemInstruction: buildClassicalV3ProposeSystem(),
      contents: [{ role: "user", parts: [{ text: `USER QUESTION: "${t.slice(0, 400)}"\n\nOutput the JSON object (or null) now.` }] }],
      genConfig: { temperature: 0, maxOutputTokens: 200 },
    });
    return validateClaim(parseClaim(raw));   // v3 templates route to validateClassicalV3Claim
  } catch (e) {
    console.error("[M8] proposeClassicalV3Claim error (non-fatal):", e.message);
    return null;
  }
}

/** Gemini proposes a checkable claim for a kernel. Fail-safe → null. Validated against the whitelist. */
async function kernelToConjecture(kernel) {
  const label = (kernel && (kernel.label || "")) + "";
  const content = (kernel && (kernel.content || "")) + "";
  if (!label && !content) return null;
  try {
    const raw = await generate({
      systemInstruction: buildProposeSystem(),
      contents: [{ role: "user", parts: [{ text: `KERNEL label: "${label}"\nKERNEL content: "${content.slice(0, 500)}"\n\nOutput the JSON object (or null) now.` }] }],
      genConfig: { temperature: 0, maxOutputTokens: 300 },
      providerOrder: drProposerExamplesEnabled() ? DR_PROPOSER_PROVIDER_ORDER : undefined,
    });
    return validateClaim(parseClaim(raw));   // null if off-schema or unproposable
  } catch (e) {
    console.error("[M8] kernelToConjecture error (non-fatal):", e.message);
    return null;
  }
}

// ── Build-47: multi-candidate proposal ("smarter" generation) ─────
// Instead of ONE guess, ask for up to K DISTINCT candidate claims in one pass,
// validate each against the closed vocabulary (the anti-smuggling gate runs
// per-candidate), dedupe, and let the deterministic checker judge them all. The
// LLM widens the net; code still decides truth. Fail-safe → [].
const MULTI_K = 6;
function buildMultiProposeSystem() {
  let s = `You turn an ESTABLISHED arithmetic KERNEL into SEVERAL concrete, machine-checkable number-pattern claims a computer can falsify by exhaustive computation. This is honest research: every claim will be CHECKED, never assumed true. Variety is the point — vary the template AND the generator across your candidates.

You may ONLY use this closed vocabulary (anything else is rejected):
TEMPLATES:
  - "dr_periodic":  the DIGITAL ROOT of g(n) repeats with period P.  params: {"period": <int 1..100>}
  - "dr_constant":  the DIGITAL ROOT of g(n) equals a constant C for all n.  params: {"value": <int 1..9>}
  - "dr_set":       the DIGITAL ROOT of g(n) is ALWAYS one of a fixed set of values.  params: {"set": [<ints 1..9>]}
  - "mod_cycle":    g(n) mod M is periodic with period P.  params: {"m": <int 2..1000>, "period": <int 1..100>}
GENERATORS g(n):
  - "n" g(n)=n | "multiple" g(n)=k*n {"k":1..10000} | "power" g(n)=base^n {"base":2..10000} (base=2 = classic doubling/vortex)
  - "square" n^2 | "cube" n^3 | "triangular" n(n+1)/2 | "fib" Fibonacci(n) | "lucas" Lucas(n) | "pentagonal" n(3n-1)/2 | "hexagonal" n(2n-1)`;
  if (baseLensEnabled()) s += `\nALSO AVAILABLE (base-b lens): templates "dr_base_periodic"/"dr_base_constant"/"dr_base_set" (add {"radix":3..1000}, values/sets range 1..radix-1 — "radix" is a DIFFERENT slot from generator "power"'s own "base") | generators "kgonal"{"sides":3..1000} | "primes_mod" (bound capped 20,000). Example: "in base 12 the digital root of 2^n repeats with period 10" -> {"template":"dr_base_periodic","generator":"power","params":{"base":2,"radix":12,"period":10},"bound":10000,"label":"..."}`;
  s += `

OUTPUT CONTRACT — a JSON ARRAY of up to ${MULTI_K} objects, no markdown, no prose:
[{"template":"...","generator":"...","params":{...},"bound":<int e.g. 10000>,"label":"<one-line plain statement>"}, ...]`;
  if (drProposerExamplesEnabled()) s += `\n\n${DR_PROPOSER_WORKED_EXAMPLES_MULTI}`;
  s += `

RULES:
1. Each claim must follow ONLY from the kernel's established arithmetic — NOT from any speculative/energy/mystical framing. Test the arithmetic, never the mysticism.
2. Make the claims as TIGHT/specific as you honestly can: prefer the smallest digital-root set and the minimal period. Do NOT pad the array with trivially-true claims (e.g. "the digital root is one of {1..9}", or a period that is a large multiple of the real one) — a trivial claim is worse than a shorter array.
3. If the kernel yields NO claim expressible in the vocabulary above, output exactly: []
4. Invent nothing the kernel does not support. params must merge the template's and the generator's required keys into one flat object.`;
  return s;
}

function canonicalClaimKey(c) {
  return `${c.template}|${c.generator}|${JSON.stringify(c.params)}|${c.bound}`;
}

/** Parse an LLM reply into an array of raw claim objects (tolerates a single object or a ```fence```). */
function parseClaims(raw) {
  try {
    let s = String(raw || "").trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    if (/^(?:null|\[\s*\])$/i.test(s)) return [];
    const a = s.indexOf("["), b = s.lastIndexOf("]");
    if (a >= 0 && b > a) {
      const arr = JSON.parse(s.slice(a, b + 1));
      return Array.isArray(arr) ? arr : [];
    }
    const oa = s.indexOf("{"), ob = s.lastIndexOf("}");
    if (oa >= 0 && ob > oa) return [JSON.parse(s.slice(oa, ob + 1))];
    return [];
  } catch { return []; }
}

/** Gemini proposes up to K distinct checkable claims for a kernel. Fail-safe → []. Each validated. */
async function proposeKernelCandidates(kernel, K = MULTI_K) {
  const label = (kernel && (kernel.label || "")) + "";
  const content = (kernel && (kernel.content || "")) + "";
  if (!label && !content) return [];
  try {
    const raw = await generate({
      systemInstruction: buildMultiProposeSystem(),
      contents: [{ role: "user", parts: [{ text: `KERNEL label: "${label}"\nKERNEL content: "${content.slice(0, 500)}"\n\nOutput up to ${K} DISTINCT candidate claims as a JSON array now (or [] if none).` }] }],
      genConfig: { temperature: 0.4, maxOutputTokens: 700 },
      providerOrder: drProposerExamplesEnabled() ? DR_PROPOSER_PROVIDER_ORDER : undefined,
    });
    const seen = new Set();
    const out = [];
    for (const c of parseClaims(raw)) {
      const v = validateClaim(c);            // per-candidate anti-smuggling gate
      if (!v) continue;
      const key = canonicalClaimKey(v);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
      if (out.length >= K) break;
    }
    return out;
  } catch (e) {
    console.error("[M8] proposeKernelCandidates error (non-fatal):", e.message);
    return [];
  }
}

// ── Triviality floor (Build-47) — so "richer guesses" never means "more vacuous
// holds". Mirrors the M3 vacuity-floor philosophy for digital-root claims. Pure.
// Returns "tight" | "trivial" for a HELD claim (null if not held / no claim).
function observedRootSet(claim) {
  const cap = Math.min(claim.bound || N_DEFAULT, 5000);
  const seen = new Set();
  for (let n = 1; n <= cap; n++) { const dr = digitalRootOfGen(claim.generator, claim.params, n); if (dr != null) seen.add(dr); }
  return [...seen].sort((a, b) => a - b);
}
// Build-R3 — base-radix analog of observedRootSet, for dr_base_set triviality checks.
function observedRootSetBase(claim) {
  const cap = Math.min(claim.bound || N_DEFAULT, 5000);
  const seen = new Set();
  for (let n = 1; n <= cap; n++) { const dr = digitalRootOfGenBase(claim.generator, claim.params, n, claim.params.radix); if (dr != null) seen.add(dr); }
  return [...seen].sort((a, b) => a - b);
}
function classifyHeld(claim, result) {
  if (!claim || !result || !result.holds) return null;
  switch (claim.template) {
    case "dr_constant": return "tight";           // a single fixed value is inherently tight
    case "dr_base_constant": return "tight";
    case "dr_set": {
      // held ⇒ observed roots ⊆ claim.set. Tight iff exactly equal; a strict
      // superset (incl. {1..9}) held only because it was loose → trivial.
      const obs = observedRootSet(claim);
      return claim.params.set.length === obs.length ? "tight" : "trivial";
    }
    case "dr_base_set": {
      const obs = observedRootSetBase(claim);
      return claim.params.set.length === obs.length ? "tight" : "trivial";
    }
    case "dr_periodic":
    case "mod_cycle":
    case "dr_base_periodic": {
      const minP = result.observedPeriod;
      if (minP == null) return "tight";            // couldn't pin a minimal period → don't call it trivial
      return claim.params.period === minP ? "tight" : "trivial";  // a proper multiple held only by looseness
    }
    default: return "tight";
  }
}
// Lower score = tighter / more informative (best headline candidate).
function tightnessScore(claim) {
  switch (claim.template) {
    case "dr_constant": return 1;
    case "dr_base_constant": return 1;
    case "dr_set": return claim.params.set.length;
    case "dr_base_set": return claim.params.set.length;
    case "dr_periodic": return claim.params.period;
    case "mod_cycle": return claim.params.period;
    case "dr_base_periodic": return claim.params.period;
    default: return 99;
  }
}
const TEMPLATE_PREF = {
  dr_constant: 0, dr_set: 1, dr_periodic: 2, mod_cycle: 3,
  // Build-R3 — base-b lens templates rank after the base-10 family so a tie
  // prefers the existing (curated-literature-backed) templates as the headline.
  dr_base_constant: 4, dr_base_set: 5, dr_base_periodic: 6,
};

/**
 * Build-47 — propose K candidates, evaluate all deterministically, partition into
 * HELD-TIGHT / HELD-TRIVIAL / FALSIFIED, pick the most-informative headline.
 * One LLM pass; the checker is the sole truth judge. Returns:
 *   { best:{claim,result,cls}|null, headlineClass, held[], tight[], trivial[], falsified[], tried }
 */
async function bestKernelConjecture(kernel, K = MULTI_K) {
  const cands = await proposeKernelCandidates(kernel, K);
  const evald = cands.map((claim) => {
    const result = evaluateClaim(claim);
    return { claim, result, cls: classifyHeld(claim, result) };
  });
  const held      = evald.filter((e) => e.result.holds);
  const tight     = held.filter((e) => e.cls === "tight");
  const trivial   = held.filter((e) => e.cls === "trivial");
  const falsified = evald.filter((e) => !e.result.holds && !e.result.invalid);
  const byInfo = (a, b) =>
    (tightnessScore(a.claim) - tightnessScore(b.claim)) ||
    ((TEMPLATE_PREF[a.claim.template] ?? 9) - (TEMPLATE_PREF[b.claim.template] ?? 9)) ||
    ((b.result.checkedTo || 0) - (a.result.checkedTo || 0));
  let best = null, headlineClass = null;
  if (tight.length)        { tight.sort(byInfo);     best = tight[0];     headlineClass = "tight"; }
  else if (trivial.length) { trivial.sort(byInfo);   best = trivial[0];   headlineClass = "trivial"; }
  else if (falsified.length) {                       best = falsified[0]; headlineClass = "falsified"; }
  return { best, headlineClass, held, tight, trivial, falsified, tried: evald.length };
}

// ── Nearest-TRUE fallback (Build-43 Option-B follow-up #1) ─────────
// When the user's LITERAL claim is FALSE and there's no salvaged kernel to mine, we
// still owe them a constructive "here's what IS true" — derived deterministically
// from their OWN claim's generator (no LLM). We scan the actual digital-root sequence
// and offer the TIGHTEST true digital-root pattern: a constant if it never varies,
// else the exact set of roots it visits. Always evidence-to-N, never proven; null if
// the literal claim isn't a digital-root claim or nothing holds.
function nearestTrueFromLiteral(literal) {
  if (!literal || !["dr_constant", "dr_set", "dr_periodic"].includes(literal.template)) return null;
  const gen = literal.generator;
  const genParams = {};
  if (literal.params && Number.isInteger(literal.params.k)) genParams.k = literal.params.k;
  if (literal.params && Number.isInteger(literal.params.base)) genParams.base = literal.params.base;
  const bound = literal.bound || N_DEFAULT;
  const cap = Math.min(bound, 5000);
  const seen = new Set();
  for (let n = 1; n <= cap; n++) { const dr = digitalRootOfGen(gen, genParams, n); if (dr != null) seen.add(dr); }
  if (!seen.size) return null;
  const set = [...seen].sort((a, b) => a - b);
  let claim;
  if (set.length === 1) {
    claim = { template: "dr_constant", generator: gen, params: { ...genParams, value: set[0] }, bound, label: `the digital root is always ${set[0]}` };
  } else {
    claim = { template: "dr_set", generator: gen, params: { ...genParams, set }, bound, label: `the digital root is always one of {${set.join(", ")}}` };
  }
  const valid = validateClaim(claim);
  if (!valid) return null;
  const result = evaluateClaim(valid);
  return result.holds ? { claim: valid, result } : null;
}

// ── Honest narration ──────────────────────────────────────────────
// verification_state a held claim may carry — capped at 'empirical', NEVER 'proven'.
function heldVerificationState() { return "empirical"; }

// Build-R2 — cite a HELD pattern that matches a curated, source-verified seed, so an
// "observed through N" result also says "…and this FORM is known mathematics 〔cited〕".
// The kernel-conjecture claim keeps its structural slots inside `params`; the seed-pack
// comparator reads slots off the candidate top-level, so we FLATTEN params up before
// matching. Rendered in R1's cited-recall style (〔citation〕) so the line reads exactly
// like a cited KG recall. `matchFn` is injectable for tests; default = the real matcher.
//
// DEFERRED-ACTIVATION (load-bearing honesty): digital-root-v1 ships with
// matches_templates EMPTY on every seed, so this returns "" TODAY — an observed pattern
// gets NO citation rather than a fabricated one. It lights up automatically when R3 binds
// the seeds to the dr_periodic / dr_set / mod_cycle templates; no change is needed here.
function seedCandidateFromClaim(claim) {
  if (!claim || typeof claim !== "object") return null;
  return { template: claim.template, generator: claim.generator, ...(claim.params || {}) };
}
function seedMatchLine(claim, matchFn) {
  try {
    const match = (typeof matchFn === "function" ? matchFn : seedKnownMatch)(seedCandidateFromClaim(claim));
    if (!match) return "";
    const cite = match.citation ? ` 〔${match.citation}〕` : "";
    return `\n\n📚 This matches KNOWN mathematics — ${match.title}${cite}. The general FORM is established (cited); the exhaustive bound above is machine-derived, not a proof, and it does not upgrade the speculative idea.`;
  } catch { return ""; }
}

// ── Build-CM1 — classical-math seed citations (self-contained) ─────────────────
// Deliberately loads classical-math-v1.json DIRECTLY (not via seed-pack.js's PACKS), so this
// lane owns its file end-to-end and can never collide with a parallel pack registration. Same
// R2 schema + the same first-hit-wins "template:slot=val" matching semantics as
// seed-pack.js#seedKnownMatch. Loaded once, guarded so a missing/malformed file never crashes
// module load — the citation simply doesn't appear (never a fabricated one).
let _classicalPack = null;
function classicalPack() {
  if (_classicalPack !== null) return _classicalPack;
  try { _classicalPack = require("../data/seed-packs/classical-math-v1.json"); }
  catch { _classicalPack = { pack: "classical-math-v1", seeds: [] }; }
  return _classicalPack;
}
function classicalSeedMatch(candidate) {
  if (!candidate || !candidate.template) return null;
  const pack = classicalPack();
  for (const s of pack.seeds || []) {
    for (const pat of s.matches_templates || []) {
      const [tpl, cond] = String(pat).split(":");
      if (tpl !== candidate.template) continue;
      if (cond) {
        const [slot, val] = cond.split("=");
        if (String(candidate[slot]) !== String(val)) continue;
      }
      return { id: s.id, title: s.title, citation: s.source_citation, pack: pack.pack };
    }
  }
  return null;
}
// Rendered in R1's cited-recall style (〔citation〕). matchFn is injectable for tests
// (mirrors seedMatchLine's DI); default = the real classical matcher.
function classicalSeedMatchLine(claim, matchFn) {
  try {
    const match = (typeof matchFn === "function" ? matchFn : classicalSeedMatch)(seedCandidateFromClaim(claim));
    if (!match) return "";
    const cite = match.citation ? ` 〔${match.citation}〕` : "";
    return `\n\n📚 This matches KNOWN mathematics — ${match.title}${cite}. The general theorem is the cited literature's; the check above is an exact, direct computation of THIS instance — not a new proof, and it endorses no non-mathematical significance.`;
  } catch { return ""; }
}

// ── Build-CM2 — classical-v2 seed citations (self-contained, own file) ──────────
// Same pattern as classicalPack/classicalSeedMatch: load classical-math-v2.json DIRECTLY (never via
// seed-pack.js's PACKS), so this lane owns its file end-to-end and can never collide with a parallel
// pack registration. Guarded so a missing/malformed file never crashes module load — the citation
// simply doesn't appear (never a fabricated one). Same first-hit-wins "template:slot=val" matching,
// so a figurate seed can bind ONE identity kind (e.g. figurate_identity:kind=nicomachus_cubes).
let _classicalV2Pack = null;
function classicalV2Pack() {
  if (_classicalV2Pack !== null) return _classicalV2Pack;
  try { _classicalV2Pack = require("../data/seed-packs/classical-math-v2.json"); }
  catch { _classicalV2Pack = { pack: "classical-math-v2", seeds: [] }; }
  return _classicalV2Pack;
}
function classicalV2SeedMatch(candidate) {
  if (!candidate || !candidate.template) return null;
  const pack = classicalV2Pack();
  for (const s of pack.seeds || []) {
    for (const pat of s.matches_templates || []) {
      const [tpl, cond] = String(pat).split(":");
      if (tpl !== candidate.template) continue;
      if (cond) {
        const [slot, val] = cond.split("=");
        if (String(candidate[slot]) !== String(val)) continue;
      }
      return { id: s.id, title: s.title, citation: s.source_citation, pack: pack.pack };
    }
  }
  return null;
}
// Rendered in R1's cited-recall style (〔citation〕). matchFn injectable for tests; default = real.
function classicalV2SeedMatchLine(claim, matchFn) {
  try {
    const match = (typeof matchFn === "function" ? matchFn : classicalV2SeedMatch)(seedCandidateFromClaim(claim));
    if (!match) return "";
    const cite = match.citation ? ` 〔${match.citation}〕` : "";
    return `\n\n📚 This matches KNOWN mathematics — ${match.title}${cite}. The general theorem is the cited literature's; the check above is an exact, direct computation of THIS instance — not a new proof, and it endorses no non-mathematical significance.`;
  } catch { return ""; }
}

// ── Build-CM3 — classical-v3 seed citations (self-contained, own file) ──────────
// Same pattern as classicalPack/classicalV2Pack: load classical-math-v3.json DIRECTLY (never via
// seed-pack.js's PACKS), so this lane owns its file end-to-end and can never collide with a parallel
// pack registration. Guarded so a missing/malformed file never crashes module load — the citation
// simply doesn't appear (never a fabricated one). Same first-hit-wins "template:slot=val" matching.
let _classicalV3Pack = null;
function classicalV3Pack() {
  if (_classicalV3Pack !== null) return _classicalV3Pack;
  try { _classicalV3Pack = require("../data/seed-packs/classical-math-v3.json"); }
  catch { _classicalV3Pack = { pack: "classical-math-v3", seeds: [] }; }
  return _classicalV3Pack;
}
function classicalV3SeedMatch(candidate) {
  if (!candidate || !candidate.template) return null;
  const pack = classicalV3Pack();
  for (const s of pack.seeds || []) {
    for (const pat of s.matches_templates || []) {
      const [tpl, cond] = String(pat).split(":");
      if (tpl !== candidate.template) continue;
      if (cond) {
        const [slot, val] = cond.split("=");
        if (String(candidate[slot]) !== String(val)) continue;
      }
      return { id: s.id, title: s.title, citation: s.source_citation, pack: pack.pack };
    }
  }
  return null;
}
// Rendered in R1's cited-recall style (〔citation〕). matchFn injectable for tests; default = real.
function classicalV3SeedMatchLine(claim, matchFn) {
  try {
    const match = (typeof matchFn === "function" ? matchFn : classicalV3SeedMatch)(seedCandidateFromClaim(claim));
    if (!match) return "";
    const cite = match.citation ? ` 〔${match.citation}〕` : "";
    return `\n\n📚 This matches KNOWN mathematics — ${match.title}${cite}. The general result is the cited literature's; the check above is an exact, direct computation of THIS instance — not a new proof, and it endorses no non-mathematical significance.`;
  } catch { return ""; }
}

function renderKernelConjecture(kernel, claim, result) {
  const kl = (kernel && (kernel.label || kernel.content)) || "the kernel";
  if (!claim) {
    return `I couldn't form a machine-checkable number-pattern claim from this kernel ("${String(kl).slice(0, 80)}"). Nothing tested — no result to report. (The kernel stays as classified; the speculative idea remains speculative.)`;
  }
  const head = `Kernel under test: ${String(kl).slice(0, 100)}\nDerived checkable claim: ${claim.label || `${claim.template} / ${claim.generator}`}`;
  if (result.invalid) return `${head}\n\nThe proposed claim was off-schema and was rejected — nothing was tested.`;
  if (result.holds) {
    return `${head}\n\n✅ OBSERVED by exhaustive computation through n = ${result.checkedTo.toLocaleString()}` +
      (result.observedPeriod ? ` (observed minimal period ${result.observedPeriod})` : "") +
      `.\n\nThis is evidence up to N — it is NOT a proof for all n, and it does NOT validate the broader speculative idea (which stays speculative). Status: tested-to-N / empirical, never proven.` +
      seedMatchLine(claim);   // Build-R2: append "matches known math 〔cited〕" iff a seed matches (inert until R3 binds)
  }
  const ce = result.counterexample || {};
  const drSetMiss = (ce.dr !== undefined && Array.isArray(ce.set)) ? ` (digital root ${ce.dr} not in {${ce.set.join(", ")}})` : "";
  return `${head}\n\n❌ FALSIFIED. First counterexample at n = ${ce.n}` +
    (ce.dr_n !== undefined ? ` (digital root ${ce.dr_n} ≠ ${ce.dr_n_plus_p} at n+${ce.period})` : "") +
    (ce.dr !== undefined && ce.expected !== undefined ? ` (digital root ${ce.dr} ≠ expected ${ce.expected})` : "") +
    drSetMiss +
    `.\n\nThe claim is FALSE as stated. Recorded as a failed attempt (data, not noise).`;
}

// ── Build-CM1 — deterministic honest narration for a classical-math check. Like
// renderKernelConjecture this is CODE-narrated (no LLM re-narration that could drift), and the
// 📚 citation is CODE-GUARANTEED when a real seed binds (the R4 lesson: a required verbatim line
// must be code-emitted, not prompt-hoped). matchFn is injectable for tests. ──
function classicalVerificationState() { return "verified"; }   // decidable instance, NOT a general proof
function renderClassicalClaim(claim, result, matchFn) {
  const c = validateClaim(claim);
  if (!c || !CLASSICAL_TEMPLATES.includes(c.template)) {
    return "That wasn't a well-formed classical-number claim I could check, so I won't guess a result.";
  }
  const d = (result && result.detail) || {};
  const NOTPROOF = `\n\nThis is exact arithmetic — a DECIDED fact for this specific number, fully computed (not an "observed-to-N" pattern). It is not a general proof (the general theorem belongs to the cited literature), and it grants no mystical or cosmic significance — that would be a separate, non-mathematical claim with no promotion path.`;
  let head;
  if (result && result.holds) {
    switch (c.template) {
      case "amicable_pair":
        head = `✅ VERIFIED by direct computation: ${d.m} and ${d.n} are an AMICABLE PAIR — s(${d.m}) = ${d.sm} and s(${d.n}) = ${d.sn} (each equals the sum of the other's proper divisors).`; break;
      case "perfect_number":
        head = `✅ VERIFIED: ${d.n} is a PERFECT NUMBER — the sum of its proper divisors s(${d.n}) = ${d.sn} equals ${d.n} itself.`; break;
      case "euclid_euler":
        head = `✅ VERIFIED the Euclid–Euler construction at exponent p = ${d.p}: 2^${d.p} − 1 = ${d.mersenne} is prime (a Mersenne prime), and 2^${d.p - 1} · ${d.mersenne} = ${d.form} is perfect (its proper divisors sum to itself, computed directly). This is Euclid's direction — a Mersenne prime yields an even perfect number — confirmed by computation.`; break;
      case "thabit_rule":
        head = `✅ VERIFIED Thabit ibn Qurra's rule at index n = ${d.index}: p = 3·2^${d.index - 1}−1 = ${d.p}, q = 3·2^${d.index}−1 = ${d.q}, r = 9·2^${2 * d.index - 1}−1 = ${d.r} are ALL prime, so the rule builds 2^${d.index}·p·q = ${d.a} and 2^${d.index}·r = ${d.b} — and direct computation confirms they are amicable (s(${d.a}) = ${d.b}, s(${d.b}) = ${d.a}).`; break;
      case "aliquot_class":
        head = `✅ VERIFIED: ${d.n} is ${String(d.kind).toUpperCase()} — s(${d.n}) = ${d.sn} ${d.kind === "abundant" ? ">" : d.kind === "deficient" ? "<" : "="} ${d.n}.`; break;
      default: head = "✅ VERIFIED.";
    }
    return head + classicalSeedMatchLine(c, matchFn) + NOTPROOF;
  }
  // Falsified / no-pair — honest, with the computed witness. No citation (nothing established held).
  const ce = (result && result.counterexample) || {};
  switch (c.template) {
    case "amicable_pair":
      head = `❌ ${d.m} and ${d.n} are NOT an amicable pair. s(${d.m}) = ${d.sm} and s(${d.n}) = ${d.sn} — ${ce.reason}.`; break;
    case "perfect_number":
      head = `❌ ${d.n} is NOT perfect. s(${d.n}) = ${d.sn}, so ${d.n} is ${String(d.cls).toUpperCase()} (s(n) ${d.sn > d.n ? ">" : "<"} n).`; break;
    case "euclid_euler":
      head = `❌ Euclid's construction gives no perfect number at p = ${d.p}: ${ce.reason}.`; break;
    case "thabit_rule":
      head = `❌ Thabit's rule produces no pair at index n = ${d.index}: p = ${d.p}, q = ${d.q}, r = ${d.r} — ${ce.reason}. (Correct behaviour, not a failure of the amicable-pair concept.)`; break;
    case "aliquot_class":
      head = `❌ ${d.n} is NOT ${d.kind} — ${ce.reason.replace(/^s\(n\)/, `s(${d.n})`)}.`; break;
    default: head = "❌ The claim is false as stated.";
  }
  return head + NOTPROOF;
}

// ── Build-CM2 — deterministic honest narration for a classical-v2 check. Like renderClassicalClaim
// it is CODE-narrated (no LLM re-narration that could drift), and the 📚 citation is CODE-GUARANTEED
// when a real seed binds (the R4 lesson: a required verbatim line must be code-emitted, not
// prompt-hoped). matchFn injectable for tests. ──
function classicalV2VerificationState() { return "verified"; }   // decidable instance, NOT a general proof
const FIGURATE_LABEL = {
  hexagonal_triangular: "every hexagonal number H(n) = n(2n−1) equals the triangular number T(2n−1)",
  nicomachus_cubes: "the sum of the first n cubes equals the square of the n-th triangular number (Nicomachus's theorem): 1³ + 2³ + … + n³ = T(n)²",
  square_consecutive_triangular: "every square n² is the sum of two consecutive triangular numbers: n² = T(n−1) + T(n)",
};
function renderClassicalV2Claim(claim, result, matchFn) {
  const c = validateClaim(claim);
  if (!c || !CLASSICAL_V2_TEMPLATES.includes(c.template)) {
    return "That wasn't a well-formed classical figurate/Pell claim I could check, so I won't guess a result.";
  }
  const d = (result && result.detail) || {};
  const NOTPROOF = `\n\nThis is exact arithmetic, fully computed (not asserted from the theorem). It is not a general proof — the general theorem belongs to the cited literature — and it grants no mystical, "sacred-geometry" or cosmic significance, which would be a separate, non-mathematical claim with no promotion path.`;
  let head;
  if (result && result.holds) {
    if (c.template === "figurate_identity") {
      head = `✅ VERIFIED by direct computation for every n from 1 to ${Number(d.checkedTo).toLocaleString()}: ${FIGURATE_LABEL[d.kind]} — both sides were computed and matched at every n in the range.`;
    } else { // pell_fundamental
      head = `✅ VERIFIED: the fundamental (smallest) solution of x² − ${d.N}·y² = 1 is (x, y) = (${d.x}, ${d.y}), obtained from the continued-fraction expansion of √${d.N} (the solution appears at continued-fraction convergent #${d.cfTerms}). Direct computation confirms x² − ${d.N}·y² = ${d.lhs} exactly.`;
    }
    return head + classicalV2SeedMatchLine(c, matchFn) + NOTPROOF;
  }
  // Falsified / no-solution — honest, with the computed witness. No citation (nothing established held).
  const ce = (result && result.counterexample) || {};
  if (c.template === "figurate_identity") {
    head = `❌ The figurate identity FAILED at n = ${ce.n} (computed ${ce.lhs} ≠ ${ce.rhs}). (Should not happen for an established identity — recorded.)`;
  } else {
    head = `❌ No fundamental Pell solution was produced for N = ${(ce.N !== undefined ? ce.N : d.N)}: ${ce.reason}.`;
  }
  return head + NOTPROOF;
}

// ── Build-CM3 — deterministic honest narration for a classical-v3 (Pythagorean-triple) check. Like
// renderClassicalClaim/renderClassicalV2Claim it is CODE-narrated (no LLM re-narration that could
// drift), and the 📚 citation is CODE-GUARANTEED when a real seed binds. matchFn injectable. ──
function classicalV3VerificationState() { return "verified"; }   // decidable instance, NOT a general proof
function renderClassicalV3Claim(claim, result, matchFn) {
  const c = validateClaim(claim);
  if (!c || !CLASSICAL_V3_TEMPLATES.includes(c.template)) {
    return "That wasn't a well-formed Pythagorean-triple claim I could check, so I won't guess a result.";
  }
  const d = (result && result.detail) || {};
  const NOTPROOF = `\n\nThis is exact arithmetic, fully computed (not asserted from the theorem). It is not a general proof — the general result belongs to the cited literature — and it grants no mystical, "sacred-triangle" or cosmic significance, which would be a separate, non-mathematical claim with no promotion path.`;
  let head;
  if (result && result.holds) {
    switch (c.template) {
      case "pyth_triple":
        head = `✅ VERIFIED by direct computation: (${d.a}, ${d.b}, ${d.c}) is a PYTHAGOREAN TRIPLE — ${d.a}² + ${d.b}² = ${d.lhs} = ${d.c}² (computed exactly).`; break;
      case "pyth_primitive":
        head = `✅ VERIFIED: (${d.a}, ${d.b}, ${d.c}) is a PRIMITIVE Pythagorean triple — ${d.a}² + ${d.b}² = ${d.c}² and gcd(${d.a}, ${d.b}, ${d.c}) = 1 (no common factor), both confirmed by direct computation.`; break;
      case "euclid_triple":
        head = `✅ VERIFIED: Euclid's formula at m = ${d.m}, n = ${d.n} (coprime, opposite parity) constructs (a, b, c) = (${d.a}, ${d.b}, ${d.c}) — direct computation confirms ${d.a}² + ${d.b}² = ${d.c}² and gcd(${d.a}, ${d.b}, ${d.c}) = 1, so this is a PRIMITIVE Pythagorean triple.`; break;
      default: head = "✅ VERIFIED.";
    }
    return head + classicalV3SeedMatchLine(c, matchFn) + NOTPROOF;
  }
  // Falsified / not-primitive / preconditions unmet — honest, with the computed witness. No citation.
  const ce = (result && result.counterexample) || {};
  switch (c.template) {
    case "pyth_triple":
      head = `❌ (${d.a}, ${d.b}, ${d.c}) is NOT a Pythagorean triple — ${ce.reason}.`; break;
    case "pyth_primitive":
      head = `❌ (${d.a}, ${d.b}, ${d.c}) is NOT a primitive Pythagorean triple — ${ce.reason}.`; break;
    case "euclid_triple":
      head = `❌ Euclid's formula at m = ${d.m}, n = ${d.n} does NOT yield a primitive triple — ${ce.reason}. (Computed (a,b,c) = (${d.a}, ${d.b}, ${d.c}) either way.)`; break;
    default: head = "❌ The claim is false as stated.";
  }
  return head + NOTPROOF;
}

// Build-47 — narrate a multi-candidate run (best headline + honest ledger). A
// TRIVIAL headline is explicitly flagged as carrying no information — never
// dressed up as a finding (the M3 vacuity-floor doctrine).
function renderBestKernel(kernel, pkg) {
  const kl = (kernel && (kernel.label || kernel.content)) || "the kernel";
  if (!pkg || !pkg.best) {
    return `I tried to derive machine-checkable number-pattern claims from this kernel ("${String(kl).slice(0, 80)}") but couldn't form any valid one. Nothing tested — no result to report. (The kernel stays as classified; the speculative idea remains speculative.)`;
  }
  const base = renderKernelConjecture(kernel, pkg.best.claim, pkg.best.result);
  const ledger = `\n\nGeneration ledger: tried ${pkg.tried} candidate pattern(s) — ${pkg.held.length} held (${pkg.trivial.length} trivial/vacuous), ${pkg.falsified.length} falsified. The deterministic checker judged every one; none of these are proofs — evidence-to-N only.`;
  if (pkg.headlineClass === "trivial") {
    return base + `\n\n⚠ The held pattern above is TRIVIAL/vacuous — it held only because it was loose (a digital-root set wider than the roots actually observed, or a period that is a multiple of the real one), so it carries no real information. No non-trivial pattern survived among the ${pkg.tried} candidates.` + ledger;
  }
  return base + ledger;
}

// ── Chat detection + end-to-end orchestration ─────────────────────
// Trigger: an explicit ask to TEST/CHECK the established CORE of an idea. Kept
// tight so it never steals a normal research/ingest turn — requires a test verb
// AND the word "kernel"/"core"/"arithmetic"/"pattern" near it.
// Specific math-flavoured nouns: a test verb near one of these always fires.
const KERNEL_TEST_RE = /\b(?:test|check|verify|falsif(?:y|ies)|extract(?:\s+and\s+(?:test|check))?)\b[^?.!]{0,30}\b(?:kernel|established core|real (?:arithmetic|math|core)|number[- ]pattern|digital[- ]root|conjecture)\b/i;
// The broader nouns ("claim"/"pattern") only fire WITH a math signal in the
// message — so "check this claim" about an insurance/fleet matter never hijacks.
const CLAIM_VERB_RE = /\b(?:test|check|verify|falsif(?:y|ies))\b[^?.!]{0,30}\b(?:claim|pattern)\b/i;
const MATH_SIGNAL_RE = /\b(?:digital[- ]root|digit sum|modul[oa]r?\b|mod \d|2\s*\^|3n\b|\d+\s*\^\s*n|fibonacci|sequence|periodic|cycles?\b|vortex)\b/i;

// ── Build-CM1 — classical-math checker trigger. Fires ONLY on the unambiguous classical-
// number-theory vocabulary (amicable / perfect number / abundant|deficient number / aliquot /
// Thabit), OR a direct "is <N> perfect|abundant|deficient" / "are <A> and <B> amicable" phrasing.
// Kept tight so it never steals a fleet/wallet/general turn: the bare word "perfect" is EXCLUDED
// (it needs "perfect number(s)", or "is <digits> perfect").
const CLASSICAL_KEYWORD_RE  = /\b(?:amicable|perfect numbers?|abundant numbers?|deficient numbers?|aliquot|thabit|th[âa]bit)\b/i;
const CLASSICAL_DIRECT_RE   = /\bis\s+\d{1,15}\s+(?:an?\s+)?(?:perfect|abundant|deficient)\b/i;
const CLASSICAL_AMICABLE_RE = /\b(?:are|is)\s+\d{1,15}\s+and\s+\d{1,15}\s+amicable\b/i;
function detectClassicalMathTest(message) {
  const m = message || "";
  return CLASSICAL_KEYWORD_RE.test(m) || CLASSICAL_DIRECT_RE.test(m) || CLASSICAL_AMICABLE_RE.test(m);
}

// ── Build-CM2 — figurate/Pell checker trigger. Disjoint from the CM1 amicable/perfect vocabulary.
// Pell phrasings are unambiguous. FIGURATE fires on IDENTITY intent, and — crucially — NEVER steals
// a digital-root/vortex turn that merely mentions triangular/hexagonal numbers (those stay in the R3
// base-lens lane): if a digital-root/mod/vortex signal is present, the figurate branch stands down.
const FIG_HEX_RE    = /\bhexagonal numbers?\b[^?.!]{0,40}\btriangular\b|\bevery hexagonal number is triangular\b/i;
const FIG_CUBES_RE  = /\bsum of (?:the )?(?:first )?(?:n )?cubes\b|\bnicomachus'?s? theorem\b/i;
const FIG_SQUARE_RE = /\bsquares?\b[^?.!]{0,40}\b(?:sum of )?(?:two )?consecutive triangular\b|\bconsecutive triangular numbers?\b/i;
const FIG_NAME_RE   = /\bfigurate (?:number|identit)|\bnicomachus\b/i;
const PELL_KEYWORD_RE  = /\bpell(?:'s)?\b/i;
const PELL_EQUATION_RE = /x\s*\^?\s*2\s*[-−]\s*\d{1,4}\s*\*?\s*y\s*\^?\s*2\s*=\s*1/i;
const CF_SQRT_RE       = /\bcontinued fraction\b[^?.!]{0,40}\b(?:sqrt|square root|√)\b/i;
function detectClassicalMathV2Test(message) {
  const m = message || "";
  // Pell — unambiguous, never overlaps another lane.
  if (PELL_KEYWORD_RE.test(m) || PELL_EQUATION_RE.test(m) || CF_SQRT_RE.test(m)) return true;
  // Figurate — require identity intent, and never poach a digital-root/vortex turn (R3 owns those).
  if (MATH_SIGNAL_RE.test(m)) return false;
  return FIG_HEX_RE.test(m) || FIG_CUBES_RE.test(m) || FIG_SQUARE_RE.test(m) || FIG_NAME_RE.test(m);
}

// ── Build-CM3 — Pythagorean-triple checker trigger. Disjoint from the CM1 amicable/perfect and CM2
// figurate/Pell vocabularies. Fires ONLY on unambiguous Pythagorean-triple / Euclid's-formula
// phrasing — a bare mention of "3-4-5" or "triangle" (e.g. a mystical "is the 3-4-5 triangle
// sacred?" question) does NOT fire, mirroring the CM2 precedent: the honesty spine for a purely
// speculative/mystical question is the GENERAL kernel/leap decomposition path (Build-41/42),
// not this checker family — this lane only ever tests checkable arithmetic.
const PYTH_TRIPLE_KEYWORD_RE = /\bpythagorean\s+triples?\b/i;
const EUCLID_FORMULA_RE      = /\beuclid'?s?\s+formula\b/i;
const PRIMITIVE_TRIPLE_RE    = /\bprimitive\s+triples?\b/i;
function detectClassicalMathV3Test(message) {
  const m = message || "";
  return PYTH_TRIPLE_KEYWORD_RE.test(m) || EUCLID_FORMULA_RE.test(m) || PRIMITIVE_TRIPLE_RE.test(m);
}

function detectKernelTest(message) {
  const m = message || "";
  if (KERNEL_TEST_RE.test(m) || (CLAIM_VERB_RE.test(m) && MATH_SIGNAL_RE.test(m))) return true;
  // Build-CM1 — classical-number questions route through the SAME orchestrator hard-route (and
  // force the buffered path). Gated by the kill-switch so M8_CLASSICAL_MATH=off is byte-identical.
  if (classicalMathEnabled() && detectClassicalMathTest(m)) return true;
  // Build-CM2 — figurate/Pell questions route through the same hard-route. Gated so M8_CLASSICAL_MATH_V2=off is byte-identical.
  if (classicalMathV2Enabled() && detectClassicalMathV2Test(m)) return true;
  // Build-CM3 — Pythagorean-triple questions route through the same hard-route. Gated so M8_CLASSICAL_MATH_V3=off is byte-identical.
  if (classicalMathV3Enabled() && detectClassicalMathV3Test(m)) return true;
  return false;
}

/**
 * Build-CM1 — end-to-end classical-math check for a chat turn. A DIFFERENT lane from the
 * digital-root kernel flow: exact, decidable computation (amicable / perfect / Euclid-Euler /
 * Thabit / abundant-deficient) with a code-guaranteed citation. No DB writes. Fails safe.
 */
async function runClassicalMathTest(message) {
  try {
    const claim = await proposeClassicalClaim(message);
    if (!claim) {
      return `I can VERIFY exact classical-number facts by direct computation — whether two numbers are amicable, whether a number is perfect / abundant / deficient, the Euclid–Euler perfect-number construction, and Thabit ibn Qurra's amicable-pair rule. I couldn't turn that into one of those checkable questions, so I won't guess a result. (If you meant a number's broader or mystical significance, that's a separate, non-mathematical claim — I can't prove it, and it stays speculative.)`;
    }
    const result = evaluateClaim(claim);
    return renderClassicalClaim(claim, result);
  } catch (e) {
    console.error("[M8] runClassicalMathTest error (non-fatal):", e.message);
    return "I hit an error setting up the classical-number check and won't guess a result, Boss.";
  }
}

/**
 * Build-CM2 — end-to-end figurate/Pell check for a chat turn. Another exact, decidable lane (verify
 * a figurate identity over a range / find + verify the Pell fundamental solution), with a code-
 * guaranteed citation. No DB writes. Fails safe.
 */
async function runClassicalMathV2Test(message) {
  try {
    const claim = await proposeClassicalV2Claim(message);
    if (!claim) {
      return `I can VERIFY exact classical figurate-number identities (every hexagonal number is triangular; the sum of the first n cubes is a triangular number squared — Nicomachus's theorem; every square is the sum of two consecutive triangular numbers) and the fundamental solution of a Pell equation x² − N·y² = 1 (via the continued fraction of √N). I couldn't turn that into one of those checkable questions, so I won't guess a result. (If you meant a figurate number's mystical or "sacred-geometry" significance, that's a separate, non-mathematical claim — it stays speculative and I can't prove it.)`;
    }
    const result = evaluateClaim(claim);
    return renderClassicalV2Claim(claim, result);
  } catch (e) {
    console.error("[M8] runClassicalMathV2Test error (non-fatal):", e.message);
    return "I hit an error setting up the figurate/Pell check and won't guess a result, Boss.";
  }
}

/**
 * Build-CM3 — end-to-end Pythagorean-triple check for a chat turn. Another exact, decidable lane
 * (verify a given triple / check primitivity / run Euclid's formula and verify the result), with a
 * code-guaranteed citation. No DB writes. Fails safe.
 */
async function runClassicalMathV3Test(message) {
  try {
    const claim = await proposeClassicalV3Claim(message);
    if (!claim) {
      return `I can VERIFY exact Pythagorean-triple facts by direct computation — whether (a,b,c) satisfies a²+b²=c², whether it's a PRIMITIVE triple (gcd(a,b,c)=1), and whether Euclid's formula (a=m²−n², b=2mn, c=m²+n²) at a given m,n constructs a primitive triple. I couldn't turn that into one of those checkable questions, so I won't guess a result. (If you meant a triangle's broader or mystical/"sacred" significance, that's a separate, non-mathematical claim — I can't prove it, and it stays speculative.)`;
    }
    const result = evaluateClaim(claim);
    return renderClassicalV3Claim(claim, result);
  } catch (e) {
    console.error("[M8] runClassicalMathV3Test error (non-fatal):", e.message);
    return "I hit an error setting up the Pythagorean-triple check and won't guess a result, Boss.";
  }
}

/**
 * End-to-end Option-D flow for a chat turn (no DB writes; pure-LLM + deterministic
 * checking). Decompose the idea → kernel/leap (Build-42), propose a checkable claim
 * from the kernel, evaluate it exhaustively, narrate honestly. Returns a string.
 * Fails safe: any error → a short honest "couldn't run it" message (never throws).
 */
async function runKernelTest(message) {
  try {
    // Build-CM1 — a classical-number question (amicable / perfect / Euclid-Euler / Thabit /
    // abundant-deficient) takes precedence: a DIFFERENT, exact-computation lane from the
    // digital-root kernel flow below. Gated by the kill-switch (OFF ⇒ never dispatches here).
    if (classicalMathEnabled() && detectClassicalMathTest(message)) {
      return await runClassicalMathTest(message);
    }
    // Build-CM2 — a figurate-identity or Pell-equation question: another exact-computation lane
    // (verify a figurate identity over a range / find + verify the Pell fundamental solution). Gated
    // by its own kill-switch (OFF ⇒ never dispatches here). Disjoint from the CM1 vocabulary above.
    if (classicalMathV2Enabled() && detectClassicalMathV2Test(message)) {
      return await runClassicalMathV2Test(message);
    }
    // Build-CM3 — a Pythagorean-triple question: another exact-computation lane (verify a triple /
    // check primitivity / run Euclid's formula). Gated by its own kill-switch (OFF ⇒ never dispatches
    // here). Disjoint from the CM1 and CM2 vocabularies above.
    if (classicalMathV3Enabled() && detectClassicalMathV3Test(message)) {
      return await runClassicalMathV3Test(message);
    }
    const { proposeDecomposition } = require("./knowledge-intake");
    // Run the two proposals + the decomposition in parallel (all fail-safe → null).
    const [literal, dec] = await Promise.all([
      proposeLiteralClaim(message),
      proposeDecomposition("user idea", message).catch(() => null),
    ]);

    // ── Option B: test the user's LITERAL claim FIRST (so a false claim gets a
    //    counterexample instead of being quietly reframed into a true kernel). ──
    if (literal) {
      const litResult = evaluateClaim(literal);
      const litBlock = renderKernelConjecture({ label: "your stated claim" }, literal, litResult);
      // Speculative-leap note (if the idea carried a leap beyond the arithmetic).
      const leapNote = (dec && dec.leap) ? `\n\nNote: the broader idea ("${dec.leap.label}") stays SPECULATIVE either way — a number pattern holding tells us nothing about it.` : "";
      if (litResult.holds) return litBlock + leapNote + await leanLadderLine(literal, litResult);
      // FALSE literal claim → also offer the nearest TRUE pattern. Prefer the salvaged
      // kernel (richer — mined from the broader idea); else fall back to a pattern
      // derived from the user's OWN literal claim so a BARE false arithmetic claim is
      // ALWAYS offered a constructive "here's what IS true" (follow-up #1).
      let nearest = "", kClaim = null, kRes = null;
      if (dec && dec.kernel) {
        // Build-47: propose several kernel-derived patterns; only offer a TIGHT
        // (non-trivial) holding one as the "nearest true" — never a vacuous hold.
        const pkg = await bestKernelConjecture(dec.kernel);
        if (pkg.best && pkg.headlineClass === "tight" && pkg.best.result.holds) {
          kClaim = pkg.best.claim; kRes = pkg.best.result;
        }
      }
      if (!(kClaim && kRes && kRes.holds)) {
        const nt = nearestTrueFromLiteral(literal);
        if (nt) { kClaim = nt.claim; kRes = nt.result; }
      }
      if (kClaim && kRes && kRes.holds) {
        nearest = `\n\n🔎 Nearest TRUE pattern I could find: ${kClaim.label || `${kClaim.template}/${kClaim.generator}`} — OBSERVED by computation through n = ${kRes.checkedTo.toLocaleString()}` +
          (kRes.observedPeriod ? ` (period ${kRes.observedPeriod})` : "") + ` (still evidence-to-N, not proven).`;
      }
      return litBlock + nearest + leapNote;
    }

    // ── No literal claim expressible → fall back to the D path: salvage + test the
    //    established kernel of the idea (still never validates the speculative leap). ──
    if (!dec || !dec.kernel) {
      // E5 miss-mining fallback (gated by drProposerExamplesEnabled — the same switch as the
      // worked-examples fix, since both halves of the fix work together): a bare "test the
      // doubling digital-root claim" is a direct REFERENCE to an established kernel, not a
      // speculative IDEA with a kernel-and-a-leap — so knowledge-intake's proposeDecomposition
      // (a SEPARATE prompt, which requires BOTH parts) honestly returns null here; that null
      // does NOT mean no checkable claim exists. Before giving up, try the kernel-derived
      // proposer directly on the RAW MESSAGE as the "kernel" description — now that
      // buildProposeSystem/buildMultiProposeSystem carry a worked example teaching exactly this
      // terse-phrasing -> claim mapping, this is the fix's actual live path. Still fails safe to
      // the honest decline below if that also yields nothing.
      if (drProposerExamplesEnabled()) {
        const rawKernel = { label: message, content: message };
        const rawPkg = await bestKernelConjecture(rawKernel);
        if (rawPkg.best) return renderBestKernel(rawKernel, rawPkg) + await leanLadderLine(rawPkg.best.claim, rawPkg.best.result);
        // POST-DEPLOY FIX #3 — live self-verify showed the multi-candidate pass (temp=0.4, "vary
        // the template AND the generator" by design) can legitimately come back empty for a terse/
        // ambiguous raw-message kernel even on Groq — LLM sampling, not an error (no provider ever
        // threw; the model just didn't commit to an inference this particular call). Retry ONCE
        // with the deterministic (temp=0) single-candidate proposer before declining — cheap, and
        // far more likely to reproduce the worked example's exact pattern than a temp=0.4 sample.
        const singleClaim = await kernelToConjecture(rawKernel);
        if (singleClaim) {
          const singleResult = evaluateClaim(singleClaim);
          if (singleResult.holds) return renderKernelConjecture(rawKernel, singleClaim, singleResult) + await leanLadderLine(singleClaim, singleResult);
        }
      }
      return "I couldn't turn that into a machine-checkable number-pattern claim — and I couldn't isolate an established arithmetic kernel either. So there's nothing to test yet, and I won't invent a result. (The idea stays speculative.)";
    }
    const split = `Decomposition (honesty-gated):\n  • KERNEL (the established core): ${dec.kernel.label}\n  • LEAP (the speculative claim): ${dec.leap.label}  → stays SPECULATIVE; I only test the kernel.\n\n`;
    // Build-47: try several kernel-derived patterns and surface the most
    // informative non-trivial one (or an honest "all trivial/falsified").
    const pkg = await bestKernelConjecture(dec.kernel);
    return split + renderBestKernel(dec.kernel, pkg) + (pkg.best ? await leanLadderLine(pkg.best.claim, pkg.best.result) : "");
  } catch (e) {
    console.error("[M8] runKernelTest error (non-fatal):", e.message);
    return "I hit an error setting up the test and won't guess a result. Try rephrasing the idea, Boss.";
  }
}

// ── Build-R3 STRETCH — Lean-verify the digit-sum/mod-9 kernel (entry condition:
// Cloud Run m8-lean-check warm; SKIPS, never blocks, if cold). This proves the
// concrete two-digit building block under "n ≡ digitSum(n) (mod 9)" — 10a+b ≡ a+b
// (mod 9) — via Lean's omega tactic (which decides linear nat/int arithmetic with
// mod/div by literal constants). A type-checked Lean theorem is the FIRST
// machine-PROVEN result in this domain: verification_state 'proven', strictly
// apart from the 'empirical/observed-to-N' ceiling every other claim in this file
// carries. healthFn/checkFn are injectable (mirrors seedMatchLine's matchFn DI)
// so this is unit-testable without any network call.
const LEAN_DIGIT_SUM_MOD9_CODE =
  "theorem base10_two_digit_mod9 (a b : ℕ) : (10 * a + b) % 9 = (a + b) % 9 := by omega";

async function leanVerifyDigitSumMod9({ healthFn, checkFn } = {}) {
  const health = typeof healthFn === "function" ? healthFn : leanHealth;
  const check  = typeof checkFn  === "function" ? checkFn  : runLeanCheck;
  try {
    const h = await health({ timeoutMs: 8000 });
    if (!h || !h.ready) return { status: "lean_pending", reason: "checker cold — skipped, not attempted", code: LEAN_DIGIT_SUM_MOD9_CODE };
    const res = await check({ code: LEAN_DIGIT_SUM_MOD9_CODE });
    if (res && res.ok && res.data && res.data.verified) {
      return { status: "proven", theorem: LEAN_DIGIT_SUM_MOD9_CODE, data: res.data };
    }
    return { status: (res && res.status) || "lean_error", reason: (res && res.reason) || "not verified", data: res && res.data };
  } catch (e) {
    return { status: "lean_error", reason: String((e && e.message) || e).slice(0, 160) };
  }
}

// ── Build-R3 STRETCH WIRING — the honest three-tier ladder on a HELD base-10
// digital-root pattern (Path 1 of reports/M8_LEAN_FEASIBILITY_SPIKE.md §D). This is
// the PRODUCTION CALLER the R3 stretch function never had: when runKernelTest shows a
// HELD base-10 digital-root pattern (the ✅ OBSERVED-to-N block), the digit-sum/mod-9
// CONGRUENCE that makes every base-10 digital root well-defined is machine-provable —
// so append a PROVEN tier carrying Lean's real 0-sorry receipt, STRICTLY separated
// from the two weaker tiers already rendered:
//   • SPECULATIVE — any leap ("energy of the universe"): untouched (leapNote).
//   • OBSERVED-to-N — THIS specific pattern (period 6 to n=N): the ✅ block above.
//   • PROVEN — the mod-9 foundation ONLY, Lean-verified. NEVER claims the specific
//     pattern (period 6, the constant, the set) is proven — only the groundwork.
// Scope is honesty-tight: ONLY the three base-10 digital-root templates. mod_cycle
// (arbitrary modulus, not mod 9) and the dr_base_* family (base b ≠ 10 rests on
// mod (b-1), NOT mod 9) are EXCLUDED — the Lean theorem is 10·a+b, base-10 only.
// Fails safe: checker cold / unreachable / not-verified ⇒ an honest "machine-check
// pending" note, NEVER a fabricated proof or a "proven" claim without a real receipt.
// Kill-switch M8_LEAN_LADDER (default ON); OFF ⇒ returns "" ⇒ byte-identical to today.
// verifyFn is injectable (mirrors leanVerifyDigitSumMod9's DI) so it is unit-testable
// without any network call.
function leanLadderEnabled() {
  return String(process.env.M8_LEAN_LADDER || "on").toLowerCase() !== "off";
}
const LEAN_LADDER_TEMPLATES = ["dr_periodic", "dr_constant", "dr_set"];
function leanLadderEligible(claim, result) {
  return !!(result && result.holds && claim && LEAN_LADDER_TEMPLATES.includes(claim.template));
}
async function leanLadderLine(claim, result, { verifyFn, leanDeps } = {}) {
  try {
    if (!leanLadderEnabled()) return "";
    if (!leanLadderEligible(claim, result)) return "";
    const verify = typeof verifyFn === "function" ? verifyFn : leanVerifyDigitSumMod9;
    const r = await verify(leanDeps || {});
    if (r && r.status === "proven" && r.theorem) {
      return `\n\n⚡ PROVEN (Lean-verified): the base-10 digit-sum congruence 10·a + b ≡ a + b (mod 9) — the FOUNDATION that makes every base-10 digital root well-defined — is machine-checked (0 sorry, 0 errors) by Lean + Mathlib:\n    ${r.theorem}\nThat proves the GROUNDWORK, not the specific pattern above (period/constant/set stays OBSERVED-to-N). The honest ladder: the broader idea = SPECULATIVE, this pattern = OBSERVED-to-N, the mod-9 congruence beneath it = PROVEN.`;
    }
    // Cold / unreachable / not-verified ⇒ degrade honestly. NEVER claim proven.
    return `\n\n⏳ Machine-check pending: the Lean prover for the underlying mod-9 congruence is cold or unreachable this turn, so the PROVEN tier isn't available (it degrades to "pending" — never a fabricated proof). The pattern above stays OBSERVED-to-N; ask again once the checker is warm.`;
  } catch { return ""; }
}

module.exports = {
  // pure core (mirror-tested)
  modexp, genValueMod, digitalRootOfGen, validateClaim, evaluateClaim,
  minimalPeriod, observedDrPeriod, heldVerificationState, nearestTrueFromLiteral,
  TEMPLATES, GENERATORS,
  // Build-47 — multi-candidate generation + triviality floor
  parseClaims, proposeKernelCandidates, classifyHeld, observedRootSet,
  tightnessScore, bestKernelConjecture, renderBestKernel, MULTI_K,
  // llm + narration
  parseClaim, kernelToConjecture, proposeLiteralClaim, renderKernelConjecture,
  // Build-R2 — seed-pack citation wiring (inert until R3 binds matches_templates)
  seedCandidateFromClaim, seedMatchLine,
  // chat integration
  detectKernelTest, runKernelTest, KERNEL_TEST_RE,
  N_DEFAULT, N_MAX,
  // Build-R3 — base-b lens: kill-switch, whitelist gates, base-radix pure core,
  // new generators, prompt builders (for testing byte-identical OFF-identity)
  baseLensEnabled, BASE_TEMPLATES, BASE_GENERATORS, isTemplateAllowed, isGeneratorAllowed,
  digitalRootOfGenBase, observedDrPeriodBase, observedRootSetBase,
  buildProposeSystem, buildLiteralSystem, buildMultiProposeSystem,
  // E5 miss-mining follow-up — digital-root proposer worked-examples kill-switch (default ON)
  drProposerExamplesEnabled, DR_PROPOSER_WORKED_EXAMPLES_SINGLE, DR_PROPOSER_WORKED_EXAMPLES_MULTI,
  DR_PROPOSER_PROVIDER_ORDER,
  BASE_MIN, BASE_MAX, KGON_SIDES_MIN, KGON_SIDES_MAX, PRIMES_MOD_BOUND_MAX,
  nthPrime,
  // Build-R3 stretch — Lean-verify the digit-sum/mod-9 kernel (fails safe to lean_pending)
  leanVerifyDigitSumMod9, LEAN_DIGIT_SUM_MOD9_CODE,
  // Build-R3 stretch WIRING — the production caller: honest three-tier ladder on a held
  // base-10 digital-root pattern (kill-switch M8_LEAN_LADDER, default ON; DI-injectable).
  leanLadderEnabled, LEAN_LADDER_TEMPLATES, leanLadderEligible, leanLadderLine,
  // Build-CM1 — classical-math checker pack: kill-switch, pure core, whitelist, checker,
  // seed citations, proposer, narration, detection + orchestration.
  classicalMathEnabled, CLASSICAL_TEMPLATES,
  AMICABLE_MAX, PERFECT_MAX, EUCLID_EXP_MAX, THABIT_INDEX_MAX, CLASSICAL_INT_MAX,
  sumProperDivisors, isPrimeTrial, euclidPerfectForm, thabitTriple,
  validateClassicalClaim, evaluateClassicalClaim, classicalVerificationState,
  classicalPack, classicalSeedMatch, classicalSeedMatchLine,
  buildClassicalProposeSystem, proposeClassicalClaim, renderClassicalClaim,
  detectClassicalMathTest, runClassicalMathTest,
  // Build-CM2 — classical-math checker pack v2 (figurate identities + Pell/continued fractions):
  // kill-switch, pure core (BigInt for Pell), whitelist, checker, seed citations, proposer,
  // narration, detection + orchestration.
  classicalMathV2Enabled, CLASSICAL_V2_TEMPLATES, FIGURATE_KINDS,
  FIGURATE_N_MIN, FIGURATE_N_DEFAULT, FIGURATE_N_MAX, PELL_N_MIN, PELL_N_MAX, PELL_CF_MAX_LEN,
  triangularNum, hexagonalNum, checkFigurateIdentity, pellFundamental,
  validateClassicalV2Claim, evaluateClassicalV2Claim, classicalV2VerificationState,
  classicalV2Pack, classicalV2SeedMatch, classicalV2SeedMatchLine,
  buildClassicalV2ProposeSystem, proposeClassicalV2Claim, renderClassicalV2Claim,
  detectClassicalMathV2Test, runClassicalMathV2Test,
  // Build-CM3 — classical-math checker pack v3 (Pythagorean triples): kill-switch, pure core,
  // whitelist, checker, seed citations, proposer, narration, detection + orchestration.
  classicalMathV3Enabled, CLASSICAL_V3_TEMPLATES,
  TRIPLE_MAX, EUCLID_MN_MIN, EUCLID_MN_MAX,
  gcdInt, gcd3, euclidTriple,
  validateClassicalV3Claim, evaluateClassicalV3Claim, classicalV3VerificationState,
  classicalV3Pack, classicalV3SeedMatch, classicalV3SeedMatchLine,
  buildClassicalV3ProposeSystem, proposeClassicalV3Claim, renderClassicalV3Claim,
  detectClassicalMathV3Test, runClassicalMathV3Test,
};
