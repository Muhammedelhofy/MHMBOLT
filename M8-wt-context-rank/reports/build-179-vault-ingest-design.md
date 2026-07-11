# B-179 Amendment A1 — Obsidian vault → M8 (one-way ingest) — design + status

**Date:** 2026-07-03 · **Executor:** Opus (from spec Amendment A1) · **Flag:** `M8_VAULT_INGEST` (default **OFF**)

## What it is
M8 can answer from Muhammad's `Muhammad-OS` vault (his richest personal/strategy notes) by
feeding CHANGED markdown through M8's **existing** knowledge-intake pipeline
(`ingestDocument` → embeddings → the same KG/recall Build-179 ranks). No new infra, no new
`api/` function, no new key.

## The four non-negotiables (spec A1) and how this meets them
| Constraint | How |
|---|---|
| **ONE-WAY** (M8 reads, never writes the vault) | `tools/vault-ingest.js` only `readFileSync`s the vault and writes to M8's Supabase store. There is no vault-write code path. |
| **Reuse existing ingestion** | Committing run calls `ingestDocument()` + `extractConcepts()` + `populateGraph()` — the same functions the chat "ingest this doc" path uses. Vault rows then rank via the D3 selector like any memory. |
| **Refresh, not live** | Vercel serverless can't read his PC, so it's a **local CLI** run on demand when the vault changes (`--since <date>` limits to modified notes). |
| **Privacy opt-in** | A committing run sends note **text** (not just numbers) to the LLM/embedding providers. So it is **double-gated**: `M8_VAULT_INGEST=on` **AND** `--commit`. Default = read-only dry run. Freshness (D3 half-life) flags a stale local copy automatically. |

## Status this session
- ✅ `vaultIngestEnabled()` gate added to `lib/context-signal.js` (default OFF; exported + unit-tested).
- ✅ `tools/vault-ingest.js` written; **dry-run proven** against the real vault (read-only, wrote nothing):
  listed 8 notes (`Projects/M8.md`, `HQ Snapshot.md`, …) — read path + gate both verified.
- ⏸ **NOT executed as a committing run.** Ingesting writes vault text to the LLM-reachable store —
  that's a conscious privacy opt-in AND touches the live knowledge store (safe-zone: needs his OK).
  **Surfaced at the C2 checkpoint** for his decision: run the first ingest now, or keep OFF / defer.

## How a real run would look (when he opts in)
```
setx M8_VAULT_INGEST on          # (or $env:M8_VAULT_INGEST='on' for the session)
node tools/vault-ingest.js --dir "C:\Users\m7ofy\OneDrive\Documents\Muhammad-OS" --since 2026-07-01 --commit
```
Ranking needs no special-casing: vault rows carry `similarity`/`trust`/`created_at` like any row,
so D3's `2·sim + trust + fresh + 0.5·importance` ranks them against memory automatically. If a lane
starts over-favouring vault text, the per-lane budget (D5) + row cap already bound it.
