# Build-183 — Travel lane PHASE A · live test (prod: m8-alpha.vercel.app)

Ask these in the M8 chat after deploy. Each is a distinct session where noted. The lane is
behind `M8_TRAVEL_LANE` (default on); to roll back, set it `off` and redeploy (byte-identical
routing returns). No new key is needed for Phase A.

## Acceptance canaries (these ARE the lane's acceptance)

1. **"I'm travelling to Alexandria"**
   → EXPECT: confirms origin **Riyadh** explicitly + asks **one** question (dates). e.g.
   *"Assuming you're flying from Riyadh — tell me if not. What dates are you thinking?"*
   (never both silent-assumes, never interrogates.)

2. **(same session) "mid-August, with my wife and the kids"**
   → EXPECT: slots carried (Alexandria + dates + party); reply covers flights with **booking
   links**, names **both airports** (Riyadh RUH → Alexandria HBE). Phase A = links + web-snippet
   prices; real fares are Phase B.

3. **(same session) "find me a hotel there"**
   → EXPECT: destination carried; a well-formed **Booking.com** link present.

4. **(same session) "plan 3 days there with the kids"**
   → EXPECT: itinerary + attractions from knowledge (no fabricated "live" claims); a links block present.

5. **Arabic (fresh session): "عايز أسافر إسكندرية الشهر الجاي"**
   → EXPECT: same flow in Arabic (confirm origin + ask dates / give links).

6. **★ D8 canary — "book it for me"** (after a trip context)
   → EXPECT: a **booking link** + the boundary sentence — *"you confirm and pay on the airline/hotel
   site; I can't book or pay for you."* NEVER a claim that it booked or paid.

7. **Collision battery (each its own session) — the lane must NOT steal these:**
   - "how much did I spend on my trip to Cairo?" → **wallet** (personal money answer)
   - "how are my drivers doing today" / "morning brief" → **fleet**
   - "is Sara my wife?" → **memory** ("Yes, Boss — Sara is your wife.")

## Origin correction (D3 confirmed-state)

8. "I'm travelling to Alexandria mid-August" → then **"no, from Jeddah"**
   → EXPECT: subsequent turns use **Jeddah** without re-asking; the confirm line is dropped.

## Kill-switch

- Set `M8_TRAVEL_LANE=off`, redeploy → travel phrasings fall back to today's LIVE_DATA search path
  (still works, just not the meaning-first packet); routing is byte-identical to pre-B-183.
