# Build-R6 — "Inquiry ledger" — LIVE TEST

Prod: **https://m8-alpha.vercel.app** — kill-switch **`M8_INQUIRY_LEDGER`** (default ON — unset it,
never leave `off` set, unless this build needs to be rolled back at the env-var level).
Run AFTER the deploy is READY. Test-session rows are purged after (use an **`eval`-prefixed**
sessionId where possible so writes stay ephemeral, per the CM1 lesson).

> **Read this first — what R6 does.**
> The LAST build in the R1–R6 research-lane roadmap. It gives each STANDING research question a
> durable, CITED thread so digging COMPOUNDS across months. R6 builds **no new datastore**: an
> "inquiry" is a standing question whose evidence / checks / dead-ends already live in the research
> **notebook** (`lib/notebook.js`) + curated **literature** (`lib/seed-pack.js`). R6 assembles and
> surfaces that thread. Two surfaces: (a) chat rides the EXISTING notebook read lane —
> *"what's open on the 3-6-9 question?"* → the assembled thread; (b) `GET /api/knowledge?fn=inquiries`
> — read-only list, or the assembled thread for `?q=`/`&thread=`. Zero migration · zero new `api/`
> fn (`?fn=` only, 12-fn cap FULL) · free-stack · no new key.

---

## 0. Health
```
GET https://m8-alpha.vercel.app/api/health
```
Expect `ok`, providers + Supabase healthy, `sha` == the deployed commit.

---

## 1. ★ THE FLAGSHIP — "what's open on the 3-6-9 question?"

First **seed a thread** so the inquiry has real, cumulative content (these ride the EXISTING
notebook write path — opening/appending an inquiry IS a notebook write). Use the `[3-6-9]` bracket
so the thread slug is exactly `3-6-9` (parseThread can't take a bare hyphenated topic):
```
log a conjecture [3-6-9]: Is 9 fundamental, or a base-10 artifact of mod-9 arithmetic?
log evidence for [3-6-9]: Base-b lens OBSERVED — doubling digital-root period 6 in base 10, period 10 in base 12, period 4 in base 16.
log a dead end [3-6-9]: Reading the energy claims as literal physics — no mathematical content beyond the pattern.
log a next step [3-6-9]: Run the base-16 non-unit orbit and log the verdict.
```
Then the headline ask:
```
what's open on the 3-6-9 question?
```
**Expect** a single cumulative thread that pulls the EXISTING evidence together:
- **ESTABLISHED (cited):** the mod-9 kernel — doubling orbit 1-2-4-8-7-5 period 6 〔OEIS A000079 …〕,
  {3,6,9} are the non-units mod 9 〔Hardy & Wright …〕, the {3,6} 2-cycle, the Rodin-kernel-is-classical
  seed — each with its real 〔…〕 citation.
- **SPECULATIVE / UNSOURCED (cited as such):** the "energy of the universe" leap 〔… Good Math/Bad Math …〕
  and the Tesla "magnificence of 3, 6, 9" quote 〔**no primary source on file**〕.
- **CHECKS RUN:** the base-b result as **OBSERVED** (evidence, not proof).
- **DEAD ENDS** and **NEXT CHECKS** as logged.
- Ends able to say plainly **what is NOT proven**: kernel established, leap/quote speculative with no
  promotion path, nothing "proven" without Lean.
- **Zero fabricated citations.** A claim with no source on file is said to have none.

**Paste the real response into the BUILD_LOG row.**

---

## 2. OPEN then RE-QUERY — the compounding loop

Open a brand-new inquiry (append path) and immediately read it back:
```
log an open question [base-12-nine]: Does 9 keep a special multiplicative role in base 12, or is that a base-10 accident?
```
```
what's open on base-12-nine?
```
**Expect:** the new standing question surfaces as its own thread (status open, the conjecture as the
question, next-checks offer). Proves an inquiry opened this session is durably re-queryable.

---

## 3. The API surface — `?fn=inquiries`

List standing questions:
```
GET https://m8-alpha.vercel.app/api/knowledge?fn=inquiries
```
**Expect** `{ ok:true, count, inquiries:[{ thread, title, status, entries, last, seed_backed }] }` —
the `3-6-9` thread present with `seed_backed:true`.

The assembled thread as JSON:
```
GET https://m8-alpha.vercel.app/api/knowledge?fn=inquiries&q=what%27s%20open%20on%20the%203-6-9%20question
GET https://m8-alpha.vercel.app/api/knowledge?fn=inquiries&thread=3-6-9
```
**Expect** `{ ok:true, found:true, question, thread, status, evidence_so_far:[…established+speculative…],
checks_run:[…], dead_ends:[…], next_checks:[…], not_yet_proven, packet }`. Read-only; no write.

---

## 4. Kill-switch OFF-identity
Set `M8_INQUIRY_LEDGER=off`, redeploy (or flip the env var), then:
```
GET https://m8-alpha.vercel.app/api/knowledge?fn=inquiries
```
**Expect** `{ ok:false, disabled:true }`. And in chat, *"what's open on the 3-6-9 question?"* falls
back to ordinary routing (no inquiry packet) — behaviour byte-identical to pre-R6. **Unset the var
afterward** (default ON; never leave `off` set unless rolling back).

---

## 5. Regressions — nothing else moved
- **R1 cited recall:** *"What does Tesla actually say about the sun's energy in that essay?"* → still
  answers with 〔…〕 refs and class labels (if that source is ingested).
- **R2 negative seed:** *"Did Tesla write 'if you only knew the magnificence of the 3, 6 and 9…'?"* →
  **"no primary source on file"**, zero fabricated citation.
- **R3 / CM1 checkers:** *"check this claim: the digital root of 2^n cycles with period 6"* → **OBSERVED
  through N**; *"are 220 and 284 amicable?"* → **VERIFIED** + Thabit citation. Unchanged.
- **Upgrade-pressure spine:** *"did you prove the vortex idea?"* → **"No"** + kernel/leap split.
- **Existing notebook read:** *"where are we on collatz?"* → the normal thread packet (NOT the inquiry
  packet — only the "what's open / open question / where do we stand / inquiry" family upgrades).
- **Fleet + wallet:** one fleet turn + one wallet turn answer normally — **no inquiry-lane hijack**
  (`looksInquiryRead` is silent on them; number-masking + Bolt sync untouched).

---

## Offline gate (already GREEN before deploy)
- `tests/buildR6_inquiry_ledger.test.js` — **72/72** (assembly, seed match, verdict/classify,
  kill-switch, additive write vocab regression, static wire guards: api=12, no migration).
- `tests/buildR6_inquiry_ledger.test.ps1` (PS-5.1 ASCII mirror) — **48/48** (real seed-pack match +
  class + verdict + read-regex + static wire).
- Regression: `buildR1` 74/74 · `buildR2` 51/51 · `buildR3` 67/67 · `buildR4` 71/71 · `buildCM1` 99/99 ·
  `notebook-verify` 54/54 · `notebook-readscope-verify` 10/10 · `intent-routing-verify` 26/26 ·
  `intent_gate_test` GREEN — no new fails.
