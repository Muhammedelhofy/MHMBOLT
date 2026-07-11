# M8 — Post-Bolt Strategy + Research-Lane Doctrine Candidates

> **Session:** 2026-07-06 · Fable · High effort · strategy/doctrine only — zero code, zero deploy,
> zero cron/prod touch. Sources reconciled: vault `Projects/M8.md` (2026-07-06) ·
> `STRATEGY_2026H2.md` (locked 2026-07-02) · `NORTH_STAR.md` · `M8_RESEARCH_LANE_BLUEPRINT.md` §5 ·
> `BUILD_LOG.md` through B-189 (origin/main `1cab7ce`, sha `18b9af6`) · `NEXT_SESSION_BRIEF.md`.
>
> **Status: DRAFT — the 🔴 items are Muhammad's calls. Nothing here is doctrine until he words it.**
> Where this note lands (own file vs folded into `STRATEGY_2026H2.md`) is also his call; a pointer
> was added at the top of the strategy file so the two can't drift silently.

---

## §0 — Ground truth + reconciliation flags (verified this session, not from memory)

**Where M8 actually stands (all cited):**
- **R1–R6 + CM1 + CM2 = ALL LIVE** (`BUILD_LOG.md` Sessions 77–84). The compounding loop is closed:
  cited spine → seed packs → base-b lens → health rail → Arabic QA → inquiry ledger, plus the two
  classical-math checker packs. Leftovers are optional/diminishing: CM3, R5 scale-QA (blocked on
  Muhammad supplying a Shamela DOCX + an al-Razi/Ibn Sina passage), cosmetic polish.
- **Travel lane B-183→B-189 = ALL LIVE** (`BUILD_LOG.md` Sessions 87/87b/89; B-189 prod sha `18b9af6`).
- **Fleet lane reads `fleet_data`** in the shared Supabase (`lib/fleet.js:33,189-200`); the data is
  refreshed by the **Bolt dashboard repo's** 3 nightly Bolt-API crons (MHMBOLT repo, `api/bolt/*` —
  NOT in this repo). M8 itself makes zero Bolt-API calls.
- **The morning brief reuses the SAME `fleet_data` row** (`lib/morning-brief.js:11`); its sections:
  fleet P&L (`:207`), multi-platform (`:295`), nudges (`:332`), due-today tasks (`:374`), wallet
  (default OFF, `M8_BRIEF_WALLET_ENABLED`, `:426-430`). **Email delivery is currently OFF**
  (kill order: env `M8_BRIEF_EMAIL_ENABLED=off` → `m8_kv morning_brief_email`, `lib/notify.js:13-14`;
  OFF confirmed at Session-83 close). The cron still fires daily; it just doesn't send.
- **M8's 5 crons** (`vercel.json:36-42`, the hands-off zone): cron-explore 01:00 · cron-verify 01:15 ·
  cron-summarize 02:00 (the L5 nightly research loop) · morning-brief 03:00 · push-cron 04:00 UTC.
- **L5/Lean state:** NORTH_STAR maturity ladder says L5 ~75%, promotion streak **1/3 as of 2026-06-23**
  — but nobody has read the attestations since. The vault says the Lean/L5 trophy is **PARKED on
  purpose**. Both can be true; the streak may already be ≥3 without anyone looking (`/api/loop-attest`
  exists, read-only).
- **E7 (public Collatz/196 verified-conjecture census + obstruction map) remains the locked
  12-month Track B deliverable** (`STRATEGY_2026H2.md` prize ladder #2 + E7 row) — defined, unshipped.
- **Corpus scope** = Muslim scientists broadly (math/optics/astronomy/physics), NOT medicine — a
  post-blueprint ruling recorded in session memory, not yet written into any repo doc (health rail
  stays a safety guard only).

**🔴 FLAG 1 — an uncommitted edit in `NORTH_STAR.md` already inserts the §5-5 doctrine line.**
The working tree contains an unstaged paragraph ("Research lane (R1–R4 LIVE, 2026-07-04): the same
honest engine pointed at Muhammad's own questions — primary sources in (cited), kernels computed,
leaps labelled, health railed…") — essentially blueprint §5-5's *proposed* wording. Every session
close since R3 says the doctrine line is "still untouched / Muhammad's to word." Nothing was
*committed* unilaterally, but the line is sitting in the tree and would ride along silently with any
future NORTH_STAR commit. It is also already stale ("R1–R4" — R1–R6 are done).
**Recommendation:** leave it uncommitted until you word the line (§C below); your chosen wording then
replaces/absorbs this paragraph in ONE deliberate, blessed commit.

**🟢 FLAG 2 — the local M8 checkout was 2 commits behind origin** (missing B-189) — fixed this
session with a fast-forward pull (no push, no deploy; local now = origin/main `1cab7ce`). The vault
was right; the local BUILD_LOG read was stale, not the vault.

**🟢 FLAG 3 — BUILD_LOG cosmetic drift:** the B-187 row still reads "uncommitted this session — not
yet deployed," but B-187 (`b4d29a1`) shipped inside the B-188 push (`dad5ae1`, your explicit OK) and
the vault marks it live-verified. One-line log fix for any future Sonnet session close.

---

## §A — The post-Bolt call, lane by lane

Context: the job ends ~this month (July 2026). The ONLY thing the job's end touches is the **Bolt
API data feed**. The Supabase project is YOUR personal account (the "BOLT" name is historical) — the
database, M8's `m8_*` tables, and `fleet_alerts` all survive. Nothing else in M8 has any Bolt
dependency.

| Lane | What the job's end does to it | Recommendation | Why |
|---|---|---|---|
| **Fleet** (fleet Q&A, P&L, per-driver, `export?fn=fleet`) | Data feed dies → `fleet_data` freezes at last sync. Lane keeps answering — from silently aging data. | 🔴 **FREEZE READ-ONLY, honestly dated** — not retire, not repoint (yet). Ship one small guard (S-1 in §D): if `fleet_data.updated_at` is older than N days, every fleet/P&L answer opens with "fleet data frozen as of ⟨date⟩ (Bolt role ended)". Kill-switched, no cron touched. | The data is a **historical asset**: it holds your verified operational numbers (the CV/interview evidence base). Deleting the lane destroys that; leaving it undated makes M8 quietly lie about "today" — the one thing M8 never does. Repointing (a future fleet/venture) stays open: the bones (registry, P&L, c1 codec) are reusable the day a new data source exists. |
| **Bolt-side crons** (3 nightly pulls, MHMBOLT repo — *not this repo*) | Your API token dies at exit → they start failing silently every night. | 🔴 **Disable cleanly at exit-week** — one final API pull as archive, then remove/disable the 3 crons. This belongs to the **Bolt FINALIZE track**, not an M8 session; flagged here so it isn't orphaned between the two repos. | A cron failing nightly forever is noise you can't see and can't fix headless — exactly the failure mode the hands-off doctrine exists to prevent. |
| **Morning brief** | Fleet section of the brief goes stale like the lane. But email delivery is ALREADY OFF — nobody receives it. | 🟢 **Leave exactly as-is now** (zero action, zero risk). **Repurpose is a designed option on the shelf**, not a default: the R6 close left a dormant morning-brief seam — a post-Bolt brief could become *inquiry-ledger digest + due tasks + wallet (flip `M8_BRIEF_WALLET_ENABLED=1`) − fleet section*. Content-only edits in `lib/morning-brief.js`; the cron itself stays untouched. | You turned the email off deliberately; re-enabling should be a want, not a default. If the S-1 staleness guard ships, even the dormant brief can't mislead. |
| **Wallet** | Nothing — Family Wallet has its OWN Supabase, fully job-independent. | 🟢 **Unaffected — if anything, promote it.** Post-job, runway IS the daily question (see S-2, §B/§D). | — |
| **Notes / tasks / reminders / docs / vault-ingest** | Nothing — `m8_*` tables in your own Supabase. | 🟢 **Unaffected.** | — |
| **Travel lane** | Nothing — SerpApi key is yours. | 🟢 **Unaffected — likely MORE used post-job** (Egypt trips already exercising it). Keep the 250/mo quota watch. | — |
| **Research lane + nightly L5 crons** | Nothing — free stack, own infra. | 🟢 **Unaffected.** Direction question is §B. | — |

**The one-line answer to "what is M8 for post-Bolt":** the job was ONE data feed among several —
not M8's identity. M8 stays *"runs my world + an honest research engine"*; the fleet lane gracefully
becomes a dated archive instead of a live feed, and everything else doesn't move.

---

## §B — The research half: next horizon

R1–R6 closed the compounding loop. Three honest options for what comes next:

| Option | What it means | Verdict |
|---|---|---|
| **1. Research becomes the center of gravity** | Post-job time flows into new research capability builds (CM3+, new domains, new lanes). | ❌ **Not recommended.** It inverts your settled framing ("built by choice, in parallel with the job hunt, never off the runway money" — vault, 2026-06-21 ruling). July 2026 is exactly when income direction + runway questions peak; a research expansion sprint is the wrong month. |
| **2. Deliberate slow burn: USE the loop, then ship E7** ★ | Stop expanding the engine; let the inquiry ledger accumulate real research turns for a few weeks (soak), feed the corpus when YOU supply sources (R5 scale-QA), and point the next big effort at **E7 — the public census artifact**, which is already the locked 12-month deliverable. | ✅ **RECOMMENDED.** The right move after closing a compounding loop is to let it compound. E7 is defined, unshipped, and the highest-leverage research move available — and it's dual-purpose: a public, cited, machine-verified artifact is **portfolio-grade proof of your automation/AI differentiator** for the job hunt. Consolidation ≠ stagnation; E7 IS the expansion. |
| **3. Stop expanding entirely** | Park the research half; all-in on income. | ❌ **Not recommended, but named honestly.** The engine costs ~nothing to keep warm (free stack, crons already run headless). Killing the identity core of M8 saves nothing and forfeits E7. |

**Positioning the two known candidates inside Option 2:**

- **#2 — un-park the Lean/L5 machine-proof loop: NOT the next session.** Three reasons:
  (a) your own note calls the Lean trophy parked-and-cosmetic; (b) its real consumer is **E7's
  credibility** (Lean-checked leaves in the census) — un-park it *inside* E7 packaging, where the
  proof has an audience, not as a standalone trophy hunt; (c) the Cloud Run cold-start friction
  (~9.5 min Mathlib import) makes it a fiddly session with near-zero user-visible payoff on its own.
  **The honest first step costs one read-only check, not a session:** read `/api/loop-attest` — the
  promotion streak was 1/3 on 2026-06-23 and the nightly crons have run ~2 weeks since; L5 may have
  self-promoted (or regressed) with nobody looking. Fold that check into any session's warm-up.
- **#4 — the vault∩wallet composite gap: the FIRST feature build of the post-Bolt era.** "According
  to my vault notes, what is my money and runway situation?" routes correctly to wallet but the
  handler can't compose cross-lane (Session-85 close, flagged at sample-size 1). Sample size no
  longer governs: the life change makes this THE post-Bolt daily question — runway + income
  directions (vault notes) ∩ real numbers (wallet). Design constraint that makes it Fable-spec
  territory: the **privacy wall** (money figures never enter LLM prompts) means the composite must
  be assembled deterministically — wallet numbers via the existing walled path, vault-note context
  narrated around them, never through them.

---

## §C — ★ The NORTH_STAR research-lane doctrine line (blueprint §5-5)

> **This line is YOURS to word.** Below are three candidates with trade-offs and my recommendation.
> Per the R4 health-rail precedent: pick one / edit one / reply "use candidate N as drafted" — THEN
> it gets written into `NORTH_STAR.md` (absorbing the stray uncommitted paragraph, Flag 1) in one
> deliberate commit. Until then, NORTH_STAR stays untouched.

**Candidate 1 — the mechanism line** *(blueprint §5-5's own proposal, status-corrected)*
> *Research lane (R1–R6 LIVE): the same honest engine pointed at Muhammad's own questions — primary
> sources in (cited), kernels computed, leaps labelled, health railed, inquiries cumulative — see
> `M8_RESEARCH_LANE_BLUEPRINT.md`.*

Trade-off: purely descriptive — says what the lane *does*, not what it's *for*. Safest and shortest;
it's essentially already sitting in your working tree. But §5-5 was reserved for a purpose statement,
and this doesn't give one.

**Candidate 2 — the compounding-truth line** ★ **(Recommended)**
> *Research lane: the engine's honesty pointed at my own questions. Sources in, cited; kernels
> computed; leaps named as leaps — and no question ever resets: what I learn compounds in one cited
> ledger across months. I would rather hear "no source on file" than a beautiful answer.*

Trade-off: aspirational and first-person in a mostly third-person doctrine file (easily re-voiced if
that grates). Longer than Candidate 1. But it states the lane's *purpose* — honest compounding on
YOUR questions — without narrowing what those questions may be, and its last sentence is the whole
R1–R6 ethos in one line. Recommended because it answers "what is the research half FOR," which is
exactly what §5-5 was held open for.

**Candidate 3 — the heritage line**
> *Research lane: recover and test the classical canon — the Muslim scientists' mathematics, optics,
> and astronomy — with modern verification: primary sources cited, checkable claims computed and
> checked, mystical leaps named, health questions railed to history-not-advice. The bar is one Thabit
> ibn Qurra or Ibn al-Haytham would recognize: claims verified, not merely quoted.*

Trade-off: the strongest identity — it commits the lane to the heritage-verification mission your
corpus-scope ruling already points at. But it *narrows*: 3-6-9, Tesla, Collatz and whatever you
wonder about next are bigger than the Islamic canon. Choose this only if the heritage corpus is the
lane's heart rather than one of its rooms.

**🔴 STOP — awaiting your word.** (A hybrid is also legitimate: Candidate 2 as the doctrine sentence
+ Candidate 1's mechanism list as the trailing pointer.)

---

## §D — Ranked next-horizon roadmap (research half + assistant half, post-job)

| # | Build | Model · Effort | When | What it unlocks |
|---|-------|----------------|------|-----------------|
| **0** | 🔴 **Your calls on this note** — doctrine line (§C) + lane fates (§A) + roadmap blessing | you · 5 min reply | now | Everything below; NORTH_STAR commit unblocked |
| **1** | **S-1 Fleet staleness honesty guard** — `updated_at` age check → "frozen as of ⟨date⟩" framing in fleet/P&L packets; kill-switched; zero cron touch | Sonnet · Med | at/just before job exit | The fleet lane can never silently lie post-exit; the freeze-read-only fate (§A) becomes safe by construction |
| **2** | **Bolt-side exit hygiene** — final archive pull + disable the 3 Bolt-API crons *(MHMBOLT repo — belongs to the Bolt FINALIZE track, listed here so it isn't orphaned)* | Sonnet · Low (other repo) | exit week, your OK | No silent nightly failures forever; the archive is complete |
| **3** | **S-2 Composite runway answer (vault∩wallet)** — Fable spec first (privacy wall: deterministic wallet numbers, notes as narrative context), then build | Fable spec → Opus · Med | first post-exit feature | "What's my money and runway situation per my own notes?" — the post-Bolt daily question, answered from real data |
| **4** | **L5 attestation read** — read-only `/api/loop-attest` check: is the promotion streak ≥3 already? | Sonnet · Low (10 min, fold into any session) | anytime | Honest L5 status before E7; may already be promoted with nobody looking |
| **5** | **S-3 E7 census artifact v1** — package the Collatz/196 verified-conjecture census + obstruction map → public repo + write-up; **un-parks Lean exactly here** (verified leaves in the artifact) | Fable (obstruction map + framing) → Opus (packaging) · High | after a few weeks of ledger soak | The locked 12-month Track B deliverable — citable, public, AND portfolio-grade job-hunt evidence |
| **6** | **R5 scale-QA** — full Shamela DOCX ingest QA + al-Razi/Ibn Sina health-rail live smoke | Sonnet · Med | 🔴 blocked on YOU supplying the sources | The classical library flows in at scale; feeds whichever doctrine direction you choose |
| **7** | **S-4 Morning-brief repurpose** *(optional — only if you WANT the email back)* — inquiry digest + tasks + wallet, minus fleet; content-only, cron untouched | Sonnet · Med | your opt-in | A post-Bolt brief worth reading — research + life, no stale fleet |
| **8** | **CM3** *(optional, diminishing)* — Pythagorean triples / CF convergents checker | Opus · Med | whenever you want more canon | Broader decidable-fact surface |
| — | ~~Lean/L5 un-park as a standalone session~~ | — | **not scheduled** | Folded into #5 where the proof has a consumer |

Background Sonnet-ables continue as before: travel SerpApi 250/mo quota watch · B-179 context-budget
soak · the Groq post-08-16 rollback-row retirement sweep.

---

## §E — Decided vs. open

**Decided by the ground truth (no call needed):**
🟢 Wallet, notes/tasks/reminders, travel, research crons: unaffected by the job's end — verified, not assumed.
🟢 The Supabase project + all M8 tables survive the job (your personal account).
🟢 Local repo re-synced to origin (B-189 present); B-187 log-row drift flagged for a future close.

**🔴 Yours to call (reply in one message):**
1. **Doctrine line** — Candidate 1 / **2 (recommended)** / 3 / your own edit.
2. **Fleet fate** — freeze-read-only-with-dating (recommended) / retire / other.
3. **Bolt-cron exit hygiene** — OK to schedule in the FINALIZE track at exit week?
4. **Roadmap order** — bless §D as tabled (S-1 → exit hygiene → S-2 → E7), or reorder.
5. **The stray NORTH_STAR paragraph (Flag 1)** — hold uncommitted until your doctrine pick lands (recommended), or revert now.

*Written read-first per doctrine: every state claim above cites the file it was read from; the three
source-of-truth conflicts found were flagged (§0), not papered over. No code, no deploy, no cron, no
prod write. — Fable, 2026-07-06*
