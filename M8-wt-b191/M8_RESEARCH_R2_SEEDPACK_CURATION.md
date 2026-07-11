# M8 Research Lane — Build-R2 Curation Report

**Seed pack:** `digital-root-v1` (digital roots / mod-9 / "vortex math" / 3-6-9)
**Model / effort:** Opus 4.8 · Medium
**Curated:** 2026-07-04
**Deliverable:** `M8/data/seed-packs/digital-root-v1.json` — 16 seeds, same schema as `collatz-v1`
**Scope of this session:** curation + JSON data file ONLY. No narration wiring (deferred to post-R1 / R3). No DB writes, no deploy.

---

## What a seed pack is (one line)

A curated set of **known results, each verified at curation time**, so M8 can honestly say *"this matches known mathematics (cited)"* vs *"this is novel / unsourced"* — never *"already proven"*, never silently novel. Negative seeds record the **absence** of a source so M8 can cite *"no primary source on file."*

## The honesty axis this pack adds — `kernel_leap`

The vortex / 3-6-9 space is where a research assistant most easily lies by accident. So every seed carries a `kernel_leap` tag — the product, in one field:

| Tag | Meaning | M8 may say |
|---|---|---|
| **kernel** | a checkable arithmetic fact (mod-9 group theory) | **established (cited)** |
| **leap** | a speculative interpretation, no promotion path | **speculative** — never established/proven |
| **unsourced** | a claim with no primary source on file | **no primary source on file** (cited to the absence) |

The Rodin material is deliberately **split**: the doubling-circuit arithmetic is a `kernel` seed (established); the "energy of the universe" claim is a `leap` seed (speculative). Same author, two rows, opposite verdicts. That split *is* the deliverable.

---

## The 16 seeds

### Established arithmetic — `kernel` (14)

| # | id | Claim | Citation | Verification note |
|---|---|---|---|---|
| 1 | `dr-equals-n-mod-9` | dr(n) = 1+((n−1) mod 9); = n mod 9, but 9 for nonzero multiples of 9 | MathWorld *Digital Root*; OEIS **A010888** | OEIS def confirmed verbatim; proved from 10≡1 (mod 9); py-checked n=1..999 all True |
| 2 | `digit-sum-congruence-mod-9` | n ≡ digit-sum(n) (mod 9), because 10^k≡1 | Hardy & Wright (2008); MathWorld *Casting Out Nines* | Standard; the reason the modulus is 9 = 10−1, not mysticism |
| 3 | `casting-out-nines-homomorphism` | dr(a·b)=dr(dr a·dr b), dr(a+b)=dr(dr a+dr b) | MathWorld *Casting Out Nines* | Ring homomorphism Z→Z/9Z; honest limit noted (misses multiple-of-9 errors) |
| 4 | `digital-root-period-9` | dr sequence 1..9,1..9,… has period exactly 9 | OEIS **A010888** comment | Comment confirmed verbatim; corollary of #1 |
| 5 | `doubling-orbit-124875` | doubling mod 9: **1→2→4→8→7→5→1**, period 6; 3,6,9 never appear | OEIS **A000079** mod 9; ord₉(2)=6 (MathWorld) | py-computed 2^k mod 9 = [1,2,4,8,7,5,…]; order of 2 mod 9 = 6 |
| 6 | `units-mod-9-cyclic-order-6` | (Z/9Z)\* cyclic of order φ(9)=6; primitive roots {2,5} | Gauss, *Disquisitiones* (1801); MathWorld | py-computed units {1,2,4,5,7,8}, orders {1:1,8:2,4:3,7:3,2:6,5:6} |
| 7 | `threes-and-sixes-doubling` | doubling swaps 3↔6 (2-cycle), fixes 9; {3,6,9} closed | elementary mod-9 arithmetic | py: 3→6, 6→3, 9→0(≡9) |
| 8 | `three-six-nine-are-the-non-units` | 3,6,9 = exactly the digital roots **not coprime to 9** (the ideal 3Z/9Z) | elementary (Hardy & Wright) | gcd(k,9)>1 iff 3∣k → {3,6,9}; 3·x∈{3,6,9} ∀x |
| 9 | `squares-digital-root-period-9` | dr(n²) = 1,4,9,7,7,9,4,1,9 (period 9); values in {1,4,7,9} | QR mod 9 = {0,1,4,7} (standard) | py-computed dr(n²) n=1..19; QR set = {0,1,4,7} |
| 10 | `fibonacci-pisano-period-9` | Fibonacci mod 9 has Pisano period **π(9)=24** | OEIS **A001175** a(9)=24; MathWorld *Pisano Period* | py-computed π(9)=24; matches OEIS term (web-confirmed) |
| 11 | `fibonacci-digital-root-period-24` | dr(Fₙ) 24-cycle; positions 12 & 24 are 9, other pairs (k,k+12) sum to 9 | OEIS **A030132** | py: first 24 terms match A030132 verbatim; terms 25–48 identical; 9-complement checked |
| 12 | `lucas-mod-9-period-24` | Lucas mod 9 also period 24 (period divides π(m)) | Pisano theory; OEIS A001175 | py-computed Lucas period mod 9 = 24 — the 24-cycle isn't unique to Fibonacci |
| 13 | `triangular-digital-root-period-9` | dr(Tₙ) = 1,3,6,1,6,3,1,9,9 (period 9) | OEIS **A000217**; T₍ₙ₊₉₎−Tₙ = 9(n+5) | py-computed n=1..19; identity proved (difference divisible by 9) |
| 14 | `rodin-doubling-kernel-classical` | Rodin's doubling circuit KERNEL = orbit of ×2 on Z/9Z | Rodin, *Vortex-Based Mathematics* (c.2010) for the diagram; arithmetic is standard | kernel proved (via #5, #7); Rodin authorship of the diagram web-confirmed; **arithmetic only** |

### The honesty seeds — the whole point (2)

| # | id | `kernel_leap` | Claim | Verification of the ABSENCE |
|---|---|---|---|---|
| 15 | `tesla-369-quote-unsourced` | **unsourced** | *"If you only knew the magnificence of the 3, 6 and 9…"* attributed to Tesla | **No primary source.** Wikiquote lists it under *Misattributed*; All That's Interesting traces earliest trace to ~2013 and to a 1990s Dale Pond book about **John Keely**, not Tesla. Not in Tesla's writings/patents/correspondence/biographies. → M8 says *"no primary source on file"*, never a fabricated citation. |
| 16 | `rodin-vortex-energy-leap` | **leap** | vortex math "encodes the energy of the universe" / free-energy Rodin coil / "fingerprint of God" | **Speculative, no peer-reviewed support.** *Zombie Math in the Vortex* (Good Math/Bad Math, 2018): *"there's really no math to it beyond the observation that there's a pattern."* Kernel (#14) is real; this leap has **no promotion path**. → M8 labels it speculative, never proven/established. |

---

## Curation discipline applied (non-negotiables)

- **Every computational figure checked by direct Python computation** — the doubling orbit, multiplicative orders mod 9, Pisano period π(9)=24, Lucas period, the square/triangular digital-root cycles, and the Fibonacci digital-root 24-cycle (matched to OEIS A030132 term-for-term).
- **Every external identifier resolved, not asserted from memory** — A010888, A001175 (a(9)=24), A030132, A000079, A000217, plus the MathWorld pages, were confirmed by web check. Where I could not verify a specific OEIS A-number for a fact (e.g. digital-root-of-squares), I cite the **provable underlying fact** (quadratic residues mod 9 = {0,1,4,7}) rather than invent a number — a made-up citation is the research-lane equivalent of an invented fleet number.
- **Kernel vs leap separated explicitly** for the Rodin material: two seeds, opposite verdicts, cross-linked.
- **Negative seeds prove an absence**, with the reputable sources that establish the absence recorded in the verification note.

## Deliberate gap: `matches_templates` is empty on every seed

In `collatz-v1`, `matches_templates` binds a seed to an **M3 generator template** so the deterministic novelty gate can fire. The digital-root / vortex **generator whitelist ships in R3** (per blueprint §3). Binding a seed now to a template name that no generator emits yet would be the template-space version of an invented figure — so every `matches_templates` is `[]`, and **R3 populates them** when the real generators exist. This is intentional and documented in the pack's `schema_note`.

## What this unlocks

- **R1 win-3 (the Tesla question).** *"Did Tesla write 'if you only knew the magnificence of the 3, 6 and 9…'?"* → **"No primary source on file"**, cited to seed 15's recorded absence — never a fabricated citation.
- **The kernel/leap regression.** *"Did you prove the vortex idea?"* → **"No."** + what IS established (seed 14, the mod-9 doubling kernel) vs what stays speculative (seed 16, the energy leap). The upgrade-pressure spine holds because the pack itself carries the split.
- **A curated backstop for R3's base-b generators.** When R3 runs vortex/digital-root conjectures exhaustively to N, the novelty gate can say *"this matches known mathematics (form cited)"* for the 14 kernel facts instead of dressing them up as discoveries — exactly the role `collatz-v1` plays for the Collatz generators.
- **His domain, honestly.** The 3-6-9 space he cares about now has a source-verified spine: the arithmetic is granted its due (established, cited), and the mysticism is named as such (speculative / unsourced) — no lie in either direction.

## Verification artifact

`M8/tests/digital-root-seedpack.schema.test.js` — self-contained (re-implements `collatz-v1`'s `validateSeed`/`validatePack` so it runs green without the unpushed `lib/seed-pack.js`). Result:

```
PASS — digital-root-v1: 16 seeds valid (14 kernel, 1 leap, 1 unsourced; 2 negative).
```

When merged alongside `lib/seed-pack.js`, the production `validatePack()` accepts it 1:1 (the extra `kernel_leap` field is ignored by `validateSeed` and passed through unchanged by `seedToNode`'s metadata).
