# M8 v2 — Personal AI Agent
## Product Requirements Document
**Owner:** Muhammad El-Hofy  
**Date:** June 2026  
**Status:** Approved — Ready to Build

---

## 1. Vision

M8 is a personal AI agent (Jarvis-style). It is NOT a Bolt-only tool — Bolt fleet is one of many tools M8 can use. M8 understands natural language in Arabic and English, takes actions on your behalf, and responds by voice and text. Accessible from any browser, including phone.

---

## 2. Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| AI Brain | Google Gemini 1.5 Flash API | Free tier |
| Backend | Vercel Serverless Functions | Free tier |
| Frontend | HTML/CSS/JS (GitHub repo → Vercel deploy) | Free |
| Database | Supabase (existing) | Free tier |
| Voice Input | Web Speech API (browser built-in) | Free |
| Voice Output | Edge TTS (Microsoft, via backend) | Free |
| Web Search | Brave Search API | Free (2000/month) |
| Excel Export | xlsx.js library | Free |

---

## 3. Repository Structure

```
muhammadelhofy/M8          ← New GitHub repo
│
├── public/                ← Frontend files
│   ├── index.html         ← M8 UI (single page)
│   ├── css/
│   │   └── style.css      ← Styles (dark theme, RTL support)
│   └── js/
│       ├── app.js         ← Main app logic
│       ├── voice.js       ← STT + TTS handling
│       ├── chat.js        ← Conversation UI
│       └── tools-ui.js    ← Tool result rendering (reports, calendars, etc.)
│
├── api/                   ← Vercel serverless functions (backend)
│   ├── chat.js            ← Main endpoint: receives message → calls Gemini → returns response
│   ├── fleet.js           ← Supabase fleet data queries
│   ├── calendar.js        ← Google Calendar read/write [GEMINI BUILDS THIS]
│   ├── email.js           ← Gmail read/draft/send [GEMINI BUILDS THIS]
│   ├── search.js          ← Brave Search [GROK BUILDS THIS]
│   ├── tts.js             ← Edge TTS voice generation
│   └── export.js          ← Excel file generation
│
├── tools/                 ← Tool definitions (sent to Gemini API)
│   ├── fleet-tools.js     ← Fleet query, report, payment check tools
│   ├── calendar-tools.js  ← Calendar tools [GEMINI BUILDS THIS]
│   ├── email-tools.js     ← Email tools [GEMINI BUILDS THIS]
│   ├── search-tools.js    ← Web search tool [GROK BUILDS THIS]
│   └── export-tools.js    ← Report/Excel generation tools
│
├── lib/                   ← Shared utilities
│   ├── supabase.js        ← Supabase client
│   ├── gemini.js          ← Gemini API client + tool orchestration
│   └── helpers.js         ← Date formatting, language detection, etc.
│
├── .env.example           ← Template (never commit real keys)
├── vercel.json            ← Vercel routing config
└── package.json
```

---

## 4. Architecture Flow

```
User (voice or text, Arabic or English)
        ↓
  M8 Frontend (browser/phone)
  - Captures voice → Web Speech API → text
  - Sends text to /api/chat
        ↓
  /api/chat (Vercel serverless)
  - Receives message + conversation history
  - Sends to Gemini Flash with tool definitions
  - Gemini decides: respond directly OR call a tool
        ↓
  If tool call:
  ├── fleet.js → Supabase → fleet data
  ├── calendar.js → Google Calendar API
  ├── email.js → Gmail API
  ├── search.js → Brave Search API
  └── export.js → Generate Excel file
        ↓
  Tool result → back to Gemini → final response
        ↓
  Response text → /api/tts → Edge TTS voice
        ↓
  M8 speaks + displays response
```

---

## 5. Tool Definitions

### Tool 1: query_fleet_data
```json
{
  "name": "query_fleet_data",
  "description": "Query driver/fleet data from the database. Use for summaries, rankings, driver details, or any fleet question.",
  "parameters": {
    "query_type": "summary | driver_detail | top_performers | below_target | full_list",
    "date_range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "driver_names": ["optional array of specific driver names"],
    "sort_by": "net_earnings | hours | acceptance_rate | rating",
    "limit": "number (optional)"
  }
}
```

### Tool 2: build_fleet_report
```json
{
  "name": "build_fleet_report",
  "description": "Build a financial or performance report for drivers. Returns data for display AND triggers Excel download.",
  "parameters": {
    "report_type": "financial | performance | payment_summary",
    "driver_names": ["optional — all drivers if empty"],
    "date_range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "format": "excel | summary | both"
  }
}
```

### Tool 3: check_payment_status
```json
{
  "name": "check_payment_status",
  "description": "Check whether payment was transferred to specific drivers for a given period.",
  "parameters": {
    "driver_names": ["array of driver names"],
    "month": "YYYY-MM"
  }
}
```

### Tool 4: get_calendar_events
```json
{
  "name": "get_calendar_events",
  "description": "Get upcoming calendar events.",
  "parameters": {
    "date_range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "search_query": "optional keyword"
  }
}
```

### Tool 5: add_calendar_event
```json
{
  "name": "add_calendar_event",
  "description": "Add a new event to Google Calendar.",
  "parameters": {
    "title": "event title",
    "date": "YYYY-MM-DD",
    "time": "HH:MM (optional)",
    "description": "optional notes",
    "duration_minutes": 60
  }
}
```

### Tool 6: read_email
```json
{
  "name": "read_email",
  "description": "Read recent emails or search the inbox.",
  "parameters": {
    "count": 5,
    "search_query": "optional search term",
    "unread_only": true
  }
}
```

### Tool 7: draft_email
```json
{
  "name": "draft_email",
  "description": "Draft or send an email via Gmail.",
  "parameters": {
    "to": "email address",
    "subject": "email subject",
    "body": "email content",
    "draft_only": true
  }
}
```

### Tool 8: web_search
```json
{
  "name": "web_search",
  "description": "Search the web for current information, news, or research.",
  "parameters": {
    "query": "search query",
    "language": "ar | en",
    "count": 5
  }
}
```

### Tool 9: generate_excel_report
```json
{
  "name": "generate_excel_report",
  "description": "Generate and download an Excel file from provided data.",
  "parameters": {
    "title": "report title",
    "data": "array of objects (rows)",
    "columns": "array of column definitions",
    "filename": "output filename"
  }
}
```

---

## 6. M8 System Prompt (Personality)

```
You are M8, the personal AI agent of Muhammad El-Hofy — Senior Operations Manager 
based in Riyadh, Saudi Arabia. You are intelligent, direct, and action-oriented.

LANGUAGE: Always match the user's language. If they write or speak in Arabic, 
respond in Arabic. If English, respond in English. You support Arabic (ar-SA) 
and English (en-US) fully.

TOOLS: You have access to tools for fleet management (Bolt driver data), 
Google Calendar, Gmail, and web search. When a user asks something you can 
answer with a tool, use the tool — don't guess.

VOICE: Keep responses concise. You are often speaking aloud. Avoid long lists 
unless asked for a report. Summarize, then offer detail if asked.

REPORTS: Before generating a report, confirm the date range and drivers with 
the user unless they were clearly specified.

CONTEXT: Muhammad manages a fleet of delivery bike drivers (Bolt KSA). 
He is focused on operations, driver performance, payments, and scheduling.
He also manages YouTube channels and is interested in AI and productivity.

PROACTIVE: If you notice something worth flagging in the data (low performer, 
overdue payment, important event), mention it briefly.
```

---

## 7. Voice Interface Spec

### Speech-to-Text (Input)
- Engine: Web Speech API (browser built-in, free)
- Languages: `ar-SA` and `en-US`
- Mode: Tap-to-speak (push to talk, not continuous)
- Fallback: Text input always visible below voice button
- Auto-detect language: Toggle button (AR/EN) in UI

### Text-to-Speech (Output)
- Engine: Edge TTS via `/api/tts.js` (Microsoft, free)
- Arabic voice: `ar-SA-HamedNeural` (male)
- English voice: `en-US-GuyNeural` (male)
- Alternative voices available in settings
- Playback: Auto-play response, stop button visible

---

## 8. UI Design Spec

### General
- Mobile-first (works perfectly on phone browser)
- Dark theme (navy/charcoal, consistent with existing Bolt dashboard)
- RTL layout auto-switch when language is Arabic
- Clean, minimal — not cluttered

### Layout Components
1. **M8 Header** — name, status indicator (listening/thinking/speaking), language toggle (AR/EN)
2. **Conversation panel** — scrollable chat history, M8 responses and user messages
3. **Tool result cards** — inline in conversation:
   - Fleet summary card (driver table, stats)
   - Report card (preview + Excel download button)
   - Calendar card (event list)
   - Email card (email preview)
   - Search card (web results)
4. **Input bar (bottom)**:
   - Text input field
   - Microphone button (tap to speak)
   - Send button
5. **Settings panel** (slide-in from right):
   - Voice selection
   - Language preference
   - Supabase connection status
   - Google account connection status

### M8 Visual Identity
- Animated orb/ring when M8 is speaking (consistent with current Bolt dashboard aesthetic)
- Pulse animation when listening
- Thinking indicator (dots) when processing

---

## 9. Supabase Schema (New Tables)

### Table: m8_conversations
```sql
create table m8_conversations (
  id uuid default gen_random_uuid() primary key,
  session_id text not null,
  role text not null, -- 'user' or 'assistant'
  content text not null,
  tool_calls jsonb, -- stores tool call details if any
  created_at timestamptz default now()
);
```

### Table: m8_settings
```sql
create table m8_settings (
  id uuid default gen_random_uuid() primary key,
  user_key text unique not null, -- device/user identifier
  language text default 'ar',
  voice_ar text default 'ar-SA-HamedNeural',
  voice_en text default 'en-US-GuyNeural',
  google_refresh_token text, -- for Calendar/Gmail OAuth
  updated_at timestamptz default now()
);
```

---

## 10. Environment Variables

```env
# .env.example — copy to .env for local dev, add to Vercel dashboard for production

# AI Brain
GEMINI_API_KEY=your_gemini_api_key_here

# Database
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# Web Search
BRAVE_SEARCH_API_KEY=your_brave_search_api_key

# Google OAuth (Calendar + Gmail) — add after Gemini sets up OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-vercel-url.vercel.app/api/auth/callback
```

---

## 11. Build Phases & AI Assignments

### Phase 1 — Core M8 Shell (Claude Code builds)
**Deliverable:** M8 is live, voice works, conversations work, no tools yet
- Vercel project setup + GitHub connection
- Frontend: index.html, CSS (dark theme, mobile-first, RTL-ready), chat UI
- Voice: Web Speech API (STT) + Edge TTS (TTS via /api/tts.js)
- Backend: /api/chat.js with Gemini Flash integration (no tools yet)
- Gemini system prompt loaded
- Conversation history stored in Supabase (m8_conversations table)
- Deploy and test: open URL on phone and talk to M8

### Phase 2 — Fleet Tools (Claude Code builds)
**Deliverable:** M8 can answer any fleet question and generate Excel reports
- Connect Supabase to fleet data (use existing tables from Bolt dashboard)
- Implement: query_fleet_data, build_fleet_report, check_payment_status tools
- Implement: /api/fleet.js, /api/export.js
- Excel generation with xlsx.js
- Test: "كم كابتن اشتغل فوق 200 ريال امبارح؟" → M8 queries and answers

### Phase 3 — Calendar + Gmail (Gemini Pro builds modules → Claude Code integrates)
**Deliverable:** M8 can check calendar and handle email
- See SECTION 12 below for exact Gemini task prompt

### Phase 4 — Web Search (Grok builds module → Claude Code integrates)
**Deliverable:** M8 can search the web
- See SECTION 13 below for exact Grok task prompt

### Phase 5 — Polish (Claude Code)
**Deliverable:** Production-ready, smooth on mobile
- Arabic RTL layout perfection
- Voice reliability improvements (error handling, retry logic)
- Loading states and animations
- M8 settings panel
- Connect to existing Bolt dashboard (link/button from M8 to Bolt dashboard)

---

## 12. GEMINI TASK — Calendar + Gmail Integration

> **Copy and paste this section to Gemini Pro:**

---

**Task for Gemini:** Build two Vercel serverless API modules for a personal AI agent called M8.

**Stack:** Node.js, Vercel serverless functions, Google APIs (Calendar v3, Gmail v1), OAuth 2.0

**What to build:**

**File 1: `/api/calendar.js`**
- GET events: accepts `start` and `end` query params (ISO dates), returns array of events `[{id, title, start, end, location, description}]`
- POST event: accepts JSON body `{title, date, time, description, duration_minutes}`, creates event, returns created event ID
- Auth: use Google OAuth 2.0 with refresh token stored in environment variable `GOOGLE_REFRESH_TOKEN`
- Use `googleapis` npm package

**File 2: `/api/email.js`**
- GET emails: accepts `count` (default 5), `query` (search term), `unread_only` (boolean) — returns `[{id, from, subject, snippet, date, unread}]`
- POST draft: accepts `{to, subject, body, draft_only}` — if `draft_only=true` save as draft, else send
- Auth: same Google OAuth 2.0 refresh token

**File 3: `/api/auth/google.js`** (OAuth flow)
- GET `/api/auth/google` → redirects to Google OAuth consent screen (scopes: calendar, gmail)
- GET `/api/auth/callback` → exchanges code for tokens, saves refresh_token to Supabase `m8_settings` table

**File 4: `/tools/calendar-tools.js`** and **`/tools/email-tools.js`**
- Export tool definitions (JSON schema format for Gemini function calling) matching the tool specs in the PRD

**Environment variables needed:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

**Return:** All 4 files with complete code, ready to drop into the repo.

---

## 13. GROK TASK — Web Search Integration

> **Copy and paste this section to Grok:**

---

**Task for Grok:** Build one Vercel serverless API module for a personal AI agent called M8.

**Stack:** Node.js, Vercel serverless function, Brave Search API

**What to build:**

**File 1: `/api/search.js`**
- Accepts GET or POST with params: `query` (string), `language` (ar | en, default en), `count` (number, default 5)
- Calls Brave Search API: `https://api.search.brave.com/res/v1/web/search`
- Headers: `Accept: application/json`, `X-Subscription-Token: BRAVE_SEARCH_API_KEY`
- Returns clean array: `[{title, url, description, published_date}]`
- Handle errors (rate limit, invalid key) with clear error messages
- Add CORS headers so frontend can call it

**File 2: `/tools/search-tools.js`**
- Export tool definition in Gemini function calling JSON schema format:
```json
{
  "name": "web_search",
  "description": "Search the web for current information, news, or research. Use when user asks about live info, prices, news, or anything not in the database.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {"type": "string", "description": "the search query"},
      "language": {"type": "string", "enum": ["ar", "en"]},
      "count": {"type": "number", "description": "number of results, default 5"}
    },
    "required": ["query"]
  }
}
```

**Environment variable needed:**
- `BRAVE_SEARCH_API_KEY`

**Return:** Both files complete and ready to use.

---

## 14. API Keys Setup Checklist

Before starting Phase 1, Muhammad needs:

| # | What | Where | Notes |
|---|---|---|---|
| 1 | Gemini API key | aistudio.google.com → Get API key | Free tier sufficient |
| 2 | Vercel account | vercel.com → Sign up with GitHub | Free |
| 3 | New GitHub repo | github.com → New repo: `M8` | Public or private |
| 4 | Brave Search API key | api.search.brave.com → Free plan | 2000 searches/month |
| 5 | Google Cloud project | console.cloud.google.com | Enable Calendar API + Gmail API, create OAuth credentials |

Supabase is already set up — just need to add the new tables (SQL in Section 9).

---

## 15. How to Give Claude Code Phase 1 Instructions

After setup is complete, open **Claude Code (or Cowork)** and paste:

```
Build M8 v2 Phase 1 — Core Shell.

Repo: muhammadelhofy/M8 (already created on GitHub, connected to Vercel)

Read the full PRD at [paste PRD or attach file].

Phase 1 deliverables:
1. public/index.html — M8 UI: dark theme, mobile-first, RTL-ready, chat panel, voice button, text input, language toggle (AR/EN), M8 avatar with animations
2. public/css/style.css — full styling
3. public/js/voice.js — Web Speech API STT (ar-SA + en-US) + Edge TTS playback
4. public/js/chat.js — conversation display, message bubbles, scroll behavior
5. public/js/app.js — main logic: send message → /api/chat → display response → speak response
6. api/chat.js — Vercel function: receive message + history → call Gemini Flash → return response (no tools yet, just conversation)
7. api/tts.js — Vercel function: receive text + language → call Edge TTS → return audio
8. lib/supabase.js — Supabase client setup
9. lib/gemini.js — Gemini Flash client with system prompt
10. vercel.json — routing config
11. package.json — dependencies: @supabase/supabase-js, @google/generative-ai, edge-tts (or equivalent)
12. .env.example — template

Environment variables (I will add to Vercel dashboard):
- GEMINI_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_KEY

System prompt for M8 is in the PRD Section 6.

Deploy to Vercel. Give me the live URL when done.
```

---

*End of PRD — M8 v2*
