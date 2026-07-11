# Build-R1 — "Cited source spine" · LIVE TEST

Prod: **https://m8-alpha.vercel.app** · kill-switch **`M8_CITED_RECALL`** (default ON; set to
`off`/`0` in Vercel env to revert to pre-R1 rendering, byte-identical).
Run these AFTER the deploy is READY. Test-session `m8_conversations` rows are purged after.

---

## 0. Health
```
GET https://m8-alpha.vercel.app/api/health
```
Expect `ok`, providers + Supabase healthy, `sha` == the deployed commit.

## 1. WIN-1 — ingest the first real source (his paste)
In M8 chat, attach / paste **Nikola Tesla, "The Problem of Increasing Human Energy" (1900)**
(public-domain plain text — Gutenberg/Wikisource), then send:
```
ingest this as a book: title=The Problem of Increasing Human Energy, author=Nikola Tesla, year=1900, source_class=established, public_domain=true
```
**Expect:** `Ingested "The Problem of Increasing Human Energy" as established — N chapters,
X nodes written to the graph…` with `source_id`(s).
Note one `source_id` from the reply (call it **N**).

## 2. Source card records the citation (D5)
```
GET https://m8-alpha.vercel.app/api/knowledge?fn=source-card&id=<N>
```
**Expect JSON:** `source_class:"established"`, a `citation` string
`"Nikola Tesla, The Problem of Increasing Human Energy (1900), <chapter>"`,
`citation_incomplete:false`, `node_counts:{established:…}`, `sample_claims:[…]`.

## 3. WIN-2 — a content question comes back CITED + class-labelled
In chat:
```
What does Tesla actually say about the sun's energy in that essay?
```
**Expect:** an answer whose claims carry a verbatim `〔Nikola Tesla, The Problem of Increasing
Human Energy (1900), …〕` reference and read as **established** (what the essay says — never
"the physics is proven"). Nothing uncited is presented as sourced.
→ **Paste the real reply into the BUILD_LOG row** (verify-before-claiming).

## 4. WIN-3 — misattributed quote → honest, ZERO fabricated citation
```
Did Tesla write "if you only knew the magnificence of the 3, 6 and 9…" in that essay?
```
**Expect:** "That quote is **not in any source on file**" (or equivalent) with **NO** fabricated
〔…〕 citation. (The positive negative-seed is R2; R1's bar is: never invent a citation.)

## 5. Regression canaries (the spine holds)
- `test the doubling digital-root claim` → existing kernel-conjecture **OBSERVED through N**
  narration, unchanged (never "proven").
- `did you prove the vortex idea?` → **"No."** + the mod-9 kernel (established) vs the energy
  leap (speculative) split — upgrade-pressure spine intact.
- `how are my drivers doing today` → **fleet** packet (no citation lane theft).
- `how much did I spend this week?` → **wallet** (no theft).
- Any existing "what does my CV say about …" now also renders cited
  `〔<CV source title>〕` — an improvement, still his data, still honest.

## 6. Kill-switch identity (optional revert proof)
Set `M8_CITED_RECALL=off` in Vercel → redeploy → repeat step 3: the KG grounding lines
render exactly as pre-R1 (`[Claim] label: content`, no 〔…〕, no directive). Restore to ON.

---
**Doctrine bar (all must hold):** never a fabricated citation (FP=0) · established = what the
source SAYS, not that it's true · never "proven" without Lean · speculative stays speculative.
