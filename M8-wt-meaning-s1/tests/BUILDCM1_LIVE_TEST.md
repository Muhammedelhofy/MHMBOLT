# Build-CM1 -- "Classical-math checker pack" - LIVE TEST

Prod: **https://m8-alpha.vercel.app** - kill-switch **`M8_CLASSICAL_MATH`** (default ON - unset it,
never leave `off` set, unless this build needs to be rolled back at the env-var level).
Run AFTER the deploy is READY. Test-session rows are purged after.

> **Read this first - what CM1 does.**
> A research-lane extension BEYOND the R1-R6 blueprint (same shape as R3 extend-the-checker + R2
> curated-cited-seed-pack). It lets M8 **VERIFY (not quote)** checkable claims from the classical
> math canon by **exact direct computation** (sum-of-proper-divisors + trial-division primality),
> and cite the result to a **source-verified** seed. Five new generator-LESS checker templates:
> `amicable_pair`, `perfect_number`, `euclid_euler`, `thabit_rule`, `aliquot_class`. It routes
> through the SAME orchestrator hard-route as the digital-root kernel test (so it forces the
> buffered path and preempts the discovery lane). Nothing about R1-R4 or R3's base-b lens changes.

---

## 0. Health
```
GET https://m8-alpha.vercel.app/api/health
```
Expect `ok`, providers + Supabase healthy, `sha` == the deployed commit.

## 1. THE HEADLINE - verify an amicable pair, with a real citation
```
are 220 and 284 amicable?
```
**Expect:** a **VERIFIED** result computed on the spot -
*"✅ VERIFIED by direct computation: 220 and 284 are an AMICABLE PAIR - s(220) = 284 and s(284) = 220
(each equals the sum of the other's proper divisors)."* - **followed by a real 📚 line**:
*"📚 This matches KNOWN mathematics - Amicable numbers ... 〔... studied by Thabit ibn Qurra (836-901 CE)
... OEIS A063990 ...〕. The general theorem is the cited literature's; the check above is an exact,
direct computation of THIS instance - not a new proof ..."* Then the honesty coda (decided fact, not a
general proof, no mystical significance). **Zero fabrication - the citation is code-emitted only because
a real seed binds to `amicable_pair`.**

## 2. Verify a perfect number, cited to Euclid-Euler
```
is 28 a perfect number?
```
**Expect:** *"✅ VERIFIED: 28 is a PERFECT NUMBER - the sum of its proper divisors s(28) = 28 equals 28
itself."* + a 📚 line citing **Euclid, Elements IX.36** + **Euler (1747)** (the Euclid-Euler theorem).
Follow-ups that should all work: `is 12 perfect?` -> **NO, it's ABUNDANT** (s=16), no citation;
`is 6 perfect?` -> yes; `does 2^13-1 give a perfect number?` -> **yes, 33550336** (euclid_euler p=13).

## 3. Verify Thabit ibn Qurra's rule (the "verify, not quote" crown)
```
check Thabit's rule for n=2
```
**Expect:** M8 computes p=5, q=11, r=71 (all prime), builds 220 and 284, and **confirms they are
amicable by direct computation** - not asserted from the theorem. Cited to Thabit's *Book on the
Determination of Amicable Numbers*. Try `check Thabit's rule for n=3` -> **NO pair** (r = 287 = 7x41 is
composite; the rule needs p, q, r all prime) - the honest negative, not a failure.

## 4. Regression - the honesty spine holds (leap gets NO proof)
```
did you prove 6 is divinely perfect?
```
**Expect:** M8 does **NOT** claim to have proved any significance. The mystical/theological "perfection"
reading is a separate, non-mathematical claim with no promotion path (the `perfect-number-significance-leap`
seed carries `matches_templates: []`, so it can never be cited as established). If phrased as a checkable
question it verifies only the arithmetic and says so; if purely mystical, it declines to "prove" it.

## 5. Regression canaries (no lane theft, R3 spine intact)
- `how are my drivers doing today` -> **fleet** packet (no theft; "perfect"/"amicable" absent).
- `how much did I spend this week?` -> **wallet** (no theft).
- `test the doubling digital-root claim` -> still the **R3** base-10 period-6 result + its OEIS A000079
  citation (the digital-root lane is untouched - CM1 is a separate template family).
- `did you prove the vortex idea?` -> still **"No."** + kernel/leap split (R1/R2/R3 unchanged).

## 6. Offline gate (what proves CM1 before deploy)
```
node tests/buildCM1_classical_math.test.js     # 99/99 - the 5 checkers verified against the canon
                                                #         (220/284, 6/28/496/8128, Euclid-Euler p=2..19,
                                                #         Thabit n=2/4/7), seed schema + code-guaranteed
                                                #         citation, kill-switch OFF-identity (byte-identical
                                                #         digital-root prompts), detection precision
tests/buildCM1_classical_math.test.ps1         # PS-5.1 ASCII mirror, 47/47 - Node-free reimplementation
node tests/buildR1_cited_recall.test.js        # ALL GREEN (regression)
node tests/buildR2_seedpack_wiring.test.js     # 51/51 (regression)
node tests/buildR3_baselens.test.js            # 67/67 (regression - digital-root lane untouched)
node tests/buildR4_health_rail.test.js         # 71/71 (regression)
tests/kernel-conjecture-verify.ps1             # 33/33 - unchanged
tests/kernel-generators-verify.ps1             # 10/10 - unchanged
tests/kernel-leap-verify.ps1                   # 19/19 - unchanged
tests/multi-candidate-verify.ps1               # 22/22 - unchanged
tests/nearest-true-verify.ps1                  # 9/9  - unchanged
```
Kill-switch identity: `M8_CLASSICAL_MATH=off` makes `validateClaim`/`evaluateClaim` reject every classical
template and `detectKernelTest` stop routing classical questions - exactly as if the family didn't exist -
AND leaves the three digital-root proposer prompts **byte-identical** to ON (this lane never edits them).
Proven offline; no deploy needed to check it.

---
**Doctrine bar (all must hold):** a classical check is an **exact DECIDED fact** for the specific instance
(fully computed, stronger than "observed-to-N") but **never a general proof** - the general theorem is the
cited literature's - and it grants **no mystical/cosmic significance** - the kernel/leap split holds - and
**every figure was verified by direct computation + every citation source-verified at curation time**
(FP=0); a held check carries 📚 only when a REAL seed binds to its template - never a fabricated one.
