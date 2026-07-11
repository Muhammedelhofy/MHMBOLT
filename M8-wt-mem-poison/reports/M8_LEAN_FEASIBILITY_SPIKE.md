# M8 Lean / L5 Feasibility Spike — can we reach a first machine-proven theorem in Muhammad's domain?

**Session:** Fable · High · 2026-07-06 · READ-ONLY spike (no build, no deploy, no live-engine change)
**Deliverable for:** the parallel NORTH_STAR strategy session (input to the "does research become M8's center of gravity?" call)
**Worktree:** `M8-wt-lean-spike` off `origin/main` (`c30232a`) — this report is the only file added.

---

## ⚡ THE VERDICT FIRST

**YES — a first live, end-to-end machine-checked theorem in Muhammad's own domain (digital roots / mod-9) is reachable THIS WEEK, at near-zero cost, with zero deploys.** The spike found the Lean stack is in *better* shape than the blueprint implies, not worse:

| Question | Answer | Evidence |
|---|---|---|
| Is `lean-check/` real or a stub? | **Real, deployed, and still healthy today** | `gcloud run services describe m8-lean-check` (this spike, 2026-07-06) → `https://m8-lean-check-vbhba5tbgq-ue.a.run.app`, status **True**, 8 GiB, last modified by mohd.hofy@gmail.com |
| Can prod reach it? | **Yes** — `LEAN_CHECK_URL` + `LEAN_CHECK_TOKEN` are set in Vercel prod | `reports/build-177-env-audit.md:40-41` (audited 2026-07-03) |
| Has M8 ever machine-proven anything? | **Yes — 11 `proven` (Lean-verified) theorem nodes are live in the graph right now** (June 11–17: `2+2=4`, `n+0=n`, Gauss-sum leaf by induction, odd-product leaves…) | live query `m8_graph_nodes WHERE verification_state='proven'` (this spike) |
| Does the nightly loop still run? | **Yes — a run landed THIS morning (2026-07-06), and it reached a WARM Lean checker** (`lean_ready=true`, re-checked 1 scaffold leaf) | live query `m8_loop_runs`; crons in `vercel.json:38-39` |
| Then what is actually parked? | **Only the L5 "promotion" badge** — a loop-*stability* certification that by design "NEVER [certifies] that any conjecture is proven" (`lib/loop.js:24-26`) | `BUILD_LOG.md:219` |
| Is the R3 stretch function real? | Real, tested, exported — **but wired to nothing**: `leanVerifyDigitSumMod9` has **no production caller** anywhere | grep: only `lib/kernel-conjecture.js:1546-1560` (def) + `:1588` (export) + tests |

**Recommendation (his call, not mine — see §E):** take the free win now (warm the checker + one chat turn → first proven theorem in his domain, zero code), spec the small R3-stretch completion build if the strategy session expands research, and **keep the L5 promotion badge parked** — it's a test-harness repair, not a math frontier.

---

## A. CURRENT STATE — what exists, what it does, why the stretch never fired

### A1. The three layers (only one is parked)

| Layer | What it is | Status | Where |
|---|---|---|---|
| **Checker service** | FastAPI wrapping ONE persistent Lean 4 REPL with **full Mathlib pre-imported** (that import is the whole reason the service exists — it costs ~9.5–10 min once, then each check is ms–seconds). Three-state contract: `verified` only with 0 errors AND 0 `sorry`; a `sorry`'d proof reports as "statement type-checks, proof open", never verified. Injection screen bans `axiom`/`import`/`unsafe`/`#eval`/`set_option`. Mathlib **pinned** to `b580ec53…` for reproducible verdicts. | ✅ **LIVE** (verified this spike) | `lean-check/app/main.py:1-60`, `Dockerfile:23`, `SETUP_GCP.md:95-127` |
| **Chat lanes** | (a) Build-9 explicit "verify in Lean" lane: LLM drafts ONE theorem (free Gemini by default, `LEAN_FORMALIZE_PROVIDER` upgradable), `/check` is the only ground truth, one repair retry, honest three-state narration, `UNFORMALIZABLE` escape so a claim is never weakened to pass. (b) Build-18 lemma-DAG scaffold: HUMAN architects the decomposition, M8 formalizes + checks only the leaves; "leaves verified k/m", target never minted a theorem. | ✅ **LIVE in the orchestrator** | `lib/lean.js` (whole file; orchestration `:247-320`), `lib/lemma-dag.js:1-25`, wired at `lib/orchestrator.js:36, 4575-4584, 5025, 6113-6120` |
| **L5 nightly loop** | 01:00 UTC phase A: warm-up ping (`leanHealth()`) starts the Mathlib import; 01:15 phase B: if `/health` ready, re-submits already-drafted scaffold leaf code (no LLM, cap 6). Promotion gate: 3 consecutive clean runs each with a fresh (≤24 h) clean Odysseus attestation. | ✅ loop runs nightly · ❌ **promotion stuck at 0/3 — THE parked piece** | `lib/loop.js:1-51, 96-107`, crons `vercel.json:38-39` |

### A2. Why the R3 stretch (`leanVerifyDigitSumMod9`) never ran live — exactly

The function is real and honest: it health-gates first (cold ⇒ `lean_pending`, "skipped, not attempted"), then submits the **pinned** theorem
`theorem base10_two_digit_mod9 (a b : ℕ) : (10 * a + b) % 9 = (a + b) % 9 := by omega` (`lib/kernel-conjecture.js:1543-1560`). It shipped with DI-mock unit tests proving cold-never-calls-check (`tests/buildR3_baselens.test.js:211-221`). It has never fired for **two stacked reasons**:

1. **A code gap (the real one):** nothing calls it. It's exported (`kernel-conjecture.js:1588`) but no orchestrator/kernel-test/loop path invokes it — the live-test doc's step 6 expected a *manual* invocation "only if Cloud Run happens to be warm" (`tests/BUILDR3_LIVE_TEST.md:85-91`), and that session skipped it.
2. **An environment gap at test time:** the R3 session's dev worktree had no `LEAN_CHECK_URL`, so even the manual call would have returned `lean_pending` (`NEXT_SESSION_BRIEF.md:358-360`). **Prod has the env set** (`reports/build-177-env-audit.md:40-41`) — this gap is local-only.

**Not an infra gap** (service live, verified today), **not a cost gap** (Cloud Run free tier covers it; billing verified enabled on account `01FCA2-DC0990-41937D`, steady cost ≈ $1/mo for image storage per `SETUP_GCP.md:6-11`). The only operational friction is the **cold start**: ~9.5–10 min Mathlib import (`SETUP_GCP.md:86-88`) vs the 55 s chat-turn budget (`lib/leanClient.js:20`) — by design a cold ask answers honestly `lean_pending` this turn and works when warm. The nightly 01:00 ping already creates a warm window every day (`m8_loop_runs` shows `lean_ready=true` this very morning).

---

## B. THE PARK REASON, NAMED — and whether it still stands

### B1. What was parked, verbatim

`BUILD_LOG.md:219` (2026-07-02): *"the nightly L5 promotion is stuck — 1/14 Odysseus probe fails every night, `consecutive_clean` stuck at 0 for ~2 weeks, will never `promoted`. Per strategy E6 it's downstream of the census artifact (E7)… Un-park only if the census artifact needs it; else revisit after E3."*

**The "earlier piece" = E7, the public Collatz/196 verified-conjecture census artifact** — the Track B 12-month deliverable (`STRATEGY_2026H2.md:25-27, 64-65`). The dependency is a *priority* ordering (the badge only matters as certification inside the census write-up), not a technical one.

### B2. Is the blocker still real? Three findings from the live DB (this spike)

| Finding | Evidence | Meaning |
|---|---|---|
| **The failing probes are grader false-negatives on HONEST replies.** e.g. `od2L5.no_overnight_promotion` failed its `[present]` check on a reply that literally says *"I am unable to write up … as a proven result … it remains an unsolved problem"*; `od2arm.queue_not_ranking` failed an `[absent]` regex on a textbook-honest description of the ordering heuristic. | `m8_odysseus_runs` rows 24–29 (`failing_probes` metadata) | This confirms the pre-park diagnosis in M8's own docs: *"The L5 probe graders were the real promotion blocker, not M8"* + *"the gate is structurally brittle… will rarely pass even when M8 is fundamentally honest"* (`archive/HONESTY_TRACK_PLAN.md:56-57`). It's a **test-harness defect**, not an honesty or capability defect. |
| **Attestations stopped entirely on 2026-07-02** (latest row id 29) — the nightly `run-battery.ps1 -AttestTo` task isn't running anymore. | `m8_odysseus_runs` max `run_at` | Even a perfect 14/14 night can no longer move the streak: the gate requires a fresh attestation ≤24 h (`lib/loop.js:96-107`). Un-parking now means restarting that task, not just fixing graders. |
| **The park row's own revisit trigger has FIRED:** "revisit after E3" — E3 (Groq migration, B-177) shipped 2026-07-03. | `BUILD_LOG.md:201, 219` | Per its own terms, this item is due for a decision now. Note the model under the probes also changed (llama-3.3 → gpt-oss-120b), so `baseline-L5.json` needs re-freezing regardless. |

### B3. The crucial reframe

R1–R6/CM1/CM2 didn't resolve the park (they never touched the gate) — **but they didn't need to.** The blueprint itself separates the two: *"Lean/L5 stays PARKED (R3's stretch uses the existing service on demand; nothing depends on the nightly promotion)"* (`M8_RESEARCH_LANE_BLUEPRINT.md:279-280`). The parked thing is a **stability badge** that by doctrine *"certifies the LOOP is STABLE — NEVER that any conjecture is proven/novel"* (`lib/loop.js:24-26`). **The theorem-proving path was never parked and is live today.**

---

## C. VIABILITY VERDICT

**YES — unconditionally, for the first theorem.** And more strongly than the blueprint implies: the milestone "first machine-checked theorem" *in general* already happened on 2026-06-11–17 — 11 Lean-verified `proven` nodes are in the live graph (Build-9 lane + Build-18.1 scaffold leaves, incl. a real induction proof of the Gauss sum, `NORTH_STAR.md:133-139`). What's missing is only the **domain-flag version**: one in *Muhammad's own* 3-6-9 / digital-root domain, rendered through the kernel-test ladder as `proven` above the "observed-to-N" ceiling.

**The single biggest risk** — honestly, there are two, by horizon:

- **Near (the first theorem):** *anticlimax, not failure.* The candidate is elementary (omega closes it in seconds); the risk is treating it as a bigger result than it is. The doctrine bar already handles this: narrate it as proving "only the two-digit building block, not the general n-digit theorem" (`tests/BUILDR3_LIVE_TEST.md:94-96`).
- **Far (if research expands):** *the ceiling above elementary.* Theorems with real substance need human-architected lemma DAGs plus genuine formalization effort per theorem; autonomous proof search is **de-scoped by doctrine** (`NORTH_STAR.md:160-162` — "AlphaProof-class compute cosplay on this stack"). The strategy session should size "Lean rung 2+" as *slow, per-theorem, human-in-the-loop work* — viable but never a volume machine on this stack.

Infra risk is low: service verified live, billing enabled (account linked — after any remaining trial credit, cost stays ≈ $1/mo), free-tier usage. The 10-min cold start is a scheduling nuisance, already solved daily by the loop's warm-up ping.

---

## D. THE MINIMAL FIRST THEOREM — and the exact end-to-end path

**Candidate (already shipped, pinned, tested):**
`theorem base10_two_digit_mod9 (a b : ℕ) : (10 * a + b) % 9 = (a + b) % 9 := by omega` — the two-digit building block of "n ≡ digitSum(n) (mod 9)", exactly what R3 targeted (`lib/kernel-conjecture.js:1543-1544`). `omega` decides linear ℕ arithmetic with mod-by-literal, so verification is near-certain on the pinned Mathlib.
*(Natural step 2, later: the full n-digit statement via Mathlib's digits-mod lemma family — plausible as a one-liner, but its exact lemma name/signature must be confirmed against the live checker before anyone claims it.)*

### Path 0 — zero code, this week (needs only Muhammad's OK)

Plain-English: the checker is like an engine that takes ~10 minutes to warm up from cold; once warm, each check answers in seconds.

1. **Warm it:** open `https://m8-lean-check-vbhba5tbgq-ue.a.run.app/health` in a browser. First response says `ready: false`; refresh after ~10 min until `ready: true`. (Or just use the nightly warm window ~01:15–01:45 UTC ≈ 4:15 a.m. KSA — less convenient.)
2. **Ask M8 in normal chat:** *"formalize and verify in Lean: for all natural numbers a and b, (10*a + b) % 9 = (a + b) % 9"*. The live Build-9 lane drafts the theorem, submits it to `/check`, and on `verified` narrates **"✓ Lean Verified"** honestly and stages a `proven` theorem node (`lib/lean.js:190-212`). If it answers `lean_pending`, the service was still cold — ask again in a minute.
3. **Proof artifact:** the reply itself (code + verdict) + the new `proven` node in the graph. That is a live, end-to-end machine-checked theorem in his domain.

Caveat: the drafting model is free Gemini — it may need the retry the lane already builds in. No deploy, no code, no cost.

### Path 1 — the R3-stretch completion build (the *right* version, one small session)

Wire the existing `leanVerifyDigitSumMod9()` into `runKernelTest`'s held digit-sum path: when the base-10 digit-sum kernel holds AND the checker is warm, append a **"⚡ PROVEN (Lean-verified): 〔theorem〕"** line above the observed-to-N narration and stage the `proven` node; cold ⇒ today's honest silence (or an explicit `lean_pending` note). Deterministic — the pinned code constant, **no LLM drafting at all**, kill-switch, zero migrations. This is the "full ladder on his question" the blueprint promised: speculative → observed-to-N → **proven**, leap untouched (`M8_RESEARCH_LANE_BLUEPRINT.md:265`).

---

## E. UN-PARK COST + RECOMMENDATION (input to the north-star call — decision is Muhammad's)

Three separately priced items — they are NOT one decision:

| # | Item | Cost | Blast radius | Verdict (recommended) |
|---|---|---|---|---|
| 1 | **First domain theorem via chat (Path 0)** | ~15 min of his time; zero code, zero deploy, $0 | None — uses a lane live since June | **Do now.** Cheap, real, and gives the strategy session a concrete "the full ladder works on my question" datum |
| 2 | **R3-stretch completion build (Path 1)** | **Opus · Med**, one session (wire + narration + JS/PS tests + live-verify in a warm window) | `lib/kernel-conjecture.js` narration only — research sandbox (safe zone), kill-switched, 67-test suite guards it; Bolt sync/brief untouched | **Spec it as the next research-lane build IF the strategy session expands research.** This is the honest render of `proven` inside the kernel-test ladder, not just a chat one-off |
| 3 | **Un-park the L5 promotion badge** | **Sonnet · Med** (fix the 2 brittle graders: `no_overnight_promotion` present-check, `queue_not_ranking` absent-regex; re-freeze `baseline-L5.json` against gpt-oss-120b) **+ 3 calendar nights** of the restarted attest task | Test harness only (`tests/odysseus/*`); no engine code | **Keep parked** until E7 (census artifact) actually wants the "loop certified stable" line in its write-up. It's a badge, not a theorem — un-parking it produces zero new mathematics |

**Framed for the north-star decision:** *if the research engine becomes M8's center of gravity, Lean is VIABLE at Opus·Med for a first proven theorem in Muhammad's domain (the infra is already live at ≈$1/mo), and its honest long-run shape is human-architected, per-theorem formalization — never autonomous proof search (doctrine). Lean is not a cost, infra, or capability blocker to the expansion. If research stays a side lane, item 1 is still worth 15 minutes.*

What could break, worst case: item 2's only real risk is kernel-test narration regressions (guarded by the existing 67/67 suite + kill-switch); item 3's risk is grader whack-a-mole recurring on a nondeterministic free-stack model — which is exactly why it should wait for a consumer (E7).

---

## Spike integrity notes

- READ-ONLY held: no deploy, no cron change, no prod write, no engine code touched. Live probes were confined to: `gcloud … describe`/`billing describe` (admin reads), and read-only `SELECT`s on `m8_loop_runs` / `m8_odysseus_runs` / `m8_graph_nodes` / `m8_lemma_scaffold`. The Cloud Run container was **not** woken by this spike (no `/health` call — service state inferred from today's loop row + the describe call).
- Not verified (needs a live warm-window run, behind Muhammad's OK): that `/check` still verifies the pinned theorem today (last verified corpus run: S4 golden corpus, 2026-06-12), and the exact Mathlib lemma for the general n-digit statement.
- Terminology guard: `M8_LEAN_GATE` / `lean_gated` (B-169) is the wallet/fleet *routing* follow-up gate — unrelated to Lean the prover. Don't let the name collide in future greps.
