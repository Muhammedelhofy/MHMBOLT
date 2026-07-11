# Build-CM3 -- "Classical-math checker pack v3" - LIVE TEST

Prod: **https://m8-alpha.vercel.app** - kill-switch **`M8_CLASSICAL_MATH_V3`** (default ON - unset it,
never leave `off` set, unless this build needs to be rolled back at the env-var level).
Run AFTER the deploy is READY. Test-session rows are purged after.

> **Read this first - what CM3 does.**
> A research-lane extension of CM1/CM2 to Pythagorean triples (same shape as CM1 + CM2 + R3 extend-
> the-checker + R2 curated-cited-seed-pack). It lets M8 **VERIFY (not quote)** more checkable
> claims by **exact direct computation** (no BigInt needed -- every value stays under 2^53), and
> cite the result to a **source-verified** seed. Three new generator-LESS checker templates:
> - `pyth_triple` - verifies whether a given (a,b,c) satisfies a^2+b^2=c^2 by direct computation.
> - `pyth_primitive` - verifies whether (a,b,c) is a PRIMITIVE Pythagorean triple (a^2+b^2=c^2 AND
>   gcd(a,b,c)=1).
> - `euclid_triple` - computes Euclid's formula (a=m^2-n^2, b=2mn, c=m^2+n^2) at a given m,n and
>   verifies whether it produces a primitive triple (checking m>n>0, coprime, opposite parity, and
>   the resulting gcd).
>
> It routes through the SAME orchestrator hard-route as the digital-root / CM1 / CM2 checks (forcing
> the buffered path). Nothing about R1-R6, R3's base-b lens, CM1, or CM2 changes.

---

## 0. Health
```
GET https://m8-alpha.vercel.app/api/health
```
Expect `ok`, providers + Supabase healthy, `sha` == the deployed commit.

## 1. THE HEADLINE - a Pythagorean triple check, with a real citation
```
is (3,4,5) a Pythagorean triple?
```
**Expect:** a **VERIFIED** result computed on the spot -
*"Verified by direct computation: (3, 4, 5) is a PYTHAGOREAN TRIPLE - 3^2 + 4^2 = 25 = 5^2 (computed
exactly)."* - **followed by a real citation line**: *"This matches KNOWN mathematics - Pythagorean
triple: a^2+b^2=c^2 ... 〔Euclid (fl. 300 BCE), Elements, Book I, Proposition 47 ...〕"* Then the
honesty coda (decided fact, not a general proof, no mystical significance). Try
`is 6,8,10 a primitive Pythagorean triple?` -> **NOT primitive** (gcd=2), no citation on a false
result.

## 2. Primitivity + Euclid's formula, cited to Book X
```
generate a primitive triple from m=2, n=1
```
**Expect:** *"Verified: Euclid's formula at m = 2, n = 1 (coprime, opposite parity) constructs
(a, b, c) = (3, 4, 5) - direct computation confirms 3^2 + 4^2 = 5^2 and gcd(3, 4, 5) = 1, so this is
a PRIMITIVE Pythagorean triple."* + a citation line naming **Euclid's Elements, Book X, Lemma 1**.
Follow-ups that should all work: `is 20,21,29 primitive?` -> **yes**; `is 9,12,15 a primitive
Pythagorean triple?` -> **no** (gcd=3, it's 3x(3,4,5)).

## 3. The honest negative - Euclid's formula without the preconditions
```
does Euclid's formula give a primitive triple for m=4, n=2?
```
**Expect:** M8 declines the "primitive" claim - m=4, n=2 are NOT coprime (both even), so the
construction (12, 16, 20) is a valid Pythagorean triple but **NOT primitive** (gcd=4; it's 4x(3,4,5)).
The point is it never asserts primitivity without checking the preconditions. Everything positive
(coprime + opposite parity) is **computed and verified**, never assumed.

## 4. Regression - the honesty spine holds (leap gets NO proof)
```
did you prove the 3-4-5 triangle is sacred?
```
**Expect:** M8 does **NOT** claim to have proved any significance. The Plutarch/Osiris-Isis-Horus
"sacred triangle" reading is a separate, non-mathematical claim with no promotion path (the
`pythagorean-sacred-triangle-leap` seed carries `matches_templates: []`, so it can never be cited as
established). If phrased as a checkable identity it verifies only the arithmetic and says so; if
purely mystical, it declines to "prove" it. (This routes through the GENERAL kernel/leap honesty
spine, not the CM3 detector -- mirrors the CM2 precedent: `is the 3-4-5 triangle sacred?` does not
fire `detectClassicalMathV3Test` either, by design.)

## 5. Regression canaries (no lane theft, CM1 + CM2 + R3 spine intact)
- `are 220 and 284 amicable?` -> still the **CM1** amicable VERIFIED + Thabit/OEIS citation (CM3 is a
  separate template family; disjoint vocabulary).
- `is every hexagonal number triangular?` -> still **CM2** figurate VERIFIED + Nicomachus citation.
- `smallest solution to x^2 - 61 y^2 = 1?` -> still **CM2** Pell VERIFIED + Brahmagupta/Bhaskara
  citation.
- `test the doubling digital-root claim` -> still the **R3** base-10 period-6 result + its OEIS
  A000079 citation (the digital-root lane is untouched).
- `how are my drivers doing today` -> **fleet** packet (no theft). `how much did I spend this week?`
  -> **wallet** (no theft).
- `did you prove the vortex idea?` -> still **"No."** + kernel/leap split (R1/R2/R3 unchanged).

## 6. Offline gate (what proves CM3 before deploy)
```
node tests/buildCM3_classical_math_v3.test.js     # 122/122 - the 3 checkers verified against the
                                                  #           canon (3-4-5, 5-12-13, 8-15-17, 20-21-29
                                                  #           primitive; 6-8-10, 9-12-15 correctly NOT
                                                  #           primitive; Euclid generator for several
                                                  #           m,n incl. a non-coprime m=4,n=2 case),
                                                  #           seed schema + code-guaranteed citation,
                                                  #           kill-switch OFF-identity (byte-identical
                                                  #           digital-root/CM1/CM2 prompts), detection precision
tests/buildCM3_classical_math_v3.test.ps1         # PS-5.1 ASCII mirror, 64/64 - Node-free reimplementation
                                                  #           (every value exact in [long], no [bigint] needed)
node tests/buildCM2_classical_math_v2.test.js     # 107/107 (regression - CM2 untouched)
node tests/buildCM1_classical_math.test.js        # 99/99  (regression - CM1 untouched)
node tests/buildR3_baselens.test.js               # 67/67  (regression - digital-root lane untouched)
node tests/buildR3_lean_ladder.test.js            # 35/35  (regression - Lean ladder untouched)
node tests/buildE5_dr_proposer_examples.test.js   # 33/33  (regression - proposer worked-examples untouched)
node tests/buildR1_cited_recall.test.js           # ALL GREEN (regression)
node tests/buildR2_seedpack_wiring.test.js        # 51/51  (regression)
node tests/buildR4_health_rail.test.js            # 71/71  (regression)
```
Kill-switch identity: `M8_CLASSICAL_MATH_V3=off` makes `validateClaim`/`evaluateClaim` reject every
Pythagorean-triple template and `detectKernelTest` stop routing those questions - exactly as if the
family didn't exist - AND leaves the three digital-root proposer prompts **and the CM1 + CM2
classical proposer prompts** byte-identical to ON (this lane never edits any of them). Proven
offline; no deploy needed to check it.

---
**Doctrine bar (all must hold):** a classical-v3 check is an **exact result** - a^2+b^2=c^2 and
gcd(a,b,c) are COMPUTED directly for the specific instance given - but **never a general proof** (the
general theorem is Euclid's, cited literature) - and it grants **no mystical / "sacred triangle" /
cosmic significance** - the kernel/leap split holds - and **every figure was verified by direct
computation + every citation source-verified at curation time** (FP=0); a held check carries a
citation only when a REAL seed binds to its template - never a fabricated one. **CM1's
classical-math-v1.json and CM2's classical-math-v2.json are both left untouched.**
