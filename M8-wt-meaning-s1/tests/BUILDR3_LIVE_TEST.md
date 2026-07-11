# Build-R3 — "Base-b lens" · LIVE TEST

Prod: **https://m8-alpha.vercel.app** · kill-switch **`M8_BASE_LENS`** (default ON — unset it,
never leave `off` set, unless this specific build needs to be rolled back at the env-var level).
Run AFTER the deploy is READY. Test-session rows are purged after.

> **Read this first — what R3 does and does NOT change at runtime.**
> R3 ships THREE things: (1) a `dr_base_periodic`/`dr_base_constant`/`dr_base_set` template family
> that runs the digital-root check in an ARBITRARY radix (mod radix-1) instead of the hardcoded
> base-10/mod-9 rule, plus two new whitelisted generators (`kgonal`, `primes_mod`); (2) **8 of the
> 16** `digital-root-v1` seeds now have real `matches_templates` bindings — R2 shipped this pack
> with every seed's binding EMPTY by design, and this build populates the ones that bind to
> templates/generators that **already existed before this build** (the doubling-orbit claim,
> squares/triangular/Fibonacci/Lucas period facts, the `{3,6,9}` non-units fact); the other 8
> (group-theoretic / two-variable / negative-result seeds) correctly stay unbound — no honest
> template exists for them. (3) an optional Lean-verify stretch for the two-digit mod-9 building
> block, which only runs if the Cloud Run checker happens to be warm.

---

## 0. Health
```
GET https://m8-alpha.vercel.app/api/health
```
Expect `ok`, providers + Supabase healthy, `sha` == the deployed commit.

## 1. THE VISIBLE PAYOFF — the doubling claim now carries a real citation
```
test the doubling digital-root claim
```
**Expect:** the existing "✅ OBSERVED by exhaustive computation through n = 10,000 (observed
minimal period 6) … never proven" narration, **now followed by a real 📚 line**:
*"📚 This matches KNOWN mathematics — The doubling orbit mod 9 is 1 -> 2 -> 4 -> 8 -> 7 -> 5 -> 1
(period 6) 〔OEIS A000079 (powers of 2) reduced mod 9; the multiplicative order of 2 mod 9 is 6…〕.
The general FORM is established (cited); the exhaustive bound above is machine-derived, not a
proof, and it does not upgrade the speculative idea."* This is `seedKnownMatch` firing for real —
R2's wiring was inert only because `matches_templates` was empty; it isn't anymore.

## 2. THE BASE-B EXPERIMENT — a different base gives a genuinely different cycle
```
test the claim that the digital root of 2^n in base 12 repeats with some period
```
**Expect:** the engine (or, if phrasing doesn't route the base-b claim, ask directly: *"what's the
period of the digital root of 2^n in base 12?"*) should observe **period 10** (not 6) — because
the multiplicative order of 2 mod 11 is 10, versus mod 9 is 6. Follow up in base 16 and expect
**period 4** (ord₁₅(2) = 4). No 📚 citation should appear on either base-b result (no seed in the
pack covers a non-base-10 result — Parts 1 and 2 of this build stay honestly independent).

## 3. Regression — the kernel/leap spine holds
```
did you prove the vortex idea?
```
**Expect:** **"No."** + the honest kernel/leap split, unchanged from R1/R2.

## 4. Regression canaries (no lane theft, no citation-lane spillover)
- `how are my drivers doing today` → **fleet** packet (no theft).
- `how much did I spend this week?` → **wallet** (no theft).
- Any existing R1 cited recall (`what does Tesla say about the sun's energy?`) → still renders
  the original `〔Nikola Tesla, The Problem of Increasing Human Energy (1900), …〕` citation.
- `Did Tesla write "if you only knew the magnificence of the 3, 6 and 9…"?` → still **"no primary
  source on file"**, zero fabricated citation (R2's `tesla-369-quote-unsourced` seed, untouched).

## 5. Offline gate (what proves R3 before deploy)
```
node tests/buildR3_baselens.test.js       # 67/67 — dr_base_* templates, kgonal/primes_mod generators,
                                           #         kill-switch OFF-identity (byte-identical prompts),
                                           #         the 8 new seed bindings resolving, Lean stretch DI
pwsh tests/buildR3_baselens.test.ps1      # PS-5.1 mirror, 26/26 — ALL GREEN (Node-free reimplementation)
node tests/buildR2_seedpack_wiring.test.js   # 51/51 — updated for the now-populated bindings (regression)
pwsh tests/buildR2_seedpack_wiring.test.ps1  # ALL GREEN (regression)
node tests/buildR1_cited_recall.test.js      # 74/74 — R1 unchanged (regression)
tests/kernel-conjecture-verify.ps1           # 33/33 — unchanged
tests/kernel-generators-verify.ps1           # 10/10 — unchanged
tests/kernel-leap-verify.ps1                 # 19/19 — unchanged
tests/m2-novelty-verify.ps1                  # 34/34 — unchanged
tests/multi-candidate-verify.ps1             # 22/22 — unchanged
tests/nearest-true-verify.ps1                # 9/9 — unchanged
```
Kill-switch identity: `M8_BASE_LENS=off` makes `validateClaim`/`evaluateClaim` reject every
`dr_base_*` template and the `kgonal`/`primes_mod` generators exactly as if they didn't exist, AND
makes the three LLM proposer prompts (`buildProposeSystem`/`buildLiteralSystem`/
`buildMultiProposeSystem`) return the **byte-identical pre-R3 text** (asserted against a literal
copy of the old string in `buildR3_baselens.test.js`) — proven offline, no deploy needed to check it.

## 6. Lean stretch (optional — only if Cloud Run `m8-lean-check` happens to be warm)
Entry condition: `GET <LEAN_CHECK_URL>/health` returns `ready:true`. If cold, this step is
**SKIPPED** — note that in the BUILD_LOG row, do not force a cold-start wait to make it pass.
If warm, `kc.leanVerifyDigitSumMod9()` submits
`theorem base10_two_digit_mod9 (a b : ℕ) : (10 * a + b) % 9 = (a + b) % 9 := by omega` and expects
`{ status: "proven" }` — the first machine-PROVEN theorem in this domain (strictly separate from
every other claim's "empirical/observed-to-N" ceiling in this module).

---
**Doctrine bar (all must hold):** an observed pattern is evidence-to-N, **never "proven"** (except
the Lean stretch, which is `verified`/type-checked, and even then narrated as proving only the
two-digit building block, not the general n-digit theorem) · the speculative leap **stays
speculative** · **never a fabricated citation** — a claim only carries 📚 when a REAL seed binds to
its EXACT template+generator (or discriminating slot) · a different base genuinely changes the
observed cycle, proving 9 is a base-10 artifact, not a universal constant.
