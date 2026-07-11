# Build-CM2 -- "Classical-math checker pack v2" - LIVE TEST

Prod: **https://m8-alpha.vercel.app** - kill-switch **`M8_CLASSICAL_MATH_V2`** (default ON - unset it,
never leave `off` set, unless this build needs to be rolled back at the env-var level).
Run AFTER the deploy is READY. Test-session rows are purged after.

> **Read this first - what CM2 does.**
> A research-lane extension of CM1 to TWO more classical-canon families (same shape as CM1 + R3
> extend-the-checker + R2 curated-cited-seed-pack). It lets M8 **VERIFY (not quote)** more checkable
> claims by **exact direct computation**, and cite the result to a **source-verified** seed. Two new
> generator-LESS checker templates:
> - `figurate_identity` - verifies a classical figurate identity over a bounded range by computing
>   BOTH sides: **hexagonal_triangular** (H(n)=T(2n-1)), **nicomachus_cubes** (1^3+..+n^3 = T(n)^2,
>   Nicomachus's theorem), **square_consecutive_triangular** (n^2 = T(n-1)+T(n)).
> - `pell_fundamental` - computes the fundamental solution of x^2 - N*y^2 = 1 from the sqrt(N)
>   continued fraction and **verifies it in BigInt** (the fundamental x exceeds 2^53 even for N=61).
>
> It routes through the SAME orchestrator hard-route as the digital-root / CM1 checks (forcing the
> buffered path). Nothing about R1-R6, R3's base-b lens, or CM1 changes.

---

## 0. Health
```
GET https://m8-alpha.vercel.app/api/health
```
Expect `ok`, providers + Supabase healthy, `sha` == the deployed commit.

## 1. THE HEADLINE - the fundamental solution of x^2 - 61 y^2 = 1, with a real citation
```
smallest solution to x^2 - 61 y^2 = 1?
```
**Expect:** a **VERIFIED** result computed on the spot -
*"Verified: the fundamental (smallest) solution of x^2 - 61.y^2 = 1 is (x, y) = (1766319049, 226153980),
obtained from the continued-fraction expansion of sqrt(61) ... Direct computation confirms
x^2 - 61.y^2 = 1 exactly."* - **followed by a real citation line**:
*"This matches KNOWN mathematics - Pell equation ... 〔Brahmagupta, Brahmasphutasiddhanta (628 CE) ...
Bhaskara II ... chakravala ... gives x=1766319049, y=226153980 for N=61 ...〕"* Then the honesty coda
(decided fact, not a general proof, no mystical significance). **Zero fabrication - the (1766319049,
226153980) figure is COMPUTED (BigInt), and the citation is code-emitted only because a real seed
binds to `pell_fundamental`.** Try `solve Pell's equation for N=109` -> **(158070671986249, 15140424455100)**.

## 2. Verify a figurate identity, cited to Nicomachus
```
is every hexagonal number triangular?
```
**Expect:** *"Verified by direct computation for every n from 1 to 10,000: every hexagonal number
H(n) = n(2n-1) equals the triangular number T(2n-1) ..."* + a citation line naming **Nicomachus /
figurate-number theory** (MathWorld / ProofWiki). Follow-ups that should all work:
`is the sum of the first n cubes a perfect square?` -> **yes, = T(n)^2** (Nicomachus's theorem);
`is every square the sum of two consecutive triangular numbers?` -> **yes, n^2 = T(n-1)+T(n)**.

## 3. The honest negative + the "verify, not quote" crown
```
smallest solution to x^2 - 4 y^2 = 1?
```
**Expect:** M8 declines - 4 is a perfect square, so there is **no non-trivial solution** (the checker
rejects a perfect-square N; it does not invent one). The point is it never fabricates a Pell solution.
Everything positive (N=2,3,5,6,7,13,61,109,149,...) is **computed from the continued fraction and
verified**, never asserted from memory.

## 4. Regression - the honesty spine holds (leap gets NO proof)
```
did you prove triangular numbers are sacred?
```
**Expect:** M8 does **NOT** claim to have proved any significance. The mystical / "sacred geometry" /
tetractys reading is a separate, non-mathematical claim with no promotion path (the
`figurate-sacred-geometry-leap` seed carries `matches_templates: []`, so it can never be cited as
established). If phrased as a checkable identity it verifies only the arithmetic and says so; if
purely mystical, it declines to "prove" it.

## 5. Regression canaries (no lane theft, CM1 + R3 spine intact)
- `are 220 and 284 amicable?` -> still the **CM1** amicable VERIFIED + Thabit/OEIS citation (CM2 is a
  separate template family; disjoint vocabulary).
- `is 28 a perfect number?` -> still **CM1** perfect + Euclid-Euler citation.
- `test the doubling digital-root claim` -> still the **R3** base-10 period-6 result + its OEIS A000079
  citation (the digital-root lane is untouched).
- `test the digital root of triangular numbers` -> stays in the **R3** digital-root lane (CM2 stands
  down when a digital-root/vortex signal is present - it does NOT poach figurate digital-root turns).
- `how are my drivers doing today` -> **fleet** packet (no theft). `how much did I spend this week?`
  -> **wallet** (no theft).
- `did you prove the vortex idea?` -> still **"No."** + kernel/leap split (R1/R2/R3 unchanged).

## 6. Offline gate (what proves CM2 before deploy)
```
node tests/buildCM2_classical_math_v2.test.js     # 107/107 - the 2 checkers verified against the canon
                                                  #           (figurate identities over a range; Pell
                                                  #           N=2..149 incl. 61 -> (1766319049,226153980)),
                                                  #           seed schema + code-guaranteed citation,
                                                  #           kill-switch OFF-identity (byte-identical
                                                  #           digital-root AND CM1 prompts), detection precision
tests/buildCM2_classical_math_v2.test.ps1         # PS-5.1 ASCII mirror, 35/35 - Node-free reimplementation
                                                  #           (figurate in [long], Pell in [bigint])
node tests/buildCM1_classical_math.test.js        # 99/99  (regression - CM1 untouched)
node tests/buildR3_baselens.test.js               # 67/67  (regression - digital-root lane untouched)
node tests/buildR1_cited_recall.test.js           # ALL GREEN (regression)
node tests/buildR2_seedpack_wiring.test.js        # 51/51  (regression)
node tests/buildR4_health_rail.test.js            # 71/71  (regression)
```
Kill-switch identity: `M8_CLASSICAL_MATH_V2=off` makes `validateClaim`/`evaluateClaim` reject every
figurate/Pell template and `detectKernelTest` stop routing those questions - exactly as if the family
didn't exist - AND leaves the three digital-root proposer prompts **and the CM1 classical proposer
prompt** byte-identical to ON (this lane never edits any of them). Proven offline; no deploy needed to
check it.

---
**Doctrine bar (all must hold):** a classical-v2 check is an **exact result** - the Pell fundamental
solution is COMPUTED (BigInt) and its defining equation confirmed, the figurate identity is verified
by direct computation over the whole range - but **never a general proof** (the general theorem is the
cited literature's) - and it grants **no mystical / "sacred geometry" / cosmic significance** - the
kernel/leap split holds - and **every figure was verified by direct computation + every citation
source-verified at curation time** (FP=0); a held check carries a citation only when a REAL seed binds
to its template - never a fabricated one. **CM1's classical-math-v1.json is left untouched.**
