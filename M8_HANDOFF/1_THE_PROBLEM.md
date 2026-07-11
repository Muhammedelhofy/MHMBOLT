# M8 — what's actually broken, for whoever fixes it next

## The problem, in one line
M8 was supposed to understand what Muhammad means. It still just matches words. When no word matches, it guesses or googles instead of admitting it doesn't know.

## Proof (from tonight, real chat)
He asked: **"what is my current wallet balance?"** — got a real answer, spend total.
He asked the obvious follow-up: **"and what is the remaining?"** — got a **dictionary definition of the word "remaining."**

No money word in that message, so the word-matcher found nothing, and instead of thinking about what he meant, it fell through to a web search of the word itself.

## Why this keeps happening
The code decides what you're asking about by scanning your sentence for trigger words FIRST. Only if zero words match does it try anything smarter — and even then it can still fall through to a plain web search instead of saying "I don't know" or "I can't do that."

This has been called "meaning-first" in past builds, but it isn't. It's word-matching with a smarter fallback bolted underneath. Every "fix" so far — including one shipped tonight — has been tuning which word wins when two match, not changing the fact that words decide first.

Proof it's still word-matching: today's fix for a different bug was literally "when 'budget' and 'trip' both appear, make 'trip' win instead of 'budget.'" That's still two words fighting. Not understanding.

## What must actually change
Every message should go through a step that reads what the person means BEFORE any word-matching happens. Word-matching, if kept at all, should only be a cheap shortcut for obvious cases — not the decision-maker.

If the system doesn't know what someone means, or can't do what they're asking, it must say so plainly. It must never guess and answer as if it understood, and it must never fall back to looking up a random word from the sentence.

## How to verify a fix is real (don't trust claims — test it)
Ask it these, cold, no hints:
1. "what is my current wallet balance?" then "and what is the remaining?"
2. Any money question with zero money-sounding words in it (e.g. "how are we doing this month")
3. Something it genuinely can't do — it should say so directly, not dodge or guess

If any of these still trigger a keyword match instead of real understanding, it is not fixed — it's another patch.

## One instruction for whoever builds this
Do not tune another word-matching rule and call it done. Show the actual proof: the exact piece of code that decides what the person means, and prove it runs BEFORE any word list, on a real example. If that can't be shown clearly, the fix isn't real.
