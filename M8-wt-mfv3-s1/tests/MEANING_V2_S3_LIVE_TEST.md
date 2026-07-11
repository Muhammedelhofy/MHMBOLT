# Meaning-First v2 — S3 notes ladder — LIVE TEST

The LLM leg of `extractNoteLLM` is network-bound, so it's verified on prod (offline tests
cover the deterministic re-parse + the gates). Run after deploy on `m8-alpha.vercel.app`
(`POST /api/chat {message, sessionId, history:[]}`).

## Expected behaviour
A **note-routed** phrasing (has a note word so the registry routes `notes`) that the
deterministic `parseNoteCapture` MISSES should now be **normalised by the LLM, re-parsed,
and saved** — instead of the old generic "I can save or recall notes — e.g. …" card.

| # | Say | Expect |
|---|-----|--------|
| 1 | `jot in my notes that the landlord returned the deposit` | `📝 Noted: "the landlord returned the deposit"` (or very close) — NOT the generic card |
| 2 | `put in my notes the wifi password changed` | `📝 Noted: "the wifi password changed"` |
| 3 | `add to my notes: car service is due every 6 months` | `📝 Noted: "car service is due every 6 months"` |
| 4 | a note-routed turn with nothing concrete, e.g. `something for my notes` | a specific ASK: *"Sure — I can save that as a note. What exactly should I jot down?"* — NEVER "I can't", NEVER the generic card |

## Regression / guardrails
| # | Say | Expect |
|---|-----|--------|
| 5 | `note: buy milk` | still instant-saved by the regex path (`📝 Noted: "buy milk"`) — the ladder never fires (parseNoteCapture hit first) |
| 6 | `what are my notes` | recall list (read path) — the ladder must NOT fire on a recall |
| 7 | `what is the weather in riyadh` | normal web answer — non-notes, ladder returns null, no LLM spent |
| 8 | kill switch: set `M8_NOTE_EXTRACT=0`, then `jot in my notes the deposit came back` | falls through to today's behaviour (generic card / offer) — byte-identical to pre-S3 |

## Verify the save landed
After #1–#3, `show my notes` should list the saved content — confirming the write is real
(not a false "Noted"). Cross-check `m8_notes` (or `_notes.listNotes`) if needed.
