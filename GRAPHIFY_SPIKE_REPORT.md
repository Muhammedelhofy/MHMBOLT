# Graphify Token-Savings Spike — M8 Codebase

**Header:** Sonnet · low-med
**Date:** 2026-07-04
**Scope tested:** angle ① only — codebase→knowledge-graph token savings for Claude Code navigating M8. Angle ② (Obsidian/second-brain) was explicitly NOT tested — Muhammad already has that via Muhammad-OS + file memory, so it's redundant by design.
**Isolation:** ran in a throwaway git worktree (`graphify-spike-throwaway`) branched off M8's `origin/main` (45cfece), in the scratchpad. Never touched the live M8 tree, never staged/committed/pushed anything, no Supabase/Vercel writes. Confirmed the in-progress Build-R1 files (`lib/knowledge-intake.js`, `lib/orchestrator.js`, `api/knowledge.js`, `lib/handlers/source-card.js`, `tests/buildR1_*`, `BUILDR1_LIVE_TEST.md`) were never opened or edited.

## Verdict: **KILL** (for this angle, on this codebase, right now)

Not "re-test-later" — the failure mode isn't "immature tooling," it's structural: M8's real documentation lives in comments and system-prompt strings, and graphify's code path (tree-sitter AST) deliberately does not index that. That won't change with a version bump. Re-test only if you're ever evaluating it for a *different*, comment-sparse/high-boilerplate codebase.

---

## 1. Install & index friction

| Step | Result |
|---|---|
| `git clone https://github.com/safishamsi/graphify` | **403 — "Repository Graphify-Labs/graphify is disabled."** GitHub itself has suspended the canonical repo/org (reason unknown). `raw.githubusercontent.com` still serves file content via CDN cache, which is how the README/install instructions were retrieved. |
| Install | `pip install graphifyy` (note the extra "y" — README says the real `graphify` PyPI name is "temporarily" reclaimed elsewhere). Flagged by the permission classifier as an unverified external install; I stopped and got your explicit go-ahead before installing, given the disabled-repo signal. |
| Install cost | ~20s, all prebuilt wheels (tree-sitter grammars for 25+ languages, networkx, numpy, rapidfuzz). No compiler needed on Windows. Clean, no errors. |
| Index build (code-only, no LLM) | **7.6s** for 109 JS files (`lib/`, `api/`, `js/`) → 1,831 nodes / 4,820 edges. Genuinely free — pure tree-sitter AST, zero network calls, zero LLM tokens. |
| Running on the **real** M8 tree as-is | **Hard error.** M8's folders mix code with 222 markdown docs, 1 PDF, 3 images in the same tree. Graphify refuses to run at all unless you either scope the path to code-only dirs (what I did) or supply an LLM key (`GEMINI_API_KEY`/`ANTHROPIC_API_KEY`/etc.) for the doc/image semantic pass. So "just run `/graphify .`" on M8 as it actually sits is **not** free-stack-compatible out of the box — you must consciously carve out a code-only subset first. |
| `graphify benchmark` (the tool's own token-savings measurement) | **Crashes.** `KeyError: 'links'` — the benchmark script expects the clustered-graph schema (`links` key) but the free/no-key `--no-cluster` output uses a different schema (`edges` key). Couldn't verify the vendor's own 71.5x claim on this corpus using their own tool; had to hand-measure below. |

No paid API tokens were spent. No key was required for the code-only path tested.

## 2. The 3-question test

All three are real "how does X work" questions about live M8 subsystems. For each: naive tokens = what I'd actually read (grep, then targeted reads/excerpts — not blind whole-file slurps) to give a **complete, correct** answer. Graphify tokens = best-effort `query`/`explain` output. Token counts are chars/4 (standard estimate), measured on real output, not guessed.

| # | Question | Naive (complete answer) | Graphify best attempt | Graphify complete? |
|---|---|---|---|---|
| 1 | How does the travel-lane flight-search fail-safe waterfall work? | **~3,390 tok** (grep hits + full `flightSearch.js` + `orchestrator.js` excerpt) | 1st try: 1,270 tok — **wrong subsystem** (matched "safe"/"search" → dumped the fleet-analysis code). 2nd try, rephrased with real fn names: **~590 tok**, right files this time. | **Partial.** Gets the call topology (`searchFlights → orchestrate → search()`) but nothing about the 7s timeout, `M8_TRAVEL_FLIGHTS`/`SERPAPI_KEY` gating, or the "never error at the user" honesty guard — that's all in comments. |
| 2 | Where is the payment/money boundary enforced (M8 links, user pays)? | **~500 tok** — one `grep -C1 "payment boundary"` found the exact answer instantly (`lib/travel.js:409`, the literal system-prompt rule text) | query: 501 tok, **wrong subsystem** (matched "user" → dumped `stateEngine.js`, unrelated). `explain "buildTravelDirective"`: 87 tok, right node, **zero content** — just shows it calls `homeCity()`/`originInferred()`, nothing about the boundary itself. | **No.** Never surfaced the actual enforcement mechanism (it's a string literal, not a graph edge). Grep alone was both cheaper and correct on the first try. |
| 3 | How does context-cache measure a cache hit? | **~2,970 tok** (full `context-telemetry.js` + `llm.js` excerpt around `extractUsage()`) | query: 1,570 tok, **misses `lib/llm.js`/`extractUsage()` entirely** — the actual mechanism — and pads the answer with unrelated `context-signal.js` internals. `explain "extractUsage"`: 85 tok, right node, but no field-mapping detail (`cachedContentTokenCount` vs `prompt_tokens_details.cached_tokens`), which is the whole point of the question. | **No.** Same failure shape as Q2 — correct-node structure, no semantic payload. |

**Average, raw tokens (best-effort graphify vs naive):** graphify ≈ 42% fewer tokens on average — but this number is the misleading one. In 2 of 3 cases graphify's answer was **factually incomplete or pointed at the wrong code entirely**, so a real workflow still has to fall back to grep+read to actually answer the question. Once you add that fallback cost, using graphify **net increases** total tokens spent in 2/3 cases (you pay for the wrong/shallow graph answer, then pay for the naive read anyway on top).

## 3. Why it fails on this codebase specifically

Two independent problems, not one:

1. **Free-text `query` is fragile.** It BFS-matches question words against node *labels* (function/file names). When a question's wording happens to overlap a same-named-but-unrelated function ("fail-**safe**" → a real function literally named `safe()` in an unrelated fleet module; "**user** pays" → `userTurns()` in the state engine), it confidently walks off into the wrong subsystem with no signal that anything went wrong. Two of three cold queries did this. You only get a good answer once you already know the exact function name to search for — at which point you've often already found it via grep.

2. **Tree-sitter-only extraction (the free/no-key path) captures structure, not prose.** M8 is unusually comment-driven — kill-switches, gating envs, safety/honesty guards, and the "why" behind a design are almost always written as doc-comments or string literals (e.g. the actual payment-boundary text is a system-prompt string), not as code structure. `explain`/`path`/`query` only surface `imports`/`calls`/`contains` edges. For a codebase like this, the part worth 90% of the token cost to find is exactly the part the graph doesn't index.

The LLM-assisted semantic layer (used for docs/PDFs/images, or `--mode deep` inferred edges) might do better at capturing "why," but that's the redundant-with-Obsidian half we were told not to test, and it costs real API tokens/a key — the opposite of what makes the code-graph angle attractive.

## 4. If you ever want to re-test

Not now, but conditions that would justify another look:
- A future graphify version that indexes doc-comment/string content into query results (not just AST structure), or
- A different, more boilerplate-heavy/less-commented codebase where "what calls what" *is* the whole answer, or
- Using it narrowly as a **structural sanity check** (e.g. "what else calls this before I change its signature") rather than as a "how/why does this work" answering tool — `explain`/`path` were fast (<400 tok) and *accurate* for pure call-topology, just not sufficient alone.

No M8 build sketch is included — the verdict is KILL, not adopt, so there's nothing to ship.

## 5. Honesty note on quality vs tokens

Token count alone would have made this look like a win (~42% average reduction). It isn't one: 2 of the 3 test answers were either pointed at the wrong code or missing the specific fact the question was actually asking for. If this report only tracked token counts and not correctness, it would have recommended adopting a tool that gives wrong or incomplete answers to "how does X work" questions on your own codebase most of the time.

---
*Throwaway spike — nothing committed, nothing pushed, no keys spent. Worktree and code-only test corpus live under the session scratchpad and can be deleted freely.*
