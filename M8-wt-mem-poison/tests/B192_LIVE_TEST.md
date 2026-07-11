# B-192 LIVE TEST — Meaning-First v3 · S1: understand() in SHADOW

**What shipped:** `lib/understand.js` — the ONE semantic pass (reference + intent +
capability + TWO confidences + reasoning_path + clarify) — fired on every real chat
turn NEXT TO the live routing decision and logged to `m8_router_misses`
(lane `understand:*`). It reads NOTHING back into the turn.

**Kill-switch:** `M8_UNDERSTAND` = `shadow` (default) | `off` | `on` ("on" still
behaves as shadow in S1 — authority for reads is S3, on measured evidence only).

**The S1 promise:** with the flag at `shadow` (or unset, or `on`), every live reply
is byte-identical to `off`. The ONLY observable difference is new telemetry rows.

---

## 1 · Shadow rows land (the S1 acceptance)

Send these in the live app (m8-alpha.vercel.app), as TWO turns each — the prior
turn is the point:

| # | Turn 1 | Turn 2 (the shadow target) | Expected shadow row |
|---|---|---|---|
| A | `what is my balance?` | `and what is the remaining?` | lane `understand:wallet`, reason has `uc=0.9x ec=0.1x ref=1` |
| B | `كم صرفت هذا الشهر؟` | `how much is left?` | lane `understand:wallet`, high uc / low ec |
| C | `remind me to call the bank tomorrow` | `move it to tomorrow` | lane `understand:tasks`, `ref=1` |
| D | *(fresh session)* | `what is the remaining?` | lane `understand:none` or `:wallet` with `cl=1` (no context → ASK) |

**The replies themselves must be UNCHANGED tonight** — turn 2A may still hit the
web fallback. That is expected at S1: we are MEASURING the miss, not fixing it
yet (the fix is S3, justified by exactly these rows).

Then read the rows (Supabase SQL, BOLT project `ltqpoupferwituusxwal`):

```sql
select created_at, lane, reason, message_redacted
from m8_router_misses
where lane like 'understand:%'
order by created_at desc
limit 20;
```

PASS = one `understand:*` row per turn sent, `agree=` populated, no dropped rows.
`understand:error` rows = the free provider was rate-limited on that turn — fine
in shadow (fails safe), but note the rate if frequent.

## 2 · Shadow is INERT (byte-identical replies)

LLM prose varies run-to-run, so prove inertness on a **deterministic lane reply**:

1. With prod as deployed (`M8_UNDERSTAND` unset = shadow): send `add 50 sar lunch`
   → copy the 🧾 confirm card text exactly. Reply `no` to cancel.
2. Set `M8_UNDERSTAND=off` in Vercel env → redeploy → send the same message.
3. The two confirm cards must be **byte-identical** (same wording, same order).
4. Remove the override (back to shadow default).

Also confirm: reply latency unchanged (the shadow flushes AFTER the response is
sent — check `/api/chat` timing feels normal), and no new text/tags in any reply.

## 3 · Kill-switch

With `M8_UNDERSTAND=off`: send any message → **no new** `understand:*` rows.
Back to `shadow` → rows resume.

## 4 · What S1 is NOT (don't file these as bugs)

- "remaining" still googles → correct at S1; that flip is S3.
- `understand:error` on a burst of fast turns → Groq free-tier TPM; shadow fails safe.
- The clarifier-pick turn (bare "wallet"/"fleet" answer to a did-you-mean ask)
  doesn't fire a shadow row — deliberate: that turn's meaning is the pick token,
  not a routable message.
