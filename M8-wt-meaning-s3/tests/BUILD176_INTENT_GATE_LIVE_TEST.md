# Build-176 — Intent Gate (meaning-first routing) · LIVE TEST

Live URL: https://m8-alpha.vercel.app  ·  Verify on YOUR screen, not the DB.

**What shipped:** one always-on intent decision (`resolveIntent`) that every lane trusts,
replacing ~8 keyword gates. The fix kills two live bugs at once — (1) the arbiter's topic-lean
stealing novel turns ("My notes" / "what does my CV say…" → fleet), and (2) the fallback LLM
hallucinating "I can't set reminders / track expenses". Kill-switch `M8_INTENT_GATE=0` reverts.

**Telemetry (Vercel logs / `m8_router_misses`):** new lanes to watch —
`intent:<domain>` (the gate's call), `intent-override:<domain>` (a `*_context` lean it
overrode), `intent-sem-confirm:<domain>` (semantic broke a write-fork tie),
`intent-clarify:a|b` (a medium-band write-fork ask).

---

## A) MIS-ROUTE FIXED — the topic-lean no longer steals a novel turn

Do each of these **right after a fleet answer** (ask "how did the fleet do yesterday?" first,
then send the test line in the SAME chat). Before B-176 these were stolen to the fleet lane.

1. **My notes** → your notes (or "no notes yet"), NOT fleet numbers.
2. **what does my CV say about leadership** → answers from your ingested CV, NOT fleet.
3. **in my resume, what experience do I have with operations** → CV/knowledge, NOT fleet.
4. **What date is today?** → today's date, NOT a fleet reply.
5. **If I asked you to pick one country to win the world cup, which one?** → an opinion, NOT fleet.
   - Logs should show `intent-override:notes|knowledge|chat` for these.

## B) THE ACCEPTANCE CASE — reminder with a rival keyword

6. **Remind me today at 9:47 pm about the match** → "Added … 'the match' (today at 9:47pm)".
   - The word "match" must NOT send it to a web/scores answer. Task created, clock correct.
7. **Just pop up a notification "meeting minutes" at 8** → creates a reminder (no task keyword —
   the step-4 LLM extractor or step-5 semantic should catch it), OR asks what/when. Never a flat reply.

## C) NEVER "I CAN'T" — the capability-lie is gone

8. **can you set a reminder and notify me about my task at 6 am** → sets it / confirms, never "I can't".
9. **my reminder for the team meeting, put it at 8** → creates it (step-4 extractor) or asks the time.
10. **how much do I owe on the internet bill?** → the bill amount or an honest "add it" — never
    "I don't have access to your accounts".
   - On ANY of 8–10, a reply containing "I can't set reminders / track expenses / no access to
     your accounts" is a **FAIL** (that's the exact bug this build kills).

## D) HOUSEHOLD WALLET (Sara) still protected — never fleet

11. **how much did Sara spend in June** → personal wallet path, NOT fleet numbers.
12. **مصاريف سارة في يونيو** → same (this one hit the phase-0 net before B-176).

## E) MUST-NOT-REGRESS — existing commands unchanged

13. **how did the fleet do yesterday** → fleet brief (unchanged).
14. **add 50 sar lunch** → confirm-card → **yes** → logged (unchanged).
15. **remind me to call the bank tomorrow** → task with tomorrow due (unchanged).
16. **update Ahmad's rental to 1800** → driver-profile update, NOT wallet/fleet.

## F) KILL-SWITCH (only if something misbehaves)

Set `M8_INTENT_GATE=0` in Vercel env → redeploy → routing reverts to the pre-176 gate order.
(Gotcha: the flag is inert until the build is merged/deployed — it's a post-deploy escape hatch,
not a pre-deploy safety.) Independent kill-switches: `M8_TASK_EXTRACT=0` (disable the tasks LLM
extractor), `M8_INTENT_SEMANTIC=0` (disable the medium-band semantic tiebreaker).

---

**Offline status before this test:** intent fixture 66/66 (real phrasings) + wiring green;
all 25 existing build tests pass (0 regressions); every pure function has a PS-5.1 mirror.
This live test covers the LLM-reply behavior (criterion #3) that can only be checked in prod.
