# M8 Travel / Trip-Planning Lane — meaning-first inference, confirm-inferred-context, slot-filling (SPEC)

**Author:** Fable 5 (spec only, no code) · xhigh reasoning · 2026-07-03
**Executes:** Opus, from this spec, as **B-182 (travel-core, Phase A)** then **B-183 (travel-flights, Phase B)** — two independently shippable, independently killable deploys. Renumber if another build lands first. [FABLE] decisions and Muhammad checkpoints marked explicitly.
**Why:** Muhammad's framing (memory `m8-travel-lane-project`): travel is a **CORE investment, not a travel feature** — it is the cleanest live testbed for three primitives every lane needs: (1) **meaning-first intent** ("I'm travelling to Alexandria" recognised by meaning, never a new keyword lane — his #1 rule), (2) **confirm-inferred-context** (M8 infers origin=Riyadh from his profile and SAYS SO, inviting correction — the antidote to silent wrong assumptions, the same disease as drift), (3) **LLM slot-filling** (where / when / how-many extracted by meaning, carried across turns). The user-visible payoff: cheapest flights (dates / airline / hours) → booking LINK; hotels; restaurants + local recommendations; attractions / itinerary; family-destination ideas. **HARD BOUNDARY: M8 finds, plans, and hands a LINK — Muhammad confirms and PAYS. No autonomous booking or payment, ever** (§D8, the wallet confirm-before-write ethos taken to its limit: the "write" is money movement, so the human does it entirely).

**Strategy placement:** travel is NOT in the locked H2 roadmap (E1–E8, `STRATEGY_2026H2.md`) and NOT on its STOP list. The context-quality core it was queued behind has landed (B-176 gate, B-178/179 context-signal, B-181 relation recall — all ✅). Timing is Muhammad's call (§10).

---

## 1. Audit — what exists today (verified against live code 2026-07-03, worktree off origin/main HEAD 07cdbeb)

### 1.1 A thin travel path ALREADY exists — Phase A is an upgrade, not a greenfield

| Piece | File:line | What it does today |
|---|---|---|
| Travel phrasings → LIVE_DATA | intentClassifier.js:129-137, :155 | `/\b(travel|traveling|travelling|trip|getaway)\b/`, flights, fly from/to, airline, depart/arrive + Arabic سفر/طيران/رحلة/حجز فندق → `INTENT.LIVE_DATA` |
| Specificity gate (zero-LLM clarify) | lib/slots.js:52-78, :124-138 | topics `flights` (needs destination+date), `hotels` (location+date), `restaurants` (location); missing slot → 1–2 question clarification (EN+AR) instead of a garbage search |
| Origin enrichment | slots.js:19, :141-149 | `USER_HOME = "Riyadh"` **hardcoded**; `rewriteQuery` appends `from Riyadh` + year to flight searches |
| Slot carry across turns | orchestrator.js:777-791 | `findClarificationContext` merges the answer-to-our-question with the prior query (regex-era slot-filling) |
| Origin transparency rule | orchestrator.js:227 | `SEARCH_DIRECTIVES.LIVE_DATA` rule 5: *"you may assume Riyadh (his home) but you MUST say so explicitly … Never assume the origin silently"* — confirm-inferred-origin exists as a **prompt hope**, not a composed guarantee |
| Web search waterfall | lib/search.js | Serper (2,500/mo free) → Tavily (1,000/mo free); env-gated, fails safe to empty |
| Serper normalization | lib/tools/serperSearch.js:27-33, :39-74 | per-category params (LIVE_DATA = past-day freshness), 7s hard timeout, answerBox/organic → `{results, answer}` |
| Empty-search honesty guard | orchestrator.js:5598 | search ran but returned nothing → say so, never fabricate |
| Search execution slot | orchestrator.js:5291-5358 | clarify gate (`checkSpecificity` :5298) → SLOT 2 `search(rewriteQuery(...))` :5335/:5349, guarded off every deterministic lane |
| Never-decline + confirm ethos | orchestrator.js:126-134, :214 | ABILITIES ¶ hard rule: never claim a missing ability; confirm back or ask ONE short question |
| Stream behaviour | orchestrator.js:6244, :6526-6527 | search/clarify/doc turns **always delegate** stream → buffered `orchestrate()` — travel has **ONE compose site** to wire (no B-178 two-site drift trap) |

**What's missing (the actual Phase A work):** recognition is regex-only (paraphrases like "we want to get away somewhere over Eid" fall through); slot extraction is token-presence, not meaning (slots.js can't read "with the kids in August"); origin is hardcoded, not profile-driven, and the confirm is un-verified prompt text; results are raw SERP snippets (no real prices/times guarantee); **no booking links are ever composed** (the directive even says *"Do not say 'try Skyscanner'"* — but gives nothing clickable instead); no multi-need orchestration (flights+hotel+food+itinerary in one trip context).

### 1.2 The routing stack a travel turn passes through (post-B-176/181)

1. **Registry** (capability-registry.js:52 DOMAINS, :95-107 REGISTRY) — 11 domains; travel vocabulary is NOT a domain; `WEB_PRESENT` :93 carries `flights?|hotels?|airbnb` + طيران/فندق at present-level (score 1).
2. **Intent gate** `resolveIntent` (:186, threaded at orchestrator.js:3846) — registry-primary; positive signal beats the arbiter's `*_context` lean (:3854); wallet⇄fleet arbiter stays senior for money safety (:209-217).
3. **Semantic tiebreaker** (semantic-router.js, B-164/165; orchestrator.js:3862-3885) — embedding EXEMPLARS per domain, cosine match; currently only breaks medium-band write-lane contests, but the exemplar mechanism is the sanctioned **meaning-first** surface.
4. **classifyIntent** (intentClassifier.js) — the web-search intent (LIVE_DATA/LOOKUP/…) driving the clarify gate + SLOT 2.
5. **decideAction** (router.js:46) — free-LLM tool router for the NONE slice; its own prompt already lists flights/prices as "search" (:57) — the catch-all that guarantees no false "I can't".
6. Fixture: `tests/fixtures/routing_phrasings.json` — 81 cases (`{id, lang, tier, domain, must_not, msg, extract}`), the regression bar for any registry change.

**Today's live trace for "I'm travelling to Alexandria":** registry scores 0 (no travel row) → classifyIntent LIVE_DATA (:134) → checkSpecificity: destination present, date missing → asks "on what dates?" → answer merged (:777) → Serper search "…from Riyadh 2026 flight ticket price" → LLM answers from snippets under the :227 origin rule. It half-works — by keywords, with SERP-snippet quality, no links, no memory of his family, and the origin confirm depends on the model obeying a ¶.

### 1.3 The Vercel function inventory — the 12-cap is FULL (and the escape hatch is already built)

`api/*.js` (each = one function, Hobby cap 12): **chat-stream · chat · cron-explore · cron-summarize · cron-verify · export · files · knowledge · morning-brief · ops · tasks · transcribe = 12/12.**

But `vercel.json:3-20` already implements the consolidation pattern: 16 logical endpoints are REWRITES into 4 functions (`/api/wallet` → `/api/ops?fn=wallet`, `/api/notes` → `ops?fn=notes`, ingest/presign/deck/health… → knowledge/files/export/ops) with implementations in `lib/handlers/*.js`. `STRATEGY_2026H2.md` standing constraints codify it: *"Vercel 12-fn cap FULL (reuse `api/ops?fn=`)"*. §D7 uses this — **zero new functions needed.**

### 1.4 The confirm-before-write ethos to mirror

- Wallet adds/edits: M8 posts a `🧾 Confirm expense …?` card; the next turn **reconstructs the pending action by parsing M8's own confirm prompt** (orchestrator.js:2328-2412) — stateless, no DB pending-table, state lives in the conversation.
- Task delete: confirm-gated the same way (:1371-1437).
- Travel's equivalent "write" is a PAYMENT — so the pattern terminates at a LINK and the human does the write (§D8).

### 1.5 Env / gotcha facts

- Free-stack keys present: GROQ, GEMINI, SERPER, TAVILY (per B-177 env audit). No travel/flight key exists.
- Every new flag in this spec is **inert until merged + deployed** (the recurring B-169/B-177 trap).
- slots.js header comment says `api/slots.js` — stale (file lives in `lib/`); fix in passing is allowed, nothing else in that file changes in Phase A except §D3's `USER_HOME` env-lift.
- Chips (B-88) are on the STOP-list audit — travel builds NOTHING on chips.

## 2. The two real blockers, solved

### 2.1 Blocker 1 — flight data needs an API and ONE new key (a stated deviation from no-new-keys)

Live SERP snippets cannot reliably give "cheapest flight, airline, hours, on date X" — that data lives behind flight APIs. Evaluated 2026-07-03 (live web check; SerpApi numbers read off serpapi.com/pricing; Amadeus model confirmed via developers.amadeus.com — exact per-API quota only visible after signup):

| Option | Free tier | Data quality | Payment-boundary risk | Verdict |
|---|---|---|---|---|
| **Amadeus Self-Service** | Free **test env** (limited/cached data, no card); production keeps a **free monthly quota per API**, then pay-as-you-go **€0.001–0.025/call** | Real GDS: airline, flight number, times, price (supports `currencyCode=SAR`), 400+ airlines | **Search-only endpoints**; booking (`Flight Create Orders`) is a SEPARATE API/contract we never integrate — structurally cannot book | ✅ **[FABLE] RECOMMENDED** |
| SerpApi Google Flights | 250 searches/mo free; $25/mo for 1,000 (verified 2026-07-03) | Google Flights quality (excellent) | none (read-only SERP) | Viable alternative / future tier-2 fallback |
| Kiwi Tequila | affiliate-approval based; open self-serve status could NOT be verified | good | deep-link based | ❌ not dependable for a personal tool |
| Travelpayouts / Aviasales | free (affiliate signup) | **CACHED** prices — stale by design | link-based | fallback-quality only; not primary |
| Duffel | per-order fees | booking-grade | **IS a booking/payment API** | ❌ violates the §D8 boundary by design |
| Skyscanner / Booking.com official | partner-only | — | — | ❌ inaccessible |

**Stated plainly:** Phase B legitimately needs **one new key pair** (`AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET`) — the first deviation from M8's no-new-key rule. Cost at Muhammad's volume (a handful of trips/year, tens of searches/mo): **SAR 0** inside the free quota; the recommended stance is free-quota-only (§10). Privacy: the API receives only route + dates + passenger COUNTS — no names, no money figures, no personal data; the wallet privacy wall is untouched (flight prices are external data, not his money). He creates the account and sets the env vars himself — values never pasted in chat (standing rule). Phase A needs **no key at all**.

### 2.2 Blocker 2 — the 12-function cap: the exact plan

**Decision: ZERO new functions, at both phases.**
1. **Phase A** adds no HTTP surface at all — everything runs in-process inside the existing chat turn (the same way `lib/search.js` is not an endpoint).
2. **Phase B**'s flight search is `lib/tools/flightSearch.js`, called in-process from the travel packet inside `orchestrate()` — architecturally identical to `lib/tools/serperSearch.js`. The PWA talks only to `/api/chat*`; no client-side flight endpoint exists or is needed.
3. **If** a standalone surface is ever wanted later (e.g. a "refresh prices" widget), the established mechanism is one rewrite line + one handler, still 12 functions:
   `vercel.json`: `{ "source": "/api/travel", "destination": "/api/ops?fn=travel" }` + `lib/handlers/travel-api.js` + one `case` in `api/ops.js` (`ops` maxDuration 30s comfortably covers a 7s-timeout flight call). **NOT built now** — recorded so nobody ever burns a slot on this.

## 3. [FABLE] The decisions

**D1 — Travel becomes a REGISTRY domain + semantic exemplars — not a new keyword lane.** The #1 rule bans new word-catch ACTION lanes; the registry is the *sanctioned single home* for ownership vocabulary (B-155's contract: "adding an ability is a registry line, not a new parser"). Today travel vocabulary is scattered across THREE files (intentClassifier :131-137/:155, slots.js TOPICS :52-66, WEB_PRESENT :93) — exactly the pre-B-155 whack-a-mole. So: add `travel` to `DOMAINS` (between `memory` and `web`, so money/write lanes keep tie-break seniority) and a `REGISTRY.travel` row whose vocabulary CONSOLIDATES those three sources — strong: flight/fly-to/hotel-booking/itinerary/trip-to + سفر/طيران/حجز رحلة phrasings; present: softer travel nouns; actions `["search","read"]`. Simultaneously add ~6 travel EXEMPLARS to semantic-router.js so zero-keyword paraphrases ("we want to get away somewhere over Eid with the kids") land by MEANING — and `decideAction`'s search catch-all (:57) + the ABILITIES never-decline rule remain the floor: no phrasing can produce a false "I can't". **No new regex ever parses a slot VALUE** — recognition regexes are ownership signals only (same standing as every other domain's row); extraction is D2's LLM. Gate: when `M8_TRAVEL_LANE=off`, `scoreMessage` skips the travel row entirely → routing is byte-identical to today (unit-tested identity). Downstream, `travel` maps to the existing web/search lane with a travel packet (D5) — a soft lane, NOT a deterministic hard-route (no new integrity moat needed; nothing here owns ground truth).

**D2 — Slot-filling by meaning: one LLM trip-state extractor, stateless.** New `lib/travel.js` → `extractTripState({ message, history, homeCity })`: one free-stack LLM call (the router.js pattern — `ROUTER_PROVIDER_ORDER`, temp 0, `maxOutputTokens≈300`, `parseJsonLoose`) over the last ~6 turns, returning:
`{ origin:{city,iata,source:"stated"|"profile"|"confirmed"}, destination:{city,iata}|null, dates:{depart,return,flex}|null, party:{adults,children}|null, needs:["flights"|"hotels"|"food"|"attractions"|"itinerary"|"ideas"], missing:[...] }`.
State is **reconstructed from the conversation each turn** — the wallet way (:2328's parse-our-own-prompt precedent), no pending-table, no schema migration. Fail-safe: any throw/unparseable output → `null` → the ENTIRE travel packet is skipped and the turn runs today's path (classifyIntent + slots.js + search) — degraded behaviour is exactly current prod, never worse. slots.js stays as the zero-LLM pre-gate; when the travel packet is active it OWNS clarification (one question max, from `missing`) and the :5298 regex clarify is bypassed for that turn — two clarifiers must never both fire.

**D3 — Confirm-inferred-context: infer → state it + source → invite correction → remember the confirmation.** Origin resolution order: (1) **stated** in conversation; (2) **profile** — the pinned profile memory rows already injected every turn (the "Sara is your wife" tier); (3) fallback `M8_HOME_CITY` env, default `Riyadh` (lifting slots.js:19's hardcode). When source ≠ stated/confirmed, the composed travel packet includes a deterministic ORIGIN line and the directive REQUIRES the reply to open by confirming — e.g. *"Assuming you're flying from Riyadh — tell me if not."* — upgrading the :227 prompt-hope into a composed, acceptance-tested guarantee. A later affirmation/correction is read by D2 from history → `source:"confirmed"`, and the confirm line is dropped. **This is the reusable core pattern** (document it as such in the code header): any lane that infers context must (a) state the inference, (b) name its source, (c) invite correction, (d) treat confirmed ≠ inferred. No DB writes anywhere in this flow.

**D4 — Booking links: a deterministic composer; the LLM never writes URLs.** `buildBookingLinks(trip)` in lib/travel.js — **pure**, PS-5.1-mirror-testable: Google Flights (`https://www.google.com/travel/flights?q=Flights+from+RUH+to+HBE+on+2026-08-14` — keyless natural-language q), Skyscanner (`…/transport/flights/ruh/hbe/260814/260821/`), Booking.com (`searchresults.html?ss=<city>&checkin=&checkout=&group_adults=&group_children=`), Google Maps (`maps/search/restaurants+in+<city>`). Links are composed ONLY from validated fields (IATA `^[A-Z]{3}$`, ISO dates); a missing field omits that link — never a broken/guessed URL. The packet injects them as a `LINKS` block; the travel directive orders: *present links ONLY from the LINKS block, never construct or invent a URL* (the anti-hallucination twin of the empty-search guard). IATA codes come from the extractor, shape-validated; Phase B adds a resolver (D6). The reply must NAME the airports ("Riyadh RUH → Alexandria Borg El Arab HBE") — same transparency contract as D3, and the human catch for a wrong code.

**D5 — The travel packet: multi-need orchestration inside the existing SLOT-2 lane, search-budgeted.** When the gate resolves `travel` (flag on) and D2 returned a trip: clarify-once if `missing` blocks the primary need → else run searches via the EXISTING `search()` waterfall, capped by `M8_TRAVEL_SEARCH_CAP` (default 2/turn — Serper+Tavily give ~3,500 free/mo; a trip turn must not eat the month): live-priced needs search (flights pre-B, hotels, "best restaurants right now"); stable content (itinerary structure, attractions, destination ideas) comes from model knowledge + links — explicitly allowed, it's evergreen — while the empty-search honesty guard (:5598) keeps governing every searched claim. Directive: a `TRAVEL` entry in `SEARCH_DIRECTIVES` (supersedes LIVE_DATA rules for travel turns, keeps rules 1-4 verbatim, upgrades rule 5 to the D3 composed confirm, adds the D4 links rule and the D8 boundary line). Compose site: buffered `orchestrate()` only — stream turns in this class already delegate (:6244/:6526). Telemetry: existing `log()`/`logRoute` breadcrumbs (`travel:extract`, `travel:search`, `travel:links`), sizes/counts only — **no destination names or trip content in telemetry rows** (B-168 privacy contract); no new tables.

**D6 — Phase B: Amadeus Self-Service, as a tier-0 provider in a fail-safe waterfall.** New `lib/tools/flightSearch.js`: OAuth2 client-credentials token (cached in-module, warm-instance), `GET /v2/shopping/flight-offers?originLocationCode&destinationLocationCode&departureDate&adults&children&currencyCode=SAR&max=5`, 7s hard timeout (the serperSearch discipline), normalized to `{ offers:[{price, currency, carrier, flightNumber, departISO, arriveISO, durationMin, stops}], source:"amadeus" }`. `AMADEUS_ENV=test|production` selects `test.api.amadeus.com` vs `api.amadeus.com`. Waterfall for the flights need: **flightSearch → (any failure/empty) web `search()` → (empty) links-only + honesty guard** — Phase B off or broken IS Phase A, automatically. City→IATA: extractor's code when shape-valid, else Amadeus **Airport & City Search** (same key, free) resolves it; always echo airport names (D4). Hotels live-search (Amadeus Hotel Search, same key) is a marked OPTIONAL extension (§10 call 4) — links-only until then. Rate care: ≤1 flight call/turn; quota exhaustion → waterfall degrades, never errors at the user.

**D7 — Functions: none.** Per §2.2 — in-process tools only; the `ops?fn=travel` rewrite is the documented future hatch, not built.

**D8 — The payment boundary, enforced structurally (the non-negotiable).** M8 finds, plans, and hands a LINK; **Muhammad confirms and pays on the airline/hotel site.** Five locks:
1. **No booking API exists in the integration** — Amadeus scope is Flight Offers Search (+ Airport & City Search, optionally Hotel Search). `Flight Create Orders` (the booking endpoint) is a different API requiring a separate contract; the code CANNOT book even if prompted/jailbroken.
2. **No payment credential exists anywhere in M8's env** (B-177 env audit; this spec adds only search-scope keys).
3. **The lane's terminal action is composing a link** (D4) — there is no write handler, no vendor POST, nothing after the link.
4. **Prompt layer:** ABILITIES (:126-134) gains: *"Travel — find flights, hotels, restaurants and plan trips, then hand him BOOKING LINKS. M8 NEVER books or pays — he confirms and pays on the airline/hotel site."* — one line that both feeds the never-decline rule AND caps it (M8 must never claim it booked).
5. **Acceptance locks (§8):** the "book it for me" canary must return a link + the boundary sentence; and a grep gate — the diff contains no `flight-orders`, no booking/checkout POST, no card-shaped fields.
This mirrors the wallet ethos exactly: wallet confirms before writing M8's own DB; travel's "write" is real money, so the confirm-and-execute step belongs to the human, entirely.

**Not chosen (and why):** a deterministic travel hard-route (travel owns no ground truth — soft lane keeps the LLM's judgement in play) · a trip DB table / persistent trip object (stateless conversation reconstruction is the wallet-proven pattern; a table = state drift surface) · chips-based UX (B-88 is on the STOP-list audit) · scraping Google Flights/Booking (ToS + flakiness + the free SERP already gives snippets) · Duffel or any bookable API (violates D8 by design) · Gemini grounded-search paid tier (premium stays opt-in OFF) · a new `api/travel.js` function (cap is FULL; §2.2) · regex slot extraction (the whole point is meaning-first).

## 4. Design — what Opus builds, where

### B-182 (travel-core, Phase A — rides today's infra, no new key)
- **capability-registry.js**: `travel` in DOMAINS (before `web`) + `REGISTRY.travel` row (vocabulary consolidated per D1) — row inert when `M8_TRAVEL_LANE=off`; export the signals for the PS mirror.
- **semantic-router.js**: ~6 travel exemplars (EN+AR).
- **new `lib/travel.js`**: `extractTripState()` (LLM, fail-safe null) · `buildBookingLinks()` (pure) · `buildTravelDirective(trip)` (pure — D3 confirm line + D4 links rule + D8 boundary line) · `travelSearchPlan(trip, cap)` (pure — which needs search, which answer from knowledge).
- **orchestrator.js**: in the SLOT-2 region (:5291-5358): when gate domain=`travel` && flag on → extractor → clarify-once path OR travel packet (searches ≤ cap via existing `search()`, LINKS block, TRAVEL directive); bypass `checkSpecificity` for that turn; ABILITIES travel line (:133-134); `SEARCH_DIRECTIVES.TRAVEL`.
- **slots.js**: `USER_HOME` ← `M8_HOME_CITY` env (default "Riyadh", behaviour-identical); fix the stale header comment.
- **tests/**: fixture +~14 travel cases (EN/AR; semantic-tier paraphrase; collisions: "how much did I spend on my trip to Cairo" → wallet must win; "search my notes for the Alexandria trip" → notes; "morning brief" → fleet untouched); kill-switch byte-identity test; link-composer + directive pure tests + PS-5.1 mirrors; extractor replay probe (§5).

### B-183 (travel-flights, Phase B — the one new key)
- **new `lib/tools/flightSearch.js`** (+ IATA resolver via Airport & City Search) per D6, PS-mirrored normalizer.
- **lib/travel.js**: flights need consumes the D6 waterfall; offers rendered as a `FLIGHTS` data block (real prices/times/airlines) above the LINKS block.
- **tests/**: `tests/travel_flight_probe.js` + `.ps1` wrapper (live, keys local-only, never committed, never echoed — the ctx_cache_probe discipline); normalizer unit tests offline.
- **env (Muhammad, click-by-click in the build brief):** create amadeus developer account → Self-Service app → copy `AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET` into Vercel env + `AMADEUS_ENV=test`, redeploy; flip to `production` after the live test passes (his call — production signup may ask for billing details; free monthly quota applies first).

## 5. Probes & canaries

**Probe A — routing identity + fixture (offline, blocking, B-182).** Full fixture green (81 existing + new travel cases). Any EXISTING flight/hotel-phrasing case that now scores `travel` is **relabeled to travel** (expected ownership move — record each in the build report); never narrow the travel vocabulary just to keep an old label. Kill-switch identity: `M8_TRAVEL_LANE=off` ⇒ `scoreMessage`/`resolveIntent` byte-identical on the whole fixture.

**Probe B — extractor replay (offline vs canned turns, blocking, B-182).** ~10 scripted conversations (EN+AR: bare "I'm travelling to Alexandria"; dates-in-follow-up; "with the kids"; origin correction "no, from Jeddah"; the Eid paraphrase) → print message → trip-state table → `reports/build-182-travel-replay.md`. **[Muhammad checkpoint]: he eyeballs the table** — wrong inferences get fixed in the extractor prompt BEFORE ship.

**Probe C — flight live probe (B-183, informative-then-blocking).** Through the real `flightSearch()`: RUH→CAI and RUH→HBE next-month round trips; verdict table (price/carrier/times/latency, test vs production env) → `reports/build-183-flight-probe.md`. Test-env data is limited/cached — verdicts about PRICE ACCURACY are only claimed after the production-env run (verify-before-claiming).

**Live canaries (after each deploy — these ARE the acceptance for the lane):**
1. "I'm travelling to Alexandria" → confirms origin Riyadh EXPLICITLY + asks ONE question (dates) — never both silent-assumes and never interrogates.
2. Follow-up "mid-August, with my wife and the kids" → slots carried; reply covers flights (links; B-183: real offers with airline+times+SAR price), names both airports.
3. "Find me a hotel there" → destination carried from the trip context; Booking link present and well-formed.
4. "Plan 3 days there with the kids" → itinerary from knowledge + attractions; no fabricated "live" claims; links block present.
5. Arabic: "عايز أسافر إسكندرية الشهر الجاي" → same flow in Arabic.
6. **"Book it for me" → link + the boundary sentence (M8 never books/pays) — the D8 canary.**
7. Collisions: "how much did I spend on my trip to Cairo?" → wallet · "morning brief" → fleet · "Sara is your wife" recall — all unchanged (standard drift battery re-run, B-176/181 practice).

## 6. Kill-switch / rollback table

| Lever | Effect | Default |
|---|---|---|
| `M8_TRAVEL_LANE=off` | Registry row skipped, extractor never runs, no packet/links/directive — routing + behaviour byte-identical to pre-B-182 | on (B-182) |
| `M8_TRAVEL_FLIGHTS=off` | flightSearch tier dark → Phase A web-search path | on (B-183) |
| `AMADEUS_CLIENT_ID/SECRET` unset | Phase B dark regardless of flag (env-gated like SERPER_API_KEY) | unset until Muhammad's key |
| `AMADEUS_ENV` | `test` \| `production` endpoints | test |
| `M8_TRAVEL_SEARCH_CAP` | max web searches per travel turn | 2 |
| `M8_HOME_CITY` | D3 fallback origin | Riyadh |
| `M8_INTENT_GATE=off` (existing) | travel row is master-gated by `M8_TRAVEL_LANE`, so gate-off leaves no stranded path (classifyIntent/slots keep working as today) | on |

⚠ All flags inert until merged + deployed. Full rollback of either build = one env flip, no code revert.

## 7. Build plan (Opus executes 0→N)

| # | Step | Files | Owner |
|---|---|---|---|
| 0 | Read-only audit → `reports/build-182-travel-audit.md`: confirm no `M8_TRAVEL_*`/`AMADEUS_*` env exists; check whether a home-city PROFILE memory row exists (D3 source 2) — if none, note that source 3 (env) will serve until he states it in chat once | reports/ | **[OPUS]** |
| 1 | Registry row + DOMAINS + exemplars + fixture cases; Probe A green (incl. relabel log) | capability-registry.js, semantic-router.js, tests/ | **[OPUS]** |
| 2 | `lib/travel.js` (extractor + pure composers) + unit tests + PS mirrors; Probe B replay tables | lib/, tests/, reports/ | **[OPUS]** |
| C1 | **Checkpoint:** Muhammad eyeballs the Probe-B tables; extractor prompt tuned if any inference is wrong | — | Muhammad |
| 3 | Orchestrator wiring (SLOT-2 travel packet, directive, ABILITIES line) + slots.js env-lift; full battery + fixture green. **Ship B-182**: BUILD_LOG row, `tests/BUILD182_LIVE_TEST.md` + live-chat questions, AskUserQuestion deploy OK, prod self-verify (canaries 1-7 on m8-alpha.vercel.app, real responses pasted) | orchestrator.js, slots.js, tests/, docs | **[OPUS]** + Muhammad's OK |
| C2 | **Checkpoint (gate to Phase B):** B-182 verified live + Muhammad's §10 calls answered (API + budget). No key → Phase B parks; Phase A stands alone | — | Muhammad + **[FABLE]** if the API choice changes |
| 4 | `flightSearch.js` + resolver + normalizer tests; Probe C vs TEST env | lib/tools/, tests/, reports/ | **[OPUS]** |
| 5 | Wire the D6 waterfall into the flights need + FLIGHTS block; fallback tests (key unset / API down / empty ⇒ Phase A behaviour) | lib/travel.js, tests/ | **[OPUS]** |
| 6 | **Ship B-183**: battery, BUILD_LOG, live-test MD, deploy OK, prod self-verify incl. a REAL Riyadh→Cairo search on production keys (offer table pasted) + the D8 "book it" canary | tests/, docs | **[OPUS]** + Muhammad's OK |
| 7 | 2-week soak (Sonnet-able): pull `travel:*` breadcrumbs + search/flight-call counts vs quotas; tune `M8_TRAVEL_SEARCH_CAP` via env if needed | reports/ | **[SONNET]** |

## 8. Acceptance criteria

1. **Routing:** fixture fully green (existing cases minus recorded relabels unchanged); travel paraphrase case lands via semantic tier; wallet/notes/fleet collision cases route AWAY from travel; `M8_TRAVEL_LANE=off` identity test passes.
2. **Confirm-inferred-context:** canary 1 live — inferred origin is stated with an invitation to correct, in the reply's opening; after correction, subsequent turns use the corrected origin without re-asking (D3 confirmed-state).
3. **Slot-filling:** canaries 2-3 live — destination/dates/party carried across ≥3 turns with no re-asking and no regex added anywhere in the diff for slot values.
4. **Links:** every travel reply with a resolvable trip carries a LINKS block; all URLs match the D4 templates (unit-tested composer, live spot-check); zero LLM-authored URLs (directive + spot-check).
5. **Phase B data honesty:** flight answers state airline + times + price WITH the source; Amadeus failure degrades silently to Phase A (fallback test); empty results → honesty guard wording, never an invented fare (rules 1-3 of the directive kept verbatim).
6. **Payment boundary (D8):** the "book it" canary returns a link + boundary sentence; diff-grep shows no booking endpoint, no payment field, no vendor POST; ABILITIES line present.
7. **Scope/doctrine:** `api/` stays at 12 functions; ONE new key pair total (Phase B only, Muhammad-created); free-stack LLMs only; telemetry sizes/counts only; no content-regex slot parsing; Bolt sync + 7am brief untouched; number-masking call sites untouched.
8. **Budget:** a travel turn ≤ `M8_TRAVEL_SEARCH_CAP` web searches + ≤1 flight call; soak report confirms monthly usage is a rounding error against 3,500 searches + the Amadeus free quota.

## 9. Blast radius

- 🎮 **Safe:** lib/travel.js, flightSearch.js, exemplars, fixture, probes — pure/new modules, all offline-testable, all behind flags.
- 🔴 **Touches-live at deploy:** capability-registry DOMAINS + the orchestrator SLOT-2 region sit under EVERY prod turn — the same risk profile as B-176, mitigated the same way (fixture + identity tests + flags + the standard drift battery). Bolt sync, 7am brief, crons: **zero edits**. Deploy = the one shared chokepoint; explicit OK per build; self-verify against open prod with pasted real responses.
- **Cost:** B-182 SAR 0 (one extra free-tier LLM call on travel turns only). B-183 SAR 0 at his volume (Amadeus free quota; overage €0.001-0.025/call — but the recommended stance never reaches it). Upside: the confirm-inferred-context + LLM slot-filling primitives land in shared code where every future lane (wallet clarifies, fleet date ranges, knowledge follow-ups) can adopt them — the actual point of the build.

## 10. 🔴 Muhammad's calls (blocking where marked)

1. **Flight API (blocks B-183 only):** Amadeus Self-Service **(Recommended** — real GDS data, genuine free tier, search-only endpoints keep the payment boundary structural**)** · SerpApi Google Flights (250/mo free, best raw data, smaller quota) · skip Phase B entirely (links-only forever). One new key pair either way — the stated deviation from no-new-keys.
2. **Budget stance (blocks B-183):** free-quota-only, degrade to links when exhausted **(Recommended)** · allow pay-as-you-go overage (~SAR 0.004-0.10/call).
3. **Timing (blocks B-182 scheduling):** next Opus build slot **(Recommended** — core context work E1/E2/E3 has landed; travel is the live testbed for the primitives, and E5's monthly miss-ritual runs in parallel unaffected**)** · after E6/E7 · park.
4. **Hotels live-search (non-blocking):** links-only now, Amadeus Hotel Search as a later extension on the same key **(Recommended)** · include in B-183.

---

## Amendment B1 (2026-07-03, Muhammad) — Phase B flight API: Amadeus → **SerpApi Google Flights**

**Why:** the **Amadeus Self-Service portal is being DECOMMISSIONED 2026-07-17** (announced on developers.amadeus.com; Enterprise remains but is a paid contract, not our free self-service path). So §10 call ① and D6 (Amadeus) are void. Pivot to the spec's already-vetted alternative (§3 table: "SerpApi Google Flights — 250/mo free, Google Flights quality, read-only SERP, none payment-boundary risk").

**Decision (supersedes §10 ① and D6):** Phase B uses **SerpApi Google Flights**.
- **Coverage upgrade:** Google Flights data INCLUDES low-cost carriers (Air Arabia, flynas, …) — closes the gap GDS/Amadeus would have had (the exact thing Muhammad asked about).
- **Free tier:** 250 searches/mo (verified 2026-07-03; re-confirm at signup) — ample for his volume; degrade-to-links when exhausted (§10 ② free-quota-only unchanged).
- **Payment boundary intact:** read-only SERP data; NO booking/payment endpoint in the integration (D8 holds structurally, same as before).
- **One key (not a pair):** env `SERPAPI_KEY` (Muhammad creates the serpapi.com account + sets the key in Vercel himself — never pasted in chat). Replaces `AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET`/`AMADEUS_ENV`.

**D6 (revised) for the B-184 build:** `lib/tools/flightSearch.js` calls SerpApi's **`engine=google_flights`** endpoint (`GET https://serpapi.com/search.json?engine=google_flights&departure_id=RUH&arrival_id=HBE&outbound_date=YYYY-MM-DD&currency=SAR&api_key=…`), 7s hard timeout (serperSearch discipline), normalized to the SAME `{ offers:[{price,currency,carrier,flightNumber,departISO,arriveISO,durationMin,stops}], source:"serpapi" }` shape. Everything else in D6 UNCHANGED: same fail-safe waterfall (**flightSearch → web `search()` → links-only + honesty guard**), ≤1 flight call/turn, env-gated by `M8_TRAVEL_FLIGHTS` + `SERPAPI_KEY` (dark if unset = Phase A), always echo airport names (D4). Hotels stay links-only (§10 ④). City→IATA: extractor's shape-valid code, else a small keyless resolver (no Amadeus airport API anymore).

---

## Amendment B2 (2026-07-06, Muhammad) — §10 ④ Hotels live-search: SHIPPED (B-187)

**Why:** a real conversation exposed the gap §10 ④ deferred — a Hurghada hotel search (15-20 Aug) had no live tier, so the LLM fabricated a price table explicitly labeled "based on 2024 Booking.com data" instead of admitting it had no live prices. Separately, that SAME turn leaked a **fleet-domain** error string ("I don't have your fleet data loaded... Boss") into a travel answer — traced to `orchestrator.js`'s `RULE_FLEET_NO_DATA`, which fired on ANY turn without a fleet packet regardless of topic, not just fleet-shaped questions (fixed by scoping the rule's trigger condition to fleet-shaped questions only — `orchestrator.js:95`).

**Decision (supersedes §10 ④):** hotels get the SAME live tier as flights — **SerpApi**, `engine=google_hotels`, on the SAME `SERPAPI_KEY` (no new key, no new env pair) — instead of Amadeus Hotel Search (moot: Amadeus was decommissioned 2026-07-17, per Amendment B1).

**D6b (new) for the B-187 build:** `lib/tools/hotelSearch.js` calls SerpApi's **`engine=google_hotels`** endpoint (`GET https://serpapi.com/search.json?engine=google_hotels&q=<dest,country>&check_in_date=YYYY-MM-DD&check_out_date=YYYY-MM-DD&currency=SAR&api_key=…`), 7s hard timeout (mirrors flightSearch.js), normalized to `{ offers:[{name,pricePerNight,currency,rating,reviews,hotelClass}], source:"serpapi" }`, cheapest-known-price first. Same fail-safe waterfall as flights (**hotelSearch → web `search()` → links-only + honesty guard**), ≤1 hotel call/turn, env-gated by `M8_TRAVEL_HOTELS` + `SERPAPI_KEY` (dark if unset = Phase A, byte-identical). Unlike flights, `google_hotels` requires BOTH check-in and check-out dates — a one-sided or flex-only date falls through to web search, same honesty discipline as a flex-only flight depart date. Booking stays links-only (D8 payment boundary unchanged — Booking.com general link, never a per-property URL).

**Known gap flagged, not fixed in B-187:** `extractTripState()`'s trip schema models a single `destination.city` — a message naming two candidate destinations ("Hurghada or Sharm") can fail to reconstruct a trip, silently skipping the WHOLE travel packet for that turn (this is the likely trigger for the fleet-leak incident above, though the `RULE_FLEET_NO_DATA` scoping fix neutralizes the symptom regardless of this mechanism). Worth a future session if it recurs.

---

## Amendment B3 (2026-07-06, Muhammad) — Direct booking links (per-hotel + fetch-on-pick flights)

**Why:** Muhammad asked why M8 only ever gives a generic search-page link (Google Flights/Skyscanner/Booking.com pre-filled with route+dates) instead of a direct link to the SPECIFIC flight or hotel it recommends.

**Decision, per Muhammad's explicit choice on the trade-off:**
- **Hotels:** add the direct link now, no trade-off — SerpApi's `google_hotels` response already includes a link per property (and often per-OTA-site links in a `prices[]` array), `hotelSearch.js` just wasn't capturing it. Zero extra cost, zero extra latency.
- **Flights:** SerpApi's base flight search returns NO bookable link, only an opaque `booking_token` per itinerary — a real link requires a SECOND SerpApi call (`booking_token` redemption) per flight. Muhammad chose **fetch-on-pick**: never fetched for all 5 offers shown (would burn quota 5x per search against the 250/mo free tier); only redeemed when he picks ONE specific offer in a follow-up ("book the first one", "get me a link for the cheapest").

**D6b addendum (hotels):** `normalizeHotels()` now captures `link` per offer — preferring a named OTA-site link from `prices[]` (e.g. a direct Booking.com URL for that exact property) over the generic Google-Hotels `property.link`. `renderHotelsBlock()` appends the link to each row. No new key, no new call.

**D6c (new, flights):** `normalizeFlights()` now captures `bookingToken` per offer (SerpApi's `booking_token` field). `lib/travel.js` adds two PURE, deterministic helpers — `wantsFlightBookingLink(message)` (a booking/selection SIGNAL: "book/reserve/select the first/cheapest/#N one", "link for…") and `resolveFlightSelection(message, offers)` (matches an ordinal, "cheapest", or a unique carrier-name mention against the offers ALREADY shown this turn — returns null on ANY ambiguity, never guesses). These are a narrow, list-index-selection parse WITHIN an already meaning-routed travel turn — the same category as the existing B-171 task-ordinal resolver — not a new top-level keyword intent lane (Muhammad's standing rule). When both fire, `lib/tools/flightSearch.js`'s new `getBookingLink()` redeems the selected offer's token via a second SerpApi call (same route/date params + the token); `extractBookingLink()` parses the response defensively and ONLY returns a plain clickable GET link — a `booking_request` that requires a form POST (`post_data` present) is deliberately rejected as unusable rather than handed over as a broken "link." A DIRECT BOOKING LINK block renders above the generic BOOKING LINKS block when a redemption succeeds; on any failure/no-match/no-plain-link, the packet silently degrades to the generic links exactly as before this feature existed (same fail-safe-waterfall discipline as everything else in this lane).

**Status: 🟡 offline-tested, live-verified via a real prod conversation (not a local key-gated probe)** — see BUILD_LOG.md B-188 for the actual self-verify transcript against `m8-alpha.vercel.app`.

---

## Amendment B4 (2026-07-06, Sonnet) — multi-candidate destination gap: FIXED (B-189)

**Fixes the B-187 known gap above.** `extractTripState()`'s JSON schema gains an optional `"destinationCandidates":[{city,iata}]` field, filled ONLY when the model reads 2+ named candidate destinations and no decided one ("hurghada or sharm", "thinking Bali or Phuket"). `normalizeTrip` keeps the trip alive in that case — `destination:null`, `destinationCandidates` populated (deduped case-insensitively, capped at 4) — instead of discarding the whole trip. The EXISTING clarify-once mechanism (`travelClarify` — the same one-blocking-question composer that already handles "flights need but no dates") now checks the ambiguous-destination case FIRST, before origin/dates are ever touched, and returns the ONE disambiguating question via a new pure composer `destinationChoiceClarify` (e.g. "Hurghada or Sharm El Sheikh — which one did you mean?", Arabic mirrored). `orchestrator.js`'s gate widens to also reach `travelClarify` when the destination is ambiguous (previously it only fired when a single `destination.city` existed); the ambiguous branch always returns a clarify string by construction, so booking-link/flight/hotel packet-building code is unreachable until he picks one. `resolveOrigin`/`canonicalizeTripIata` are now explicitly gated to only run once a destination is actually resolved (they were unconditional before, and would have thrown on a null destination in the ambiguous branch).

**Meaning-first, no new keyword lane:** this is still the ONE existing LLM extraction call plus the ONE existing deterministic clarify-once composer, extended to a second blocking condition — no regex, no new action lane, no new pending-table (same stateless-reconstruction design as the rest of this file).

**Built in parallel with Amendment B3 above (direct booking links) — renumbered B-188→B-189 on rebase** since both sessions independently claimed "B-188" before either pushed; this build's changes to `lib/travel.js`/`lib/orchestrator.js` are non-overlapping insertions alongside B3's (`destinationChoiceClarify` vs `renderDirectBookingLinkBlock`), confirmed conflict-free by the full regression sweep.

**Zero migration · zero new key · zero new `api/` fn.** Tests: `tests/build189_travel_multi_destination.test.{js,ps1}` (31/31 each); regression: `build183_travel.test.js` **68/68**, `build187_hotel_search.test.js` **56/56**, `build188_direct_booking_links.test.js` **43/43**, `intent_gate_test.js` **101/101** (added canary `travel-two-candidate-dest` to `tests/fixtures/routing_phrasings.json` — the routing layer still resolves this phrasing to `travel`, never `fleet`, regardless of the downstream extractor), full `tests/*.test.js` sweep green, full `tests/*.test.ps1` sweep green, `orchestrator.js` `require()`-loads without error.
