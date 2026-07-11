# Meaning-First v2 — S3: the notes extraction ladder (build report)

**Stage:** S3 (spec §4.3, step 4). **Model:** Opus · high. **Branch:** `build/meaning-v2-s3` off M8 `origin/main` @ `f510775`. **Nothing deployed.**
**Behaviour change on deploy:** a note-routed regex-miss now reaches an LLM ladder → save-or-ASK (was: the generic card), behind `M8_NOTE_EXTRACT` (default ON).

## The reconciliation that shaped the scope (why notes-only)
The spec's S3 named **both** `extractWalletLLM` and `extractNoteLLM`. Reading the live code before building surfaced a **spec-vs-code conflict** (G2 is stale for wallet):

| Lane | Reality | Decision |
|---|---|---|
| **Wallet** | Already has an LLM ladder — `classifyMoneyIntent` (the "Phase 1 intent brain", `orchestrator.js`): LLM reads kind+category, amount parsed deterministically, → confirm prompt; the "yes" survives via `parseConfirmExpensePrompt` (built for AI-detected adds). Generic card is already last-resort. | 🔴 **Skipped** — `extractWalletLLM` would duplicate it. The zero-keyword wallet case ("put down fifty riyals") fails at *routing* (band=none), which `extractWalletLLM` (gated `domain==="wallet"`) wouldn't catch anyway — that's S4's DO-sentinel. |
| **Notes** | Pure regex (`parseNoteCapture`) → miss → generic card. No LLM brain. | 🟢 **Built** — genuinely needed, non-redundant. |

Muhammad chose **notes-only** on the flagged fork. Building the wallet twin would have been exactly the "add more machinery that duplicates the meaning-first path" drift the doctrine warns against.

## What shipped
- **`extractNoteLLM(message)`** (`orchestrator.js`) — the exact `extractTaskLLM` shape: gated `M8_INTENT_GATE` + `M8_NOTE_EXTRACT`; spends the call ONLY when `resolveIntent(s).domain === "notes"`; temp 0, 5s timeout, JSON via the shared `providerOrder` waterfall (no hardcoded model); LLM normalises → canonical `"note: <content>"` → **deterministic re-parse through `parseNoteCapture`** (the model never has structural authority) → `{content}` to save, else `{ask}`. Privacy: message TEXT only, never a stored note or history.
- **Wired into `handleNotesCommand`** right after the regex `parseNoteCapture` miss and **before** the legacy free-form offers — so meaning-first wins for note-routed turns; a non-notes turn returns null and the offers run unchanged. This **demotes the generic notes card to unreachable-for-notes** (the ladder's ASK fires first).

## Verification (this session, all green)
- **`meaning_v2_s3_notes.test.js` 14/14** — deterministic re-parse invariant (`parseNoteCapture("note: "+X)===X`), the gates short-circuit BEFORE any LLM call (non-notes → null, empty/long → null, `M8_NOTE_EXTRACT=0` → null), prompt shape.
- **`meaning_v2_s3_notes.test.ps1` 14/14** (pure ASCII) — re-parse invariant + source wiring + the **anti-drift guard** (`extractWalletLLM` must NOT exist; `classifyMoneyIntent` is the existing wallet ladder).
- **Regression:** `intent_gate_test.js` **101/101**; `meaning_v2_test.js` 66/67 (only S4 pending-action red, unchanged); `orchestrator.js` loads clean.
- LLM leg is prod-only: `tests/MEANING_V2_S3_LIVE_TEST.md`.

## Next
Deploy S3 (behind `M8_NOTE_EXTRACT`, default ON) on his OK → live-verify the 8 cases. Then S4 (DO-sentinel `on` + pendingAction + confirm-back) after the C2 telemetry gate. S5 = net-deletes (`_NOTE_ACTION_VERBS` + free-form offer plumbing, now superseded by this ladder) + doctrine doc.
