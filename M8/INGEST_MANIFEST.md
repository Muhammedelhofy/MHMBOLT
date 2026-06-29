# INGEST_MANIFEST — Ask-My-Docs

**Session:** Parallel Stream 2 — feat/askmydocs-ingest · Stream CV — feat/cv-ingest · Stream D — feat/askmydocs-enrich  
**Date:** 2026-06-28 (vault notes) · 2026-06-29 (CV PDF + enrich)  
**Status:** ✅ COMPLETE — 6 sources, 44 nodes, **44/44 embedded** (gemini-embedding-001), retrieval verified

---

## What was ingested

| # | Source title | Table row | vault_file | Words | Nodes | Embedded |
|---|---|---|---|---|---|---|
| 1 | Muhammad Hofy — Career Background & Positioning | m8_knowledge_sources id=34 | `Projects/CV + LinkedIn.md` | 108 | 5 | ✅ |
| 2 | Muhammad Hofy — Job Hunt Strategy 2026 | m8_knowledge_sources id=35 | `Projects/Job Hunt.md` | 380 | 5 | ✅ |
| 3 | Muhammad Hofy — Operating Playbook & Fleet Expertise | m8_knowledge_sources id=36 | `Operating Playbook.md` | 350 | 5 | ✅ |
| 4 | Mohamed El-Hofy — Full CV (Updated 2025) | m8_knowledge_sources id=37 | `Mohamed_ElHofy_CV_Updated.pdf` | 490 | 18 | ✅ |
| 5 | Muhammad Hofy — Current Role & Fleet Dashboard Credential | m8_knowledge_sources id=38 | `Projects/Bolt Fleet.md` | 182 | 5 | ✅ |
| 6 | Muhammad Hofy — Kafala & Delivery Fleet Operations | m8_knowledge_sources id=39 | `Projects/Bikes-Keeta Dashboard.md` | 196 | 6 | ✅ |

**Total: 6 sources · 44 concept nodes (IDs 247–290) · 44/44 embedded**

---

## Concept nodes — full index

All in `m8_graph_nodes`, `source='external'`, `source_class='established'`, `mastery_state='ingested'`, `verification_state='unverified'`.

### Vault notes batch 1 (IDs 247–261 · confidence=0.8 · source_doc_id 34/35/36)

| Node ID | kind | label | source |
|---|---|---|---|
| 247 | claim | career-positioning-statement | 34 |
| 248 | claim | careem-supply-manager-egypt-8-years | 34 |
| 249 | claim | current-role-alkhair-alwaffer-riyadh | 34 |
| 250 | claim | bolt-api-fleet-dashboard-built | 34 |
| 251 | claim | full-pnl-across-5-major-platforms | 34 |
| 252 | claim | target-role-senior-ops-supply-ksa | 35 |
| 253 | claim | warm-intro-strategy-beats-cold-applications | 35 |
| 254 | entity | top-target-companies-ksa-2026 | 35 |
| 255 | claim | supply-side-counterparty-key-advantage | 35 |
| 256 | claim | application-pitch-template-ops-supply | 35 |
| 257 | claim | bolt-fleet-profit-model-rental-bonus-tiers | 36 |
| 258 | claim | daily-morning-driver-triage-routine | 36 |
| 259 | claim | driver-management-whatsapp-phone-approach | 36 |
| 260 | claim | 4-point-app-idea-test-framework | 36 |
| 261 | claim | settlement-dashboard-saas-business-idea | 36 |

### CV PDF (IDs 262–279 · confidence=0.9 · source_doc_id 37)

| Node ID | kind | label |
|---|---|---|
| 262 | claim | cv-ten-plus-years-ops-supply-fleet |
| 263 | entity | alkhair-alwafeer-current-role-oct2025 |
| 264 | claim | five-platform-portfolio-100-plus-fleet |
| 265 | entity | careem-egypt-supply-manager-2022-2025 |
| 266 | claim | acquisition-channel-zero-to-15pct-market |
| 267 | claim | indirect-to-direct-100pct-acquisition-shift |
| 268 | claim | cpad-best-in-class-digital-acquisition-channel |
| 269 | claim | rumi-migration-egypt-fleet-to-uber |
| 270 | claim | careem-multi-product-launch-bid-ask-wasally |
| 271 | entity | careem-senior-supply-lead-alexandria-2019-2021 |
| 272 | entity | careem-supply-lead-alexandria-2018-2019 |
| 273 | entity | vodafone-egypt-call-center-manager-2017 |
| 274 | claim | vodafone-top-achiever-q4-2016 |
| 275 | claim | clothes-factory-50pct-revenue-uplift |
| 276 | claim | nine-core-competencies-ops-supply |
| 277 | claim | education-bcom-english-alexandria-university |
| 278 | claim | languages-arabic-native-english-professional |
| 279 | claim | full-career-timeline-2012-present |

### Enrich batch — Bolt Fleet & Kafala (IDs 280–290 · confidence=0.8 · added 2026-06-29)

| Node ID | kind | label | source |
|---|---|---|---|
| 280 | claim | bolt-fleet-50-drivers-target-250-scale | 38 |
| 281 | claim | bolt-dashboard-live-team-tool-handoff-ready | 38 |
| 282 | claim | ambassador-driver-recruitment-model-three-tiers | 38 |
| 283 | claim | driver-onboarding-transfer-or-new-two-paths | 38 |
| 284 | claim | pre-exit-operational-knowledge-capture-july2026 | 38 |
| 285 | claim | kafala-delivery-model-iqama-bikes-platform-profit | 39 |
| 286 | entity | four-platform-delivery-keeta-hs-noon-jahez | 39 |
| 287 | claim | saudi-kafala-compliance-muqeem-tafweed-tamm | 39 |
| 288 | entity | delivery-ops-data-model-bike-courier-dailywork | 39 |
| 289 | claim | supabase-vercel-bilingual-cloud-dashboard-build | 39 |
| 290 | claim | courier-fleet-maintenance-accident-management | 39 |

---

## Embedding status — ✅ COMPLETE (2026-06-29)

All 44 career nodes embedded via `POST /api/knowledge?fn=embed-backfill` with
`source_ids=[34,35,36,37,38,39]`. Result: `{embedded:44, failed:0, total:44}`.
Model: `gemini-embedding-001` (768-dim, free tier).

**Prior state:** the original 33 nodes (sources 34–37) were inserted with NULL embeddings
(deferred in Stream 2). Stream D (this session) triggered the backfill for all career nodes
in a single call, resolving the deferred state entirely.

The `match_kg_nodes` RPC (semantic search) now works for all career nodes. The keyword
ILIKE fallback remains as a secondary path.

---

## Privacy wall — what was SKIPPED

| File / Field | Reason skipped |
|---|---|
| `Money & Runway.md` | Financial data: cash runway, Uber stock balance, bank figures |
| `Status.md` | Contains personal salary figure ("6k") and net worth estimates |
| `Decision Log.md` | Meta process decisions, not career/professional content |
| `Ecommerce*.md` | Business venture planning, not job-hunt career content |
| `HQ Snapshot.md` | Derivative document (auto-generated from source notes) |
| `Active Sessions.md` | Session task tracking, ephemeral |
| `Prime Claude.md` | Meta instructions to Claude, not career content |
| Specific current salary figures | Excluded from all source raw_text |
| CV phone number | PII — excluded |
| CV email address | PII — excluded |

No salary, compensation, or personal financial figures appear in any ingested raw_text.
All achievement metrics (15% market share, 50 agents, 70→100% direct, 100+ fleet,
50% revenue uplift) are retained as they are recruiter-facing, not private financial data.

---

## What M8 can now answer (career corpus coverage)

| Question | Covered by |
|---|---|
| "What are my target companies?" | node 254 (source 35) |
| "What are my Careem wins / achievements?" | nodes 265–270 (source 37) |
| "What's my pitch / outreach template?" | node 256 (source 35) |
| "How many drivers do I manage?" | node 280 (source 38) |
| "Tell me about the Bolt dashboard I built" | nodes 250, 281 (sources 34, 38) |
| "How does the kafala operation work?" | nodes 285–290 (source 39) |
| "What platforms do I supply couriers to?" | node 286 (source 39) |
| "What is my Saudi kafala expertise?" | node 287 (source 39) |
| "What is my warm intro strategy?" | node 253 (source 35) |
| "What is the ambassador recruitment model?" | node 282 (source 38) |
| "Tell me about the Settlement SaaS idea" | node 261 (source 36) |

---

## Retrieval smoke test results

### Enrich batch (2026-06-29)
Query: keyword `kafala` → **3 nodes** (249, 285, 287). ✅  
Query: keyword `ambassador` → **1 node** (282). ✅  
Query: keyword `iqama` → **3 nodes** (285, 287, 288). ✅  
Query: keyword `careem` → **9+ nodes** from career corpus. ✅  
Embed backfill: `{embedded:44, failed:0, total:44}`. ✅

### Prior batches (2026-06-28/29)
Query: keywords `fleet`, `supply`, `courier` → **10 nodes** (IDs 247–261). ✅  
Query: keyword `careem` → **5+ nodes** including careem-supply-manager-egypt-8-years. ✅  
CV nodes in DB: **18/18**. ✅

---

## What Stream 1 (B-158) still needs to do

Stream 1 wires the `docs` lane in the orchestrator so M8 routes "what does my CV say
about X" / "tell me about my career" queries to `searchKnowledgeGraph()`. The content
is in the DB, all 44 nodes are embedded and retrievable — Stream 1 provides the routing door.

---

## Security advisory (from Supabase)

**`m8_router_misses` table has RLS disabled** — fully exposed to the anon key.
Low risk in practice (only redacted message text and lane labels — no PII), but
worth fixing when convenient. Suggested remediation:
```sql
ALTER TABLE public.m8_router_misses ENABLE ROW LEVEL SECURITY;
-- Then add a policy for your access pattern
```
