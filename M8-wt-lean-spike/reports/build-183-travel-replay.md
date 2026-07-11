# Build-183 — Probe B: trip-state extractor replay (C1 checkpoint)

**Date:** 2026-07-03 · **Author:** Opus (high) · Phase A (travel-core)

Probe B replays scripted conversations through the trip-state pipeline. The pipeline has two
parts, verified separately:

1. **The LLM extraction** (`extractTripState`, the ONE free-stack LLM call) — needs keys, so its
   quality is verified **live at prod self-verify** (canaries 1-7). The harness
   `tests/build183_travel_replay.js` runs it locally when `GROQ_API_KEY`/`GEMINI_API_KEY` are set
   (it printed *"NO KEY — extraction skipped"* on this host — no key ever echoed, no DB write).
2. **The deterministic downstream** (`normalizeTrip` → `resolveOrigin` → `travelClarify` /
   `buildBookingLinks`) — PURE, so it is proven **offline** below on the representative extractor
   outputs each scripted conversation should produce. This is what turns a trip into the
   confirm/clarify/links behaviour, and it is fully asserted in `build183_travel.test.{js,ps1}`.

## Downstream pipeline replay (offline, deterministic)

| # | Latest message | Reconstructed trip (origin/dest/needs) | Decision |
|---|---|---|---|
| 1 | "I'm travelling to Alexandria" | Riyadh/RUH **[env]** → Alexandria, needs=[flights] | **CLARIFY** → *"Assuming you're flying from Riyadh (tell me if not) — what dates are you thinking?"* |
| 2 | "mid-August, with my wife and the kids" | Riyadh/RUH[env] → Alexandria, dates=Aug'26, party=2a+2c, [flights] | **PACKET** — 2 flight links (Google Flights, Skyscanner) |
| 3 | "find me a hotel there too" | Riyadh/RUH[env] → Alexandria (carried), needs=[hotels] | **PACKET** — Booking.com link |
| 4 | "plan 3 days there with the kids" | Riyadh/RUH[env] → Dubai, needs=[itinerary,attractions] | **PACKET** (knowledge + links) — Booking + 2 Google Maps |
| 5 | "no, I'm flying from Jeddah" | **Jeddah/JED [confirmed]** → Alexandria, [flights] | **PACKET** — origin now confirmed, no re-confirm line |
| 7 | "just book it for me" | Riyadh/RUH[stated] → Cairo, dates set, [flights] | **PACKET** — links; the LLM appends the D8 boundary via the directive |
| 8 | "عايز أسافر إسكندرية الشهر الجاي" | Riyadh/RUH[env] → Alexandria, [flights] | **PACKET** — Google Flights link |

**Reads correctly:**
- **Canary 1** — a bare destination CLARIFIES once, stating the inferred origin out loud with an
  invitation to correct + exactly one question (dates). Never both silent-assumes and never interrogates.
- **Canary 2/3** — destination + dates + party carry across turns; the follow-ups ride the trip context.
- **D3 confirmed-state (case 5)** — an origin correction flips source→`confirmed`; subsequent turns use
  Jeddah and the confirm line is dropped (no re-asking).
- **Canary 4** — itinerary answers from knowledge (no live search need) + still gets links.
- **D8 (case 7)** — "book it for me" yields a PACKET whose directive orders the LLM to hand the link +
  *"you confirm and pay."* — no booking, no payment path in code.

## C1 checkpoint

The **downstream pipeline is proven** (offline + unit tests). The **LLM extraction quality** —
whether the free-stack model correctly reads "mid-August" → Aug 15, "with the kids" → children, an
Arabic destination, and a bare follow-up against history — is the part Muhammad eyeballs. Because
no key is available on this host, that eyeball happens at **prod self-verify** (the live canaries
below ARE the extractor replay). If any live inference is wrong, the fix is the extractor prompt in
`lib/travel.js` (`_extractSystem`) — the fail-safe guarantees a wrong/empty extraction degrades to
today's path, never worse.
