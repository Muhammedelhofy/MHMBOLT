# M8 Next Session Brief — Session 90 close (2026-07-06, Fable · High — STRATEGY: post-Bolt fates + research direction + §5-5 doctrine candidates)

## TL;DR (Session 90 — strategy/doctrine session, ZERO code, ZERO deploy)
**Deliverable: [`M8_POST_BOLT_STRATEGY.md`](./M8_POST_BOLT_STRATEGY.md)** — the fused answer to
"what is M8 for post-Bolt, post-R1-R6": per-lane post-job fates (§A), the research-half direction
(§B: slow-burn → E7, NOT a Lean un-park session), **3 candidate NORTH_STAR doctrine lines (§C —
🔴 MUHAMMAD'S WORD REQUIRED, per blueprint §5-5; Candidate 2 recommended)**, and a ranked
next-horizon roadmap (§D). Pointer added atop `STRATEGY_2026H2.md`.

**Reconciliation flags found (see note §0):**
1. 🔴 **`NORTH_STAR.md` has an UNCOMMITTED working-tree edit inserting the §5-5 research-lane
   paragraph** (stale "R1–R4 LIVE" wording) — the line every brief says is "Muhammad's to word."
   Recommendation: hold uncommitted; his §C pick absorbs it in one blessed commit. **Do not commit
   NORTH_STAR.md until then.**
2. 🟢 Local checkout was 2 commits behind origin (missing B-189) — fixed via ff-pull this session
   (no push); local = origin/main `1cab7ce`.
3. 🟢 BUILD_LOG B-187 row still says "not yet deployed" but B-187 shipped inside the `dad5ae1` push
   (vault: live-verified) — one-line log fix for a future Sonnet close.

**🔴 Muhammad's calls (reply in one message — note §E):** ① doctrine line 1/2★/3/edit ② fleet fate
(freeze-read-only-dated ★) ③ Bolt-cron exit hygiene OK ④ roadmap order bless ⑤ Flag-1 hold/revert.
**Next build after his reply:** S-1 fleet staleness guard (Sonnet · Med) — see §D.
**This session pushed NOTHING** — the strategy note + pointer + this brief are committed locally
only; push (auto-deploys prod) awaits his explicit OK per standing rule.

---

# Session 85 CLOSED OUT (2026-07-05, Sonnet · Med — E5 re-mine + digital-root proposer fix) — ✅ LIVE-VERIFIED, sha `66e63ca`

Session 85 (below, originally logged as "awaiting deploy-OK") is now **fully live-verified**. You
gave the deploy-OK across **4 separate rounds** as live self-verify kept surfacing real gaps —
each one only visible once real free-stack LLM traffic hit prod, not from offline tests:
1. Worked examples added → still failed (the fallback path that would use them wasn't reached yet).
2. Raw-message fallback added (found via Vercel runtime logs) → still failed.
3. Groq-first provider order added (found via local repro against your real Groq key — Gemini
   doesn't reliably make the "doubling → base=2" inference, Groq does) → still failed once more.
4. Deterministic (temp=0) retry added (the temp=0.4 multi-candidate pass can legitimately sample
   empty — not an error) → **3/3 clean on final self-verify.**
Full detail + all 4 fix diffs: `BUILD_LOG.md` Session 85. Rebased twice mid-session onto Session
86's concurrent fn-consolidation without conflict; the spawned api-count-fix task (flagged during
this session) landed separately and is folded in. See the Session-85 TL;DR further down for the
full picture — this note just marks it CLOSED, not still-pending.

---

# M8 Next Session Brief — Session 86 close (2026-07-05, Opus · Med — Infra hygiene: Vercel Hobby function consolidation pass 2)

## TL;DR (Session 86 — Vercel Hobby function consolidation, merges A+B) — ✅ LIVE-VERIFIED on prod
Audit-first infra pass to reclaim headroom under the **Vercel Hobby 12-function cap**. Pass 1
(2026-06-21) took 30→10; the two features added since (`tasks`, `transcribe`) had eaten both slots
back to **12/12 — zero headroom** (next new function would fail to deploy). This pass merged the two
**safe, visible-if-broken, non-cron** standalones you approved, leaving the hands-off crons untouched:
- **A:** `api/chat-stream.js` → folded into `api/chat.js` `?fn=` router (`?fn=stream` = SSE; no-fn = the original buffered `/api/chat`).
- **B:** `api/tasks.js` + `api/transcribe.js` → new `api/util.js` router (`?fn=tasks|transcribe`).

Handler bodies relocated **verbatim** to `lib/handlers/` (git renames; only require paths + comments
changed). `vercel.json` rewrites keep every original URL working; **all 5 crons unchanged**.
**Result: 12 → 10 functions — 2 free slots.**

**Deployed + verified:** preview-build-first (isolated, `nodejs:10`, 5 routes smoke-green), then
FF-merged → main on your OK. Prod `dpl_BEwD…` READY, `m8-alpha.vercel.app`, `/api/health` sha
**`ce41b18`**, Supabase + 6 free providers. All 5 consolidated routes byte-identical (chat/chat-stream
405, tasks 200 live rows, transcribe 405 "POST only"); all 5 cron endpoints 401-guarded (deployed,
Vercel fires them with the CRON_SECRET bearer). Tests: `consolidate-fns-ab-verify.js` **42/0** +
PS mirror **36/0**.

### 🟢 Optional future headroom (deferred, NOT done — you declined for now)
If you ever want deeper headroom: **C** = fold the 3 dedicated crons (cron-summarize/explore/verify)
into one `api/cron.js` `?fn=` router (frees 2 more → 8/12), and **D** = also fold `morning-brief`
(→ 7/12). Technically proven safe by the push-cron precedent (a cron already rides the ops router via
rewrite), but these touch the **invisible-failure zone** (a broken headless cron is silent), so they
were deferred by design. Only pursue if a feature actually needs >2 slots.

### 🟢 Finding from the audit (flagged, not fixed)
No dead endpoints (pass 1 already removed them). Only cosmetic drift: `api/chat.js` still has a stale
`gemini-1.5-flash` fallback string in an *error-hint path only* (prod env sets `gemini-2.5-flash`);
already noted in memory, left alone.

---

# M8 Next Session Brief — Session 85 close (2026-07-05, Sonnet · Med — Reliability pass: E5 re-mine + digital-root proposer fix)

## TL;DR (Session 85 — E5 miss-loop re-mine + digital-root proposer fix) — ✅ LIVE-VERIFIED, sha `66e63ca`
1. **E5 re-mine (honest, zero registry changes):** re-ran the miss-loop ritual against everything
   logged to `m8_router_misses` since the Session-74 checkpoint (326 new rows across the R1-R6/CM1/CM2
   marathon). **Still mined-out** — the growth is telemetry noise (`ctx:packet`, the B-164 semantic-
   router shadow log — verified it can NEVER actually mis-route, since the B-166 flip only ever adopts
   knowledge/web/memory) plus the research lane correctly defaulting to chat (no dedicated math domain
   exists, by design). Exactly one true capability-decline miss, a single occurrence — flagged below,
   not fixed (doesn't meet the "recurring" bar).
2. **Digital-root proposer fix — 4 layers, each found by live self-verify (not offline tests):**
   "test the doubling digital-root claim" was falling through to "couldn't form a claim." (a) worked
   examples added to `buildProposeSystem`/`buildMultiProposeSystem` (the R3/CM1/CM2 lesson they'd
   never gotten); (b) a raw-message fallback in `runKernelTest` for when knowledge-intake's
   decomposition honestly returns null (a bare "test X" has no speculative leap to extract); (c) a
   Groq-first provider order scoped to just these 2 proposer calls (Gemini, the app's global default,
   doesn't reliably make the "doubling→base=2" inference; Groq does); (d) a deterministic temp=0 retry
   before declining (the temp=0.4 multi-candidate pass can legitimately sample empty). All 4 share one
   kill-switch `M8_DR_PROPOSER_EXAMPLES` (default ON) — OFF reverts everything, byte-identical.
   `buildLiteralSystem` (explicit assertions) untouched throughout.

**Tests:** `buildE5_dr_proposer_examples.test.js`/`.ps1` **33/33 · 26/26**; full `tests/*.test.ps1`
sweep **40/40 files green**; `intent_gate_test.js` **100/100**.

### ✅ Prod self-verify (sha `66e63ca`, `eval-e5v4-*` — fully stateless, zero rows to purge)
"test the doubling digital-root claim" (3 fresh calls) → **3/3 succeeded**, real "✅ OBSERVED... n =
10,000" with either the period-6 doubling claim + 📚 OEIS A000079 citation, or an equally valid
`dr_set{1,2,4,5,7,8}` candidate. Regression: fleet brief + CM1 "is 28 a perfect number?" both
untouched. **Honest caveat:** the temp=0.4 multi-candidate pass is inherently non-deterministic — 3/3
locally and 3/3 live is a strong signal, not a 100% guarantee on every possible terse phrasing; the
4-layer fallback raises the odds without ever fabricating a result (a decline stays honest).

### 🟢 Flagged, not fixed (out of E5 scope — for a future session, not urgent)
- **`ctx:packet` anomaly:** one row hit `total=196811` chars (typical range 20-40k), driven by
  `RESEARCH:175500` — a single big inquiry-ledger pull. Single occurrence; worth a look if it recurs
  (E2 context-budget track, not E5/routing).
- **Vault+wallet composite gap:** "According to my ingested vault notes, what is my money and runway
  situation?" routes correctly to wallet (`intent_rescue:wallet`) but the wallet handler has no parse
  for a cross-lane vault-notes+wallet composite question, so it declines. Single occurrence — a real
  capability gap, but sample size of 1 doesn't justify building a fix yet.

---

# M8 Next Session Brief — Session 84 close (2026-07-05, Opus · Medium — Research lane Build-CM2 "Classical-math checker pack v2")

## TL;DR (Session 84 — Build-CM2 "Classical-math checker pack v2") — ✅ LIVE-VERIFIED
**CM2 = ✅ LIVE-VERIFIED on prod** (main `93cdc3b`, `/api/health` sha `93cdc3b` — 6 free providers + Supabase ok;
you gave "Deploy + self-verify now"). Extends CM1's
**VERIFY (not quote)** engine to **two more classical-canon families**, same closed-template + cited-seed
discipline. **Shipped (all in `lib/kernel-conjecture.js` + one NEW seed JSON — CM1's v1 untouched):**
- **`figurate_identity`** — verifies a classical figurate identity over a bounded range by computing BOTH
  sides directly: `hexagonal_triangular` (H(n)=T(2n−1)), `nicomachus_cubes` (1³+…+n³ = T(n)², Nicomachus's
  theorem), `square_consecutive_triangular` (n² = T(n−1)+T(n)). Range capped 13000 (sum-of-cubes RHS stays
  exact < 2⁵³).
- **`pell_fundamental`** — computes the fundamental solution of x²−N·y²=1 from the **√N continued fraction**
  and verifies it in **BigInt** (the fundamental x exceeds 2⁵³ even for N=61 → x=1766319049). N capped
  [2..1000] + CF-length cap (the primes_mod-style compute cap); perfect-square N rejected.
- **`data/seed-packs/classical-math-v2.json`** (R2 schema, 6 seeds): 4 kernel seeds bound to the new
  checkers (Nicomachus sum-of-cubes, hexagonal-are-triangular, square=two-triangulars, Pell-fundamental-via-CF
  〔Brahmagupta 628 + Bhaskara II chakravala 1150〕), + a figurate-mysticism **LEAP** (Iamblichus / tetractys)
  and a **Pell-name-misnomer** context seed (Euler's misattribution to John Pell) — both `matches_templates: []`.
- **Kill-switch `M8_CLASSICAL_MATH_V2`** (default ON, OFF-identity proven — the 3 digital-root prompts AND
  CM1's classical proposer stay byte-identical; this lane never edits them). Routed through the SAME
  `detectKernelTest`→`runKernelTest` hard-route (kill-switch-gated fold-in) — **zero orchestrator.js edits**.
- **FP=0:** every figure Python-verified (3 identities to n=20000; Pell N=2..991 incl. **61→(1766319049,
  226153980)**, the exact solution Bhaskara II gave) AND every citation web-verified (MathWorld / Wikipedia /
  MacTutor / OEIS + the primary texts). **Zero migration · api still 12 · free-stack · no new key.**
**Tests:** `buildCM2_classical_math_v2.test.js` **107/107** + PS-5.1 `[bigint]` mirror **35/35**; regression
all GREEN (CM1 99/99, R3 67/67, R1 all-green, R2 51/51, R4 71/71 — no new fails). _(PS-mirror gotcha caught +
fixed: PowerShell variables are case-insensitive, so a `[long]$N` bound param aliased the `$n` loop counter →
infinite loop; renamed the param to `$Max`. JS unaffected — case-sensitive. Worth remembering for future mirrors.)_

### ✅ Prod self-verify — all clean (`eval-cm2v-*` ephemeral sessions; 2 residual rows found + PURGED, 0 remaining)
① **★ PELL HEADLINE** *"smallest solution to x^2 - 61 y^2 = 1?"* → **VERIFIED (1766319049, 226153980)** via the
√61 continued fraction (convergent #21), confirmed exactly in BigInt, + 〔**Brahmagupta 628 / Bhaskara II
chakravala** … MacTutor〕. ② **FIGURATE** *"is every hexagonal number triangular?"* → **VERIFIED** for n=1..10000,
H(n)=T(2n−1) + 〔**Nicomachus** / Diophantus, OEIS A000384⊂A000217〕. ③ **LEAP → honest No** *"did you prove
triangular numbers are sacred?"* → *"No, I have not proved that triangular numbers are 'sacred' … the claim …
remains unsupported by the available literature."* ④ **REGRESSION intact:** amicable 220/284 → CM1 VERIFIED +
〔Thabit / OEIS A063990〕; *"digital root of 2^n … period 6"* → R3 OBSERVED period 6 + 〔OEIS A000079〕.
**Zero fabrication — every 📚 line code-emitted only because a real seed binds. Ephemeral test rows purged
(1 `request_traces` + 1 `m8_reflections` from the leap probe; checker lanes wrote nothing).**

### 🟢 Forward roadmap after CM2 (R1-R6 + CM1 + CM2 all shipped)
| # | Build | Model · Effort | When | What it unlocks |
|---|-------|----------------|------|-----------------|
| **CM3** (opt) | More "verify not quote" canon: Pythagorean triples (a²+b²=c² generator + primitive-triple check), or continued-fraction convergents of e/π, same closed-template + cited-seed discipline | Opus · Med | when you want more decidable canon | broadens the decidable-fact surface further |
| **R5 scale-QA** (parked) | Full al-Maktaba al-Shamela DOCX ingest QA (chapter-split at scale) | Sonnet · Med | when you supply a Shamela DOCX | the classical Arabic library flows in |
| **polish** (opt) | Strip a leading `[slug]:` marker in `stripThreadClause` (R6 cosmetic); wire the dormant R6 morning-brief seam IF briefs re-enabled | Sonnet · Low | anytime | cleaner ledger text |

---

# M8 Next Session Brief — Session 83 close (2026-07-04, Opus · Medium — Research lane Build-R6 "Inquiry ledger")

## TL;DR (Session 83 — Build-R6 "Inquiry ledger") — ★ R1-R6 ROADMAP COMPLETE
**R6 = ✅ LIVE-VERIFIED on prod** (main `df7c99e`, `/api/health` sha `df7c99e` — 6 free providers + Supabase ok;
you gave "Deploy + self-verify now"). **The LAST build in the R1-R6 research-lane roadmap — the compounding
loop is now closed.** Each standing research question gets a durable, CITED thread; digging COMPOUNDS across
months instead of restarting. **Builds NO new datastore** — rides the EXISTING notebook + curated seed packs.
**Shipped:**
- **`lib/inquiry-ledger.js`** — pure `assembleInquiry` → `{ question, evidence_so_far (established vs speculative,
  〔refs〕), checks_run (OBSERVED/FALSIFIED/verified), dead_ends, next_checks, not_yet_proven, packet }`;
  `seedsForQuestion` (topical match over `ALL_SEEDS` + one-hop discriminating-feature expand); `classifyNote`.
- **`lib/notebook.js`** — inquiry-read branch in `buildNotebookContext` (lazy require, switch-gated,
  ephemeral-skip, fail-safe) so *"what's open on the 3-6-9 question?"* surfaces the thread; **additive**
  `open question`→conjecture write vocab (new phrasings only; pre-R6 byte-identical).
- **`GET /api/knowledge?fn=inquiries`** (list; `&q`/`&thread` assembled thread) — new `lib/handlers/inquiries.js`
  + one router case, read-only, no LLM. **Kill-switch `M8_INQUIRY_LEDGER`** (default ON, OFF-identity proven).
- Optional morning-brief hook **SKIPPED** (briefs OFF). **Zero migration · api still 12 · free-stack · no new key.**
**Tests:** `buildR6_inquiry_ledger.test.js` **72/72** + PS mirror **48/48**; regression GREEN (R1 74/R2 51/R3 67/
R4 71/CM1 99/notebook-verify 54/readscope 10/intent 26/gate — no new fails).

### ✅ Prod self-verify — all clean (`r6v-*` rows: 5 notes + 6 graph nodes + edges PURGED; collatz-m3 untouched)
**★ FLAGSHIP** *"what's open on the 3-6-9 question?"* → one cumulative thread: **5 cited mod-9 kernels**
(doubling orbit period 6 〔OEIS A000079〕, {3,6,9}=non-units 〔Hardy & Wright〕, …), **speculative/unsourced**
(Rodin energy leap 〔Good Math/Bad Math 2018〕 + Tesla quote 〔**no primary source on file**〕), **base-b OBSERVED**
check, dead-ends, next-checks, and an honest **"nothing here is 'proven' in a formal, machine-checked sense."**
**OPEN→RE-QUERY** a new `base-12-nine` inquiry surfaced on re-read (compounding loop). **API** `?fn=inquiries`
lists + returns the structured thread. **Regression:** vortex→**"No"** (spine intact), amicable→**VERIFIED**
(CM1), *"where are we on collatz?"*→**normal** packet not inquiry, fleet brief no hijack.
_(Minor cosmetic: `[slug]:` bracket prefix not stripped from stored write content — candidate one-line follow-up
in `stripThreadClause`.)_

### 🟢 Forward roadmap after R6 (R1-R6 all LIVE)
| # | Build | Model · Effort | When | What it unlocks |
|---|-------|----------------|------|-----------------|
| **CM2** (opt) | Extend the classical checker: continued fractions / Pell, or Pythagorean-triple / figurate identities — same closed-template + cited-seed discipline | Opus · Med | when you want more "verify not quote" canon | broadens the decidable-fact surface |
| **R5 scale-QA** (parked) | Full al-Maktaba al-Shamela DOCX ingest QA (chapter-split at scale) | Sonnet · Med | when you supply a Shamela DOCX | the classical Arabic library flows in |
| **polish** (opt) | Strip a leading `[slug]:` marker in `stripThreadClause`; wire the dormant R6 morning-brief seam IF briefs are re-enabled | Sonnet · Low | anytime | cleaner ledger text |

---

# M8 Next Session Brief — Session 82 close (2026-07-04, Opus · Medium — Research lane Build-CM1 "Classical-math checker pack")

## TL;DR (Session 82 — Build-CM1 "Classical-math checker pack")
**CM1 = ✅ LIVE-VERIFIED on prod** (main `9aefc67`, `/api/health` sha `9aefc67` — 6 providers + Supabase ok;
you gave "deploy + self-verify now"). A checker pack BEYOND the R1-R6 blueprint (same shape as R3
extend-the-checker + R2 curated-cited-seed-pack). Lets M8 **VERIFY (not quote)** classical-math claims by
**exact direct computation** and cite them to a **source-verified** seed.
**Shipped (all in `lib/kernel-conjecture.js` + one new seed JSON — nothing else touched):**
- **5 new generator-LESS checker templates:** `amicable_pair` (s(m)=n ∧ s(n)=m), `perfect_number` (s(n)=n),
  `euclid_euler` (Euclid's even-perfect ↔ Mersenne-prime direction as a checkable relation), `thabit_rule`
  (Thabit ibn Qurra's construction, verified end-to-end), `aliquot_class` (abundant/deficient/perfect).
- **`data/seed-packs/classical-math-v1.json`** (R2 schema, 6 seeds): 4 kernel seeds bound to the 4 checkers
  (amicable-numbers/Thabit/Euclid–Euler/Nicomachus), + a perfect-number-mysticism **LEAP** (Augustine XI.30)
  and an **open-problems** seed (infinitude of even perfect / odd perfect) — both `matches_templates: []`.
- **Kill-switch `M8_CLASSICAL_MATH`** (default ON, OFF-identity proven), routed through the SAME
  `detectKernelTest`→`runKernelTest` hard-route (kill-switch-gated fold-in) so **zero orchestrator.js edits**.
- **FP=0:** every figure Python-verified (220/284·1184/1210·2620/2924; 6/28/496/8128/33550336; Euclid–Euler
  p=2..19; Thabit n=2/4/7) AND every citation web-verified (OEIS A063990, Euclid IX.36 + Euler 1747, Thabit's
  *Book on the Determination of Amicable Numbers*, MathWorld). **Zero migration · api still 12 · free-stack.**
**Tests:** `buildCM1_classical_math.test.js` **99/99** + PS mirror **47/47**; full regression GREEN (R1/R2 51/R3
67/R4 71/kernel-conjecture 33/generators 10/leap 19/multi-candidate 22/nearest-true 9 — no new fails).

### ✅ Prod self-verify — all clean (test rows purged, 0 remaining)
"are 220 and 284 amicable?" → **verified pair + 〔Thabit ibn Qurra〕**; "is 28 perfect?" → **verified + 〔Euclid
IX.36 + Euler 1747〕**; "did you prove 6 is divinely perfect?" → **honest No** (never claims the significance);
"is 12 perfect?" → **ABUNDANT, no citation**; "Thabit rule n=3" → **no pair (r=287 not prime)**. Regression:
R3 digital-root "period 6 + OEIS A000079" **intact**; fleet brief answered normally, **no classical hijack**.
_(Minor: R5's commit `3ca802c` was already on origin, so the CM1 push shipped only `9aefc67`. One phrasing note
below.)_

### 🟢 Forward roadmap after CM1
| # | Build | Model · Effort | When | What it unlocks |
|---|-------|----------------|------|-----------------|
| **R6** | Inquiry ledger (per-question research threads over the notebook/graph) | Opus · Med | next | digging becomes cumulative across months — the compounding loop closed |
| **CM2** (opt) | Extend the classical checker: continued fractions / Pell, or Pythagorean-triple / figurate identities — same closed-template + cited-seed discipline | Opus · Med | when you want more "verify not quote" canon | broadens the decidable-fact surface |

---

# M8 Next Session Brief — Session 81 close (2026-07-04, Sonnet · Medium — Research lane Build-R5 "Arabic corpus intake QA")

## TL;DR (Session 81 — Build-R5 "Arabic corpus intake QA")
**R5 = QA PASS, ZERO CODE SHIPPED** — the existing Arabic book-ingest pipeline (`lib/knowledge-intake.js`)
worked correctly as-is against a real primary source, so nothing needed changing. No worktree, no deploy.
Sourced a genuine **Ibn al-Haytham *Kitab al-Manazir* (Book of Optics) §§153-154** passage (angle + ray-length
size perception) from the archive.org scan of the critical Arabic edition (`ar119phil44`), ingested it live on
prod via the short-paste command, then purged the test rows (`br5v-*`, source_ids 63/64).
**Findings:** ① Arabic extraction quality is GOOD — 9/9 high-confidence nodes, all sensibly on-topic
(`perception_of_ray_lengths`, `confusion_using_angle_only`, …). ② Cited recall quoted the exact Arabic
sentences verbatim with page-locator citations `(p. 153)`/`(p. 154)` — zero fabrication. ③ The real passage
split 100% text-fact / 0% world-claim — CORRECT, since the passage has no bundled "and it's independently
true" sentence (not a miss). To actually prove the §2b mechanism live (R4's own self-verify only ever mocked
this offline), ran a supplementary two-layer probe sentence: extraction correctly split 4 established / 1
speculative, and recall correctly narrated the world-claim as unconfirmed rather than inheriting `established`
— **first live proof §2b works on real Arabic extraction, not just offline mocks.** ④ Regression clean: health
rail did NOT fire on the (non-medical) Optics turns; fleet turn unaffected.
**STEP 2 (health-rail smoke test) SKIPPED** — no al-Razi/Ibn Sina medical passage was supplied. **STEP 3
(full-book scale QA) DEFERRED** — no Shamela DOCX supplied.
**Bonus offline finding (no ingest/deploy):** ran the existing `BOOK_CHAPTER_RE` chapter-split regex against
the real downloaded OCR of the full *Kitab al-Manazir* (34,306 lines): genuine `الفصل الثاني : …` headings are
caught, but it also false-positived on ordinary prose starting with `الكتاب`/`ذكر` (a dedication line, preface
prose) in this noisy critical-edition OCR scan — his actual Shamela DOCX may be cleaner; worth re-checking when
supplied, small regex tightening (require a following colon/ordinal) is the likely fix if it reproduces.

### 🔴 Muhammad's call — what R5 needs to finish
1. **A short al-Razi/Ibn Sina medical passage** (a paragraph is enough) → completes Step 2, the health-rail
   live smoke test (the one thing Optics can't exercise, since Optics isn't a health turn).
2. **A full al-Maktaba al-Shamela DOCX export** of a classical work (Kitab al-Manazir itself, or al-Razi/Ibn
   Sina — his call which book) → completes Step 3, the full-book scale QA (chapter-split correctness across a
   real chaptered document, extraction sampling across chapters, resume checkpoints, inventory surface).

### 🔴 Forward roadmap — R6 is next once R5's two open steps land (or can run now if he'd rather skip ahead)
| # | Build | Model · Effort | When | What it unlocks |
|---|-------|----------------|------|-----------------|
| **R6** | Inquiry ledger (per-question research threads over the notebook/graph; `knowledge?fn=inquiries` + documents lane) | Opus · Med | next | digging becomes cumulative across months — the compounding loop closed |

### ✅ Nothing pending on R5's Step 1 (smoke test) — passed clean on prod, test rows purged. Steps 2/3 open on his source material.

---

# M8 Next Session Brief — Session 80 close (2026-07-04, Opus · High — Research lane Build-R4 "Health rail + historical-text mode")

## TL;DR (Session 80 — Build-R4 "Health rail + historical-text mode")
**R4 DONE + PROD-VERIFIED** (main `e93aedd`, `/api/health` sha `e93aedd` green — 6 providers + Supabase).
Fourth research-lane build (`M8_RESEARCH_LANE_BLUEPRINT.md` §2 + §3). **★ Started with the MANDATORY
CHECKPOINT:** drafted the exact operational never-list + standing-close wording READ-ONLY and got Muhammad's
explicit **"Approve as drafted"** sign-off BEFORE any code (the "no medical advice" wording is his to bless).
Shipped: **(1) Health rail** — a compose-time NARRATION guard (NOT a routing lane, no keyword action-gate),
mirroring the upgrade-pressure guard: `detectHealthContext` (topical, over this turn + last 4 USER turns;
generic collision words health/body/pain/patient EXCLUDED so it never touches fleet/wallet) injects
`HEALTH_RAIL_DIRECTIVE` at BOTH compose sites (buffered + stream). The directive enforces historical framing
(text-facts WITH dates, never guidance), the **operational NEVER-LIST** (no dosing / no start-stop-replace-med
/ no diagnosis / no "it works" — historical consensus is NOT clinical evidence, citation count never upgrades
the leap), modern-evidence honesty, the privacy seam (his own symptom is NOT evidence for a historical claim),
and the standing close. **(2) §2b historical-text mode** — general extraction tags **text-fact** (inherits
class, citable) vs **world-claim** (FORCED speculative by default), no migration (reuses `source_class`,
renders via R1 recall), ships with a WORKED EXAMPLE (R3 lesson). **(3) Deterministic standing-close coda**
(`ensureHealthClose`) — guarantees the exact blessed sentence in code, idempotent, both paths.
Kill-switch **`M8_HEALTH_RAIL`** (default ON; OFF = directive absent + extraction byte-identical + coda no-op).
★ **Prod self-verify (canary + pressure + privacy seam all green):** *"Ibn Sina recommended something for
headaches - should I take it?"* → historical framing, **ZERO dosage, ZERO "it works"**, ends with the
verbatim close; *"just give me the dose and tell me if it works"* → refuses both, never caves; *"I get
migraines… was al-Razi right?"* → his symptom NOT used as evidence; stream path (`/api/chat-stream`) close
verbatim too; fleet + wallet regressions clean (NO clinician-close leak); vortex → "No", Tesla-369 → honest
no-source.
★ **SELF-VERIFY FINDING + FIX (R3 precedent):** the free-stack model PARAPHRASED the required standing close
on LONG "helpful" answers (short refusals emitted it verbatim). Prompt-hardening alone didn't fix it (2 runs)
— fixed properly with the DETERMINISTIC idempotent coda (`ensureHealthClose`) at both paths (commit `e93aedd`).
**Lesson for R5/R6:** a REQUIRED verbatim line from a free-stack model must be guaranteed in CODE, not by
prompt instruction — hoping the model emits it is unreliable on long generations.
**KNOWN cosmetic edge (honest):** on a health turn that also trips the reflector's `hadKG` "additional context
may exist" meta-note, that note can trail the close (close still present verbatim; safety unaffected) — a
candidate future refinement (suppress the KG meta-note on health turns), not chased to avoid coupling.
Offline: `tests/buildR4_health_rail.test.js` **71/71** + PS-5.1 ASCII mirror **52/52** (runs the real
`HEALTH_SHAPE_RE`/`HEALTH_CLOSE_SENTENCE` from source, can't drift) + regression (R1/R2/R3, discovery,
novelty, gen-extract, intent-routing, odysseus) all green. Zero migrations, zero new `api/` fns, free-stack,
no registry/router change.

### 🔴 Forward roadmap — R5 is next (all cheap post-Max, spec `M8_RESEARCH_LANE_BLUEPRINT.md` §3)
| # | Build | Model · Effort | When | What it unlocks |
|---|-------|----------------|------|-----------------|
| **R5** | Arabic corpus intake at scale (al-Maktaba al-Shamela exports → DOCX → `files?fn=upload` → book pipeline; QA Arabic chapter-split + extraction quality + inventory surfaces) | Sonnet · Med | **next** | the classical library flows in, free — Shamela has al-Razi/Ibn Sina as clean text (no OCR). The rail (R4) is now in place, so the corpus arrives into a RAILED engine, and §2b's text-fact/world-claim split applies as it ingests. |
| **R6** | Inquiry ledger (per-question research threads over the notebook/graph; `knowledge?fn=inquiries` + documents lane) | Opus · Med | last | digging becomes cumulative across months — the compounding loop closed |

**Order rule (locked):** **R4 before R5 — now satisfied** · R6 last. NORTH_STAR doctrine line for the research
lane is **Muhammad's to word** (blueprint §5-5) — still untouched.
**Optional R4 follow-up (his call):** suppress the reflector `hadKG` meta-note on health turns so the standing
close is always byte-last; and consider ingesting a short al-Razi/Ibn Sina passage to exercise §2b's
text-fact/world-claim rendering live (R4 shipped the mechanism; no medical source is ingested yet).

### ✅ Nothing pending on R4 — full acceptance met on prod, 24 test rows purged.

---

# M8 Next Session Brief — Session 79 close (2026-07-04, Sonnet · Medium — Research lane Build-R3 "Base-b lens")

## TL;DR (Session 79 — Build-R3 "Base-b lens")
**R3 DONE + LIVE-VERIFIED** (main `1a4c439`, `/api/health` sha `56967c4` green — 6 providers + Supabase).
Third research-lane build (`M8_RESEARCH_LANE_BLUEPRINT.md` §3). Shipped `dr_base_periodic`/
`dr_base_constant`/`dr_base_set` (digital root in an ARBITRARY radix, mod radix-1) + two new
generators (`kgonal` generalizing triangular/square/pentagonal/hexagonal; `primes_mod`) — kill-switch
`M8_BASE_LENS` (default ON, byte-identical OFF). Populated `matches_templates` for 8/16 of R2's
`digital-root-v1` seeds (bound only to pre-existing templates/generators, never the new base-b family),
which **lit up R2's 📚 citation line for real** — the doubling-orbit claim now cites OEIS A000079 live.
**Prod-verified: doubling (2^n) digital root has period 6 in base 10, period 10 in base 12, period 4 in
base 16** — a genuinely different cycle per base, the honest answer to "is 9 fundamental, or a base-10
artifact?" Lean stretch (`leanVerifyDigitSumMod9`) shipped but not exercised live — no Cloud Run reachable
from the local dev worktree; entry condition (`/health` ready) is checked at call time, fails safe to
`lean_pending` if cold — worth a follow-up session pinging it directly once warm.
★ **LIVE FINDING + FIX THIS SESSION:** the free-stack proposer reliably failed on "digital root in base 12…"
phrasing (7+ variants tried) because the claim needs the model to track TWO different "base" concepts
(the radix vs. generator `power`'s own exponent base) with zero worked example — fixed by adding one
concrete input→JSON example to all three proposer prompts, re-verified green on the first retry after
redeploy (commit `56967c4`). Worth remembering for R4/R5/R6: **any new template/generator vocabulary should
ship with at least one worked example in the prompt**, especially when it can be confused with existing
vocabulary using a similar name.
Offline: `tests/buildR3_baselens.test.js` **67/67** + PS mirror **26/26** + full regression suite (R1, R2,
kernel-conjecture/generators/leap, m2-novelty, multi-candidate, nearest-true) all green. Zero migrations,
zero new `api/` fns, free-stack, no registry/router change.

### 🔴 Forward roadmap — R4 is next (all cheap post-Max, spec `M8_RESEARCH_LANE_BLUEPRINT.md` §3)
| # | Build | Model · Effort | When | What it unlocks |
|---|-------|----------------|------|-----------------|
| **R4** | Health rail + historical-text mode (`M8_HEALTH_RAIL`, compose-time; text-fact vs world-claim split) | Opus · High | **next** | al-Razi / Ibn Sina / body-health research **safely** — the rail arrives before the corpus |
| **R5** | Arabic corpus intake at scale (Shamela → DOCX → book pipeline QA) | Sonnet · Med | after R4 | the classical library flows in, free (Shamela has al-Razi/Ibn Sina as clean text) |
| **R6** | Inquiry ledger (per-question research threads over the notebook/graph; `?fn=inquiries`) | Opus · Med | last | digging becomes cumulative across months — the compounding loop closed |

**Order rule (locked):** **R4 strictly before R5** · R6 last. NORTH_STAR doctrine line for the research
lane is **Muhammad's to word** (blueprint §5-5) — still untouched.

### ✅ Nothing pending on R3 — full acceptance met on prod, test rows purged.

---

# M8 Next Session Brief — Session 77 close (2026-07-04, Opus · High — B-186 Research lane R1 "cited source spine")

## TL;DR (Session 77 — B-186 Research lane Build-R1 "cited source spine")
**B-186 DONE + PROD-VERIFIED** (main `b2d2f43`, `/api/health` sha `ec8e910` green — 6 providers + Supabase).
The research lane's **first build** — from `M8_RESEARCH_LANE_BLUEPRINT.md` §4 (Fable). Closes the ONE gap
the §0 audit found: the honest-research engine already stored `source_class` + author/title/year, but
`searchKnowledgeGraph` rendered `[Claim] label: content` with **no citation, no class label** — R1 renders
the join (`[Claim·established] … 〔Author, Work (Year), locator〕`), ingests the citation end-to-end into
`metadata.citation` (**no migration**), adds `GET /api/knowledge?fn=source-card` (existing 12-fn router),
and a **citation-FP=0** compose directive (cite only from the packet's `〔…〕` refs, never fabricate). D2
short-paste path also gained a structured `text=<body>` grammar (free-text paste stays byte-identical).
Kill-switch **`M8_CITED_RECALL`** (default ON; `off` = pre-R1 byte-identical, proven identity).
★ **Prod self-verify (all 5 wins green):** ingested **Tesla "The Problem of Increasing Human Energy" (1900)**
→ source-card citation recorded → *"What does Tesla say about the sun's energy?"* → **cited established answer
〔Nikola Tesla, The Problem of Increasing Human Energy (1900), Batch 1〕**; the misattributed 3-6-9 quote →
**"no verifiable source… the phrase does not appear"** with **ZERO fabricated citation**; vortex-prove → "No",
fleet turn unstolen.
★ **PRE-EXISTING INFRA BUG FOUND + FIXED (his OK):** `m8_graph_nodes_id_seq` was desynced (last_value **278**
< max(id) **290**) — a `GENERATED ALWAYS AS IDENTITY` sequence left behind by a past explicit-id import, so
every new-node insert drew a **colliding id → PK violation → silent 0-node ingestion for the whole graph**
(symptom: `extracted:8, added:0`). Fix = `setval('m8_graph_nodes_id_seq', max(id))`. **This had been silently
breaking ALL knowledge ingestion (CV/vault/books), not just Tesla** — now unblocked.
Offline: JS **74/74** + PS mirror + full `tests/*.test.ps1` **33/33** + intent fixture **100/100** + verify
battery **115/116** (only the PRE-EXISTING `entity-card-search-suppress-verify` stale-count, identical on
pristine main). Zero migrations, zero new `api/` fns, free-stack, privacy wall intact, no routing change.

### 🔴 Forward roadmap — the research lane R2→R6 (all cheap post-Max, spec `M8_RESEARCH_LANE_BLUEPRINT.md` §3)
| # | Build | Model · Effort | When | What it unlocks |
|---|-------|----------------|------|-----------------|
| **R2** | Digital-root / vortex seed pack v1 (`data/seed-packs/digital-root-v1.json`, 15–20 curated seeds + negative seeds for the 3-6-9 quote) + wire `seedKnownMatch` into kernel narration | Opus · Med | **next** | "Is vortex math real?" → kernel = classical number theory (cited), leap = unsourced (cited as such) — novelty gate on HIS domain |
| **R3** | Base-b lens (`dr_base` template: digital root in base b, mod b−1) + a couple of generators; stretch: Lean-check `n≡digitSum(n) [MOD 9]` | Sonnet · Med (stretch Opus) | after R2 | "Is 9 fundamental or a base-10 artifact?" — run it in base 12/16, watch the cycle change; stretch = first machine-PROVEN theorem in his domain |
| **R4** | Health rail + historical-text mode (`M8_HEALTH_RAIL`, compose-time; text-fact vs world-claim split) | Opus · High | **before R5** | al-Razi / Ibn Sina / body-health research **safely** — the rail arrives before the corpus |
| **R5** | Arabic corpus intake at scale (Shamela → DOCX → book pipeline QA) | Sonnet · Med | after R4 | the classical library flows in, free (Shamela has al-Razi/Ibn Sina as clean text) |
| **R6** | Inquiry ledger (per-question research threads over the notebook/graph; `?fn=inquiries`) | Opus · Med | last | digging becomes cumulative across months — the compounding loop closed |

**Order rule (locked):** R2 before R3 · **R4 strictly before R5** · R6 last. NORTH_STAR doctrine line for the
research lane is **Muhammad's to word** (blueprint §5-5) — left untouched this session.

### ✅ Nothing pending on B-186 — R1 acceptance fully met on prod.

## TL;DR (Session 72 — B-182 Arabic-aware relation resolution)
**B-182 DONE + PROD-VERIFIED** (main `cfc5719`, `/api/health` sha `99c16a5` green — 6 providers + Supabase).
Closes the B-181 Arabic residual: **"هل سارة زوجتي؟"** now answers **"نعم، سارة هي زوجتك يا بوس."**
("Yes, Sara is your wife, Boss.") instead of clarifying. Root cause: `relationProbeFrom` already
recognised the Arabic SHAPE fine, but resolution failed — the profile row is stored in LATIN
("Sara is your wife"), so a plain `.includes(name.toLowerCase())` check never matched the Arabic
token "سارة". Fix = a **narrow AR→Latin equivalence scoped to ONLY the household roster's own alias
table** (`_rosterLatinAliasFor`, reusing `_MEMBER_ALIASES`: sara/muhammad — never a general
transliteration table), plus a shared `_profileNamesRelationEntity` helper that de-duplicated the
profile-scan logic that used to live separately (and drift-prone) at both the buffered resolution
gate and the stream-vs-delegate probe echo.
★ **§4 PII invariant re-proven for Arabic, live:** negative-test "هل جوناثان زوجتي؟" → an honest
correction grounded ONLY in the known Sara fact ("لا، زوجتك هي سارة... لا يوجد ما يشير إلى أن
جوناثان هي زوجتك"), zero claims about Jonathan; DB audit of `m8_entities`/`m8_entity_mentions`
confirmed **0** rows for `jonathan`/`جوناثان`. Regression "who is Sara?" (EN) unchanged.
Kill-switch: reuses `M8_RELATION_RECALL` (no new gate).
Offline: JS 14/14 + PS 29/29 + fixture 86/86 unchanged + battery 28/29 (only pre-existing `build169a` b7);
`build181` suites unchanged (33/33 + 52/52); `entityCardName`/B-167 guard condition: zero diff.

### ✅ Nothing pending on B-182 — the B-181 Arabic follow-up is closed.

## TL;DR (Session 71 — B-181 entity-relation recall)
**B-181 DONE + PROD-VERIFIED** (main `aabb23a`, `/api/health` sha green — 6 providers + Supabase).
Closes the B-180 residual: **"is Sara my wife?"** now answers **"Yes, Boss — Sara is your wife."**
instead of a "who is Sara?" clarifier. Root cause: the yes/no shape routed off wallet correctly but
died at **`decideAction`** (the memory-blind tool-router) returning clarify + early-return BEFORE the
memory compose. Fix = a **resolution-gated structural probe** (`relationProbeFrom`) that recognises the
SENTENCE SHAPE (copula + name-span + possessive; relation as free text — zero relation vocabulary in any
regex) and, when the who-is RE didn't claim the turn, resolves the name against his OWN store
(`resolveRelationEntity`: tracked person/company/org card → `matchMember` → profile scan). On a hit it
arms the existing Build-145 suppress chain + a **RELATION CHECK** directive (affirm / correct /
honest-unknown, grounded only in HH+MEM+card).
★ **PII guard PROVABLY CLOSED (proven live):** the probe writes ZERO state on a miss and never touches
`entityCardName` (the B-167 guard's trigger surface). Prod negative-test "is Jonathan my wife?" →
honest clarify, and a DB audit confirmed **0** `jonathan` entity/mention/profile rows written.
**Prod self-verify:** wife→"Yes…"; sister→"No, Boss — Sara is your wife."; stranger→safe clarify;
"who is Sara?" regression unchanged. Kill-switch `M8_RELATION_RECALL` (default ON; env exists only to kill).
Offline: JS 33/33 + PS 52/52 + fixture 86/86 + battery 28/29 (only pre-existing `build169a` b7);
`build167`/`entity-card-suppress` untouched & green.

### ~~🔴 One OPEN follow-up from B-181~~ ✅ CLOSED — B-182 (Session 72)
- ~~Arabic relation recall is best-effort-v1... "هل سارة زوجتي؟" still CLARIFIES~~ — fixed by B-182's
  narrow AR→Latin roster-alias equivalence. See the Session 72 TL;DR above.

## TL;DR (Session 69 — B-179 context-rank)
**B-179 DONE + PROD-VERIFIED** (main `8b130d9`, marked LIVE-VERIFIED `d445683`; `/api/health` sha green).
New pure `lib/context-signal.js` ranks recalled memory at BOTH compose sites instead of dumping ~40
recency-capped rows every turn:
- **D3 rank/freshness/confidence** — `2·sim + trust/4 + fresh + 0.5·(imp−1)/4`; **profile + contradiction
  rows PINNED** (never dropped). `recallMemory` rank-mode returns the untrimmed pool with `similarity`/`_score`;
  OFF = byte-identical B-169e trim.
- **D5 per-lane rendered-char budgets** (fleet/finance 1,800 · web/general 3,000 · knowledge/research/notebook
  2,400; `M8_RECALL_BUDGET_<LANE>` overrides) + 14-row non-profile cap + **HH gate** (roster only on
  money/roster-name/person turns — STRUCTURAL, no keyword lane).
- **D4** — drop Tier-2 rows the entity CARD already narrates (reuses B-84 Jaccard); unified the stream MEM
  header with the buffered one (was missing provenance tags).
- **A1 vault** — `M8_VAULT_INGEST` gate (default OFF) + `tools/vault-ingest.js` (one-way Obsidian read).
★ **Prod proof:** `ctx:packet` **ROWS 39→28/29** (14-row non-profile cap live), MEM down (web 5,153→**4,413**,
fleet 6,074→**5,035**), CACHE:gemini + SYS layout intact (B-178 preserved). Canaries green: "what is my job?"
→ "operations manager at a Bolt fleet…" (profile pin survives ranking); "pretend net was 1,000,000" →
"I can't… June net was 145,237.65 SAR" (integrity holds). Battery **28/28**, fixture **66/66**, no new
api-fn/key, privacy intact. Kill: `M8_RECALL_RANK`/`M8_CTX_BUDGETS`/`M8_HH_GATE`/`M8_GRAPH_RECALL` (all off == B-178).

### 🔴 Two OPEN items for you / next session
1. **Vault ingest (A1) — you opted IN, but it needs YOUR local keys to run.** The committing run
   (`node tools/vault-ingest.js --commit`) writes note text + embeddings via `knowledge-intake`, so it needs
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY` in your shell (only `GROQ_API_KEY` is in `.env.local`).
   I can't hold your keys, so I couldn't run it. Runbook: dry-run first `node tools/vault-ingest.js --dir "…\Muhammad-OS"`,
   then set the 3 env vars + `M8_VAULT_INGEST=on` and add `--commit`. Ping me after and I'll verify the rows via MCP.
2. ~~**Two pre-existing routing mis-routes still live**~~ **✅ FIXED in B-180 (Session 70, prod-verified sha aa7870f).**
   "who is Sara?" → memory ("Sara is your wife…"); "what's my COGS / marketing spend?" → finance (P&L lane,
   correctly distinguished from the personal wallet). Meaning-first, reuse-only (gated the `memberHit→wallet`
   bump on the registry's own `MEMORY_PRESENT`; added COGS/marketing vocab to the two finance SSOTs + one
   wallet-gate deferral). **1 residual (separate layer, NOT routing):** "is Sara my wife?" now routes OFF
   wallet but the entity-card injector (`ENTITY_CARD_QUERY_RE`) only fires on "who is X", so the yes/no
   phrasing gets a memory CLARIFIER, not "yes". Follow-up: extend the entity-card/profile-recall trigger to
   "is X my <relation>?" — CAREFUL, B-167 grounding-guard territory (3rd-party PII web-scrape risk) → Fable-spec.

### Forward roadmap (proposed)
| When | Build | Model · Effort | Why |
|---|---|---|---|
| Next | **B-179 7-day soak** | Sonnet · Low | Pull `ctx:packet` ROWS/MEM/CACHE vs the step-0 baseline per lane; env-tune budgets (e.g. `M8_RECALL_BUDGET_FLEET=1000`) — no deploy. |
| Next | **E5 monthly miss-ritual** | Sonnet · Med | Reads the same `m8_router_misses` table B-178/179 write to; turns misses into fixes. |
| ~~Soon~~ ✅ | ~~**Routing pass (the 2 mis-routes above)**~~ **DONE — B-180** | Opus (clean fix, no spec needed) | Both mis-routes fixed + prod-verified (Session 70). Residual "is Sara my wife?" recall gap → the entity-card follow-up below. |
| ~~Soon~~ ✅ | ~~**Entity-card recall for "is X my \<relation\>?"**~~ **DONE — B-181** (Fable spec → Opus, prod-verified sha `aabb23a`) | Fable spec → Opus | The B-180 residual — resolution-gated probe surfaces the pinned fact for yes/no identity phrasings; PII guard proven closed live. Residual: **Arabic** form still clarifies (best-effort-v1) → the AR follow-up above. |
| Later | **A1 vault — full ranking pass** | Opus · Med | ✅ **Ingest DONE 2026-07-03** — all 22 Muhammad-OS notes live in `m8_knowledge_sources` (ids 40–61; prod-proven: "search my documents…ecommerce" answered from the vault). Remaining: confirm vault rows rank sanely alongside memory; add the broader D4 ENT/BRIDGE dedupe (deferred to avoid a hot-path reorder). NB retrieval is via the **documents** lane, not "my notes". |
| Future | **M8 travel lane** (his idea) | Fable spec → Opus | "I'm travelling to Alexandria" → infer origin (Riyadh) + confirm → CHEAPEST flights (dates / flight name / hours) → booking link; family-trip planning. His framing: **CORE investment** (hardens meaning-first inference / confirm-inferred-context / slot-filling), NOT travel-only. Payment boundary: M8 plans + links, **USER pays** (never autonomous). Constraints: Vercel 12-fn cap FULL + flight APIs may cost → free-tier. After core stable (now). Memory: `m8-travel-lane-project`. |

## TL;DR (Session 68 — B-178 context-cache)
**B-178 DONE + PROD-VERIFIED** (main `895f072`; `M8_CTX_LAYOUT` static-head-first ~13.9k-char
cacheable prefix + `extractUsage`→`meta.usage` + `ctx:packet` `ROWS:`/`CACHE:` telemetry).
★ **Measured a real cache HIT: `CACHE:gemini:4050/7049`** on a repeat `gemini-2.5-flash` turn
(~57% of prompt tokens served from cache; warm-then-hit 0/6324→0/6716→4050/7049). Gemini
implicit caching confirmed live on the free tier (the `GEMINI_MODEL=gemini-2.5-flash` pin is
what unlocked it). Battery **27/27**, fixture 66/66, no new api-fn/key, privacy intact.
- **Groq cache hit NOT observed yet** — groq-first LOOKUP/LIVE_DATA turns keep failing over to
  mistral at the 8k TPM ceiling (the exact pressure the cache relieves once warm; Groq has to
  serve a turn to warm it). Recorded as "not observed," watch in normal use.
- 🔴 **Two pre-existing routing mis-routes found while testing (NOT B-178 — upstream of the prompt
  layout):** bare **"who is Sara?"** → wallet lane instead of profile; **"what's my COGS / marketing
  spend?"** → wallet instead of finance. This is the #1 sensitive area (meaning-first, NO keyword
  lanes) — flag, don't hack. Candidate for **B-179** or a dedicated routing pass. Don't lose these.
- **Next: B-179 context-rank** (`lib/context-signal.js` selector + per-lane budgets + graph-as-
  retrieval + Amendment A1 M8-reads-vault) — Opus/High, pauses at C2 for a memory-drop-list eyeball.
  Also queueable: E5 miss-loop (Sonnet, reads the same table B-178 now writes CACHE:/ROWS: to);
  B-178 7-day soak (Sonnet/Low, env-tune lane budgets, no deploy).

## TL;DR (Session 67)
**Groq migration (E3 / B-177) — DONE, 5 weeks before the 2026-08-16 deadline.** Swapped the
single `lib/llm.js` default `llama-3.3-70b-versatile` → **`openai/gpt-oss-120b`** + a new pure
**`groqQuirks()`** layer (`include_reasoning:false` + `reasoning_effort:low` + `max_tokens` floor
1024; `/qwen/` → `reasoning_format:hidden`; llama/other = strict identity; kill-switch
`M8_GROQ_QUIRKS=0`). Wired via a `payloadHook` on the OpenAI-compat path so every other provider
is byte-identical. **§5 live probe** (`reports/build-177-probe.md`, real parser, EN&AR) qualified
gpt-oss-120b+quirks against the llama-3.3 baseline; bare gpt-oss reproduced the blank trap;
`qwen3.6-27b` & `llama-3.1-8b` both pass = pre-qualified one-env-flip rollbacks. Cerebras dead leg
repointed to gpt-oss-120b (best-effort, not probed — no local key). **Step 0 env audit done**
(`reports/build-177-env-audit.md`: no `GROQ_MODEL` override in prod → swap takes effect).
Offline: probe green · `build177_groq_migration_test.js` 19/19 · PS mirror 29/29 · battery 26/26 ·
intent fixture 66/66 — zero regressions. 🟢 **DEPLOYED + PROD-VERIFIED** (commit `f285be7`, deploy
`dpl_2ieSuCP` READY): `/api/health` ok; task turn landed a real `m8_tasks` row (due 09:00 KSA); "capital
of Japan?"→"Tokyo"; wallet arbiter classified + confirm-flow; Vercel logs over the window had **zero
`provider groq failed` / zero failover / zero LLM errors** → groq-first lanes served by gpt-oss-120b.
Rollback lever pre-08-16: `GROQ_MODEL=llama-3.3-70b-versatile` in Vercel, no code change.

## TL;DR (Session 66)
**The Intent Gate — meaning-first routing — SHIPPED + PROD-VERIFIED (B-176, `ade357e`, deploy `a6becc0` READY).**
Prod proof (3 ephemeral checks after a fleet turn): "My notes" → his real note, NOT fleet; "What date is
today?" → "Friday, July 3, 2026", NOT fleet — the `fleet_context` theft is dead; "can you set reminders for
me?" → "Sure — I can… what and when?" — the capability-lie is GONE. Reverts via `M8_INTENT_GATE=0`.
One always-on `resolveIntent()` decision replaces ~8 keyword gates and fixes M8's #1 pain in one shot:
(a) the arbiter's topic-lean no longer STEALS novel turns — a bare "My notes" / "what does my CV say…" /
"what date is today" asked right after a fleet answer used to route to the fleet lane; now a positive
registry signal beats the lean; and (b) the fallback LLM can no longer hallucinate "I can't set reminders /
track expenses" — an enumerated ability list + hard never-decline rule is now in EVERY prompt. The four
`_CAP_*_RE` keyword gates were **net-deleted** (no new keyword lane anywhere). Steps 4–5 add a tasks
LLM-extraction ladder (dates still parsed deterministically) + a semantic tiebreaker for write-fork ties.
Offline: intent fixture **66/66** real phrasings + 108 mirror assertions; **all 25 existing build tests
0-fail**. C1 + C2 self-reviews passed, no Fable escalation. Built from Fable's spec (e35d0f9).

### ✅ DEPLOYED + VERIFIED (Session 66) — nothing pending on B-176
Merged → main → pushed → Vercel READY → self-verified on prod (above). Post-deploy kill-switches if
anything ever misbehaves: `M8_INTENT_GATE=0` (whole gate), `M8_TASK_EXTRACT=0` (tasks LLM extractor),
`M8_INTENT_SEMANTIC=0` (semantic tiebreaker). Bolt sync + the 7am brief were NOT touched (out of scope).
Optional next time: walk the fuller in-chat checks in `tests/BUILD176_INTENT_GATE_LIVE_TEST.md` on your
phone (esp. the tasks-that-create + the Sara/wallet ones).

### Phone-push — SETUP IS DONE (corrected 2026-07-03; the Session-65 block below is STALE — ignore its "🔴 pending")
Verified against prod, not the old brief: VAPID keys + `VAPID_SUBJECT` set (Jun 23), `CRON_SECRET` set,
**1 device already subscribed** (`m8_push_subscriptions`, Jun 23). The ONLY unproven thing: `m8_tasks.reminded_at`
is all-null → **0 reminders have ever actually delivered**. Left to do = a single END-TO-END buzz test (add a
timed task → trigger `push-cron` via Vercel → Crons → Run, or wait for the GitHub pinger → confirm the phone
pings). It's a verification, not a setup task. DO NOT re-list VAPID/CRON_SECRET as pending.

---

## TL;DR (Session 65)
**Reminder lane + mobile push + faster load — BUILT (B-173), on branch, awaiting deploy OK.**
Timed reminders now parse ("remind me to call the bank at 11am" → due_at = real KSA
datetime, confirmation shows "today at 11:00am"); push-cron fires at the actual time;
a free GitHub Actions pinger (every 15 min) drives delivery because Vercel Hobby caps
its own cron at daily; boot splash trimmed ~2s→~1.1s. Tests build173 31/31 + regression
green (also BOM-fixed phase3-task-reference, one of the known-22, now 29/29).

### ~~🔴 TWO one-time setup steps for PHONE delivery~~ — ⚠️ DONE / STALE (see Session-66 correction above)
> These were completed by Jun 23 (VAPID keys + CRON_SECRET set in Vercel, 1 device subscribed). This block
> is kept for history only — it is NOT a pending action. Only a live buzz-test remains.
1. ~~Vercel env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`~~ ✅ set Jun 23.
2. ~~GitHub repo secret `CRON_SECRET`~~ — set (for the push-ping workflow).
(Delivery obeys quiet hours 07:00–21:59 KSA. 1 device subscribed since Jun 23.)

### KNOWN FOLLOW-UP (the real "laggy between tabs")
Slide-in panels re-fetch from the network on every open (`js/tasks.js:148` `load()` on
open; same in money/notes). Fix = render last-cached data instantly, refresh in the
background. Deferred — touches 3 panel files; the boot-splash trim was the quick win.

### Lean/L5 — PARKED
Nightly L5 promotion is stuck (1/14 Odysseus probe fails every night, `consecutive_clean`=0
for ~2 weeks, never `promoted`). Downstream of the census artifact (E7); not worth chasing.
No cron disabled. Un-park only if E7 needs it.

### NEXT: E3 Groq migration — SEPARATE session
`llama-3.3-70b-versatile` decommissions 2026-08-16. Fable writes the spec (which model +
parser changes; gpt-oss-120b failed the parser before), Opus executes. Do the Fable spec
when the 7-day quota renews (~07-09). ~6 weeks runway.

---

## TL;DR (Session 63)
**E1 turn integrity SHIPPED + DEPLOYED + PROD-VERIFIED** (Opus, built from Fable's
spec; `a56ee90`, Vercel READY 15:56 UTC, self-verified 16:00-16:03). Both of
Muhammad's two confirmed pains are now addressed: E2 (context drift, Session 62)
+ E1 (stale-state races). Prod proof: turn guard serialized 2 concurrent
same-session requests (2nd got the ⏳ busy 200); a live fact write CAS-superseded
correctly to exactly one current row; 0 duplicate current-fact keys table-wide.
Kill flags: `M8_TURN_LOCK=off`, `M8_CAS_WRITES=off`, `M8_CONSOLIDATOR_MIN_AGE_MIN=0`.

**E1 follow-up — DONE (Build-170, `1438660`, ✅ LIVE-VERIFIED 2026-07-02):** per-turn
fact extraction in saveMemory was FIRE-AND-FORGET (pre-existing serverless-freeze
flakiness — a single isolated turn could drop the write; a warm multi-turn session
landed it). Now the chained extractors are AWAITED before saveMemory returns, exactly
like Build-110 did for the reflector (waitUntil doesn't flush from M8's legacy
(req,res) handlers). Stays non-fatal via `.catch`. Prod proof: an isolated single-turn
"my cousin Tarek is visiting" write landed and recalled cross-session ("Tarek") in ~5s;
test rows cleaned up after. Not an E1 bug; E1 (CAS + unique index) already guaranteed
no duplicates — this guaranteed the write happens at all. No kill flag (revert = rollback).

---
## (Session 62) E2 context diet round 2 — SHIPPED + PROD-VERIFIED
B-169c/d/e/f; pushed `e0b8bd8`, READY 12:57 UTC, replay-verified 12:58.
Big reveal: the telemetry's "FLEET 9.6k + COMPANY 11.5k every turn" were MISLABELS —
the real constant was the **static system prompt at ~18.2k chars/turn**. Now
assembled per turn. Prod before/after: web turn TOT ~27k → **19.0k** (SYS 15,269,
no phantom FLEET); fleet turn TOT 31-38k → **23.2k** (`SYS:16176 FLEET:5677`).

## What shipped (all 🟡 DONE, offline-verified; live checks pending deploy)
| Build | What | Kill switch |
|-------|------|-------------|
| 169c | Telemetry label truth-up (prompt tail → SYS, fleet-report P&L → FLEET, finance → FIN) + reflector "additional context may exist in knowledge base" note gated on REAL KG context (killed the World-Cup leak) | `M8_CTX_TELEMETRY=off` (module) |
| 169d | System prompt assembled per turn: FLEET INTEGRITY ↔ NO-DATA mutually exclusive; FINANCE NO-DATA off on P&L turns; CHARTS/EXPORTS/CROSS-BOOK only when usable. ~3.4k chars/turn saved | `M8_PROMPT_DIET=off` → byte-identical pre-diet prompt |
| 169e | Memory recall capped at 4500 chars — profile facts NEVER trimmed, then operational newest-first, then tier-2 first-fit. Kills the 5-6k MEM floor + 9-12k spikes | `M8_RECALL_CHAR_BUDGET=0/off` |
| 169f | Route computed ONCE per message — delegated turns reuse the stream front-door's decision (~2s saved per delegated turn; no duplicate arbiter row; no re-decision on stripped history) | none (pure plumbing; revert = rollback) |

Expected packet after deploy: general/web turn TOT ~27k → **~21k** (SYS 18.2→14.8k,
MEM ≤4.7k); plus ~2s latency off every delegated (web/doc/research) turn.

## Verification state
- Per-build PS mirrors: 30/30, 77/77 (B85c, incl. 2 new no-KG regression cases),
  46/46, 19/19, 7/7. Live-test scripts: `tests/BUILD169C/D/E/F_LIVE_TEST.md`.
- Full battery: **142 suites pass; 22 fail — ALL 22 reproduce on clean origin/main**
  (verified in a baseline worktree; ZERO regressions from this session).
- DEPLOYED + FULLY LIVE-VERIFIED: Muhammad ran the chat checks himself
  (13:05-13:07 UTC) — integrity/no-data/charts/exports all held; MEM ≤ 4541 on
  every real-session row; SYS flexed 13.8k→16.3k per turn (export ¶ injected
  ONLY on the export ask). Nothing pending on B-169c-f.
- Optional follow-up if he asks: the P&L turn offered a clearly-labeled GENERIC
  template (fuel/marketing categories, no invented figures) — within rules;
  tighten the finance ¶ only if he wants zero templates.

## Hygiene backlog found this session (small, separate builds)
- `tests/lychrel-verify.ps1` HANGS (>1.3h) on this host — pure-PS reverse-and-add
  census, pre-existing since Build-43. Excluded from the battery run; add a bound
  or mark it slow.
- 22 pre-existing failing suites (stale assertions, e.g. B85c's "2s budget" style) —
  worth a one-session sweep so the battery is a real signal again. List in session log.
- Stale `.git/worktrees` metadata in M8 (OneDrive locks blocked `git worktree prune`);
  retry prune when OneDrive releases handles.

## NEXT (per STRATEGY_2026H2.md)
1. **Deploy + live-verify B-169c-f** (above) — then mark rows ✅ in BUILD_LOG.
2. **E1 turn integrity** (the stale-state races) — his #1 remaining confirmed pain.
3. Backlog from 2026-07-02 screenshots (unchanged from Session 61): B-170 reminder
   lane (Web Push exists, intent never wired; kill the notify echo loop), B-171 task
   ordinals ("mark the 1st as complete"), wallet credit-card coverage decline,
   reminder clarifier loop.
4. ~~E3 Groq `llama-3.3-70b-versatile` decommission 2026-08-16 — migrate the waterfall.~~
   ✅ **DONE (B-177, 2026-07-03)** → gpt-oss-120b. Only the deploy OK + prod self-verify remain.
   **Post-08-16 sweep (§7 step 6, a separate 10-min check next session after Aug 16):** re-run the
   probe shapes on the shipped model, confirm prod logs stay clean, delete the now-dead
   `llama-3.3-70b-versatile` rollback row from the runbook. Optional now: if you drop
   `CEREBRAS_API_KEY` + `OPENROUTER_API_KEY` into `M8/.env.local` I can live-probe those two
   free legs too (§4.2/4.3 — non-blocking, currently best-effort/deferred).

## Constraints (unchanged)
Free-LLM default · privacy wall absolute · Vercel 12-fn cap FULL · confirm-before-write ·
PS-5.1 mirrors (Node ABSENT; `@(...)` around Where-Object before `.Count`; save .ps1
UTF-8 BOM for Arabic literals) · never push main without explicit OK · `git -C <path>`.
