# Jalan — Conversational Travel Itinerary Planner

**Live app:** https://jalan-ai.vercel.app

A conversational travel planning assistant that turns natural-language requests into full day-by-day itineraries with live weather, real points flight deals, transport routing, packing lists, daily Google Maps route links, and hallucination guardrails — all powered by a LangGraph multi-agent loop.

_"jalan" means "to walk" or "to travel" in Indonesian._

Built with Next.js 14, LangChain/LangGraph, PostgreSQL, Clerk auth, the Seats.aero Partner API, OSRM (Open Source Routing Machine), and Nominatim geocoding.

---

## What it does

Users chat with **Jalan**, a friendly travel companion that:

1. **Understands natural-language trip requests** — e.g. *"Tokyo in October"*, *"honeymoon in Thailand"*, *"Paris for a week"*, *"find any deal to Bangkok in January"*.
2. **Asks clarifying questions** when details are missing — dates, origin, budget, cabin, trip length. Handles vague messages gracefully with conversational follow-ups.
3. **Generates a full day-by-day itinerary** with:
   - Real weather forecast from Open-Meteo.
   - Live destination news and events (Gemini web search grounding).
   - Wikipedia/Wikimedia landmark images for each day (deduplicated — no repeated images).
   - A "Getting Around" section with local transit tips.
   - Per-day transport notes (walking/transit guidance).
4. **Plans transport between every stop** — a dedicated transport agent geocodes each landmark and uses OSRM to get real walking/driving times, then recommends the best mode (walk, transit, ride-share) per leg, plus city-specific transit tips and cost estimates.
5. **Searches live award flight deals** via the Seats.aero Partner API — returns the top 5 lowest-mileage options, diversified by origin city, with duration, stops, taxes, and direct airline booking links.
6. **Provides daily Google Maps route links** — each day's landmarks are turned into a clickable Google Maps directions URL with highlight summaries (e.g. "Louvre → Eiffel Tower → Montmartre").
7. **Suggests a packing list** based on destination and weather.
8. **Lets users save trips** to a **One Stop** panel (sign-in gated) with to-dos, notes, deals, itinerary, routes, transport, and packing list.
9. **Provides a section navigator** — a right-side tab (desktop) and floating button + drawer (mobile) that lets users jump to any section of the itinerary (Weather, Transport, Packing, Deals, Routes, individual days).

---

## Architecture

### LangGraph conversation pipeline

The chat backend is a LangGraph state machine with the following nodes:

```mermaid
flowchart TD
    START --> extract[Extract<br/>parse intent + entities]
    extract -->|greeting| respond[Respond]
    extract -->|vague| clarify[Clarify<br/>conversational follow-up]
    extract -->|ask_question + missing fields| clarify
    extract -->|ask_question| answer[Answer<br/>deal lookup]
    extract -->|plan_trip + missing fields| clarify
    extract -->|plan_trip/refine| gather[Gather<br/>weather + news + deals + itinerary + transport]
    clarify --> END
    answer --> END
    gather --> guardrails[Guardrails<br/>verify landmarks via Wikipedia]
    guardrails --> critic[Critic<br/>QA review for hallucinations]
    critic -->|approved| respond
    critic -->|needs revision| gather
    respond --> END
```

- **Extract** — uses `chrono-node` + LLM to parse destination, dates, duration, cabin, travelers, budget, and intent (`plan_trip`, `ask_question`, `refine`, `greeting`, `vague`) from the user's message.
- **Clarify** — asks follow-up questions for missing required fields (destination, dates). For vague messages, generates a warm, conversational follow-up with example ideas.
- **Gather** — fetches weather (Open-Meteo), news (Gemini web search), live deals (Seats.aero), destination image, generates the itinerary and packing list in parallel, then builds route links and the transport plan.
- **Guardrails** — extracts every landmark from the itinerary and verifies each one exists on Wikipedia. Flags any unverified places as potential hallucinations.
- **Critic** — a strict QA reviewer that checks for hallucinated flights, fake attractions, invented transit lines, missing weather, inconsistent day counts, and unverified landmarks. Sends feedback back to the gather node if the itinerary needs revision (up to 2 revisions).
- **Respond** — hydrates image placeholders with real Wikimedia URLs (deduplicated), assembles the final markdown response.
- **Answer** — handles deal-only lookups (e.g. *"find deals to Tokyo in December"*) with live Seats.aero search.

### Transport agent

After the itinerary is generated and route links are extracted, a dedicated transport agent (`src/agents/transport.ts`) runs to provide real-world transport guidance:

1. **Geocodes each landmark** via Nominatim (OpenStreetMap, free, no API key).
2. **Gets real walking and driving times** between consecutive stops via OSRM (free, no API key).
3. **Recommends the best transport mode per leg** based on distance:
   - Under 15 min walk → "Walk"
   - 15-25 min walk → "Walk" (if driving would be 8+ min due to traffic)
   - Short drive but long walk → "Transit/Ride-share"
   - Over 5km → "Transit/Ride-share"
   - Otherwise → "Transit" with a balanced note
4. **Generates city-specific transit tips** via LLM — which transit pass/card to buy, best navigation/ride-share app, cultural tips, and when to walk vs. take transit.
5. **Estimates transport costs** — markdown table with day pass, single ride, taxi base fare, ride-share, and weekly total.

Limits to the first 5 days to respect API rate limits.

### Live deal search (Seats.aero)

When the agent needs flight deals:

1. Searches the local PostgreSQL cache first.
2. If no cached deals match, calls the Seats.aero Partner API live:
   - Searches across major US gateways (JFK, LAX, SFO, ORD, DFW, etc.) if no origin is specified.
   - Returns up to 100 candidates, sorted by lowest mileage.
   - **Diversifies by origin city** — uses round-robin selection across unique origins so deals come from different hubs, not all from the same city.
   - Enriches the top 5 with trip details (duration, stops, layover, aircraft) from the Seats.aero `/trips/{id}` endpoint.
3. Each deal includes a direct booking link to the airline's website (Delta, American, United, JAL, etc.) via `src/lib/airline-booking.ts`.

### Hallucination guardrails

- **Wikipedia landmark verification** — every `![IMAGE: ...]` placeholder in the itinerary is checked against Wikipedia's search API. Unverified landmarks are flagged.
- **Critic prompt** — explicitly checks for invented attractions, closed venues, fake transit lines, made-up schedules, and inconsistent day counts.
- **Itinerary generator prompt** — instructed to only include real, well-known attractions and to not invent transit lines, schedules, or booking details.
- **Route link filtering** — the Google Maps route builder filters out generic words (morning, afternoon, hotel) and transit-mode names so only real places become waypoints.
- **Image deduplication** — the image hydration agent tracks used URLs and skips duplicates. If no unique image is found for a landmark, the placeholder is removed rather than showing a repeat.

### Global destination support

The agent works for any destination worldwide — not just a fixed set of cities. Lookup tables (`AIRPORT_NAMES`, `CITY_MAP`, `WEATHER_CITIES`, `WIKIPEDIA_CITIES`, `CITY_AIRPORTS`) cover 70+ global destinations across Asia, Europe, Middle East, Latin America, Oceania, and Africa. For destinations not in the lookup tables, the agent falls back to using the city name directly for weather geocoding (Open-Meteo), news search (Gemini), and image lookups (Wikimedia).

### One Stop panel

A sign-in-gated, centered modal accessible from the chat header that lets users:

- **Save** any assistant response (deals, itinerary, packing list, route links, transport plan).
- **View saved trips** organized by destination and dates.
- **Manage to-dos** — add, check off, and delete tasks per trip.
- **Write notes** — free-form notes per trip.
- **Copy trip summary** — copies everything to clipboard.
- **Persist locally** — saved trips are stored in `localStorage`.

---

## Tech stack

- **Frontend**: Next.js 14 App Router, React, TypeScript, Tailwind CSS, SWR, Clerk auth
- **Backend**: Next.js Route Handlers (Node runtime), Vercel serverless functions
- **AI**: LangChain + LangGraph, Google Gemini (chat + reasoning models)
- **Flight deals**: Seats.aero Partner API (live search + trip details)
- **Transport routing**: OSRM (free walking/driving times) + Nominatim (geocoding)
- **Weather**: Open-Meteo (forecast + long-range climate projections)
- **Images**: Wikipedia + Wikimedia Commons (deduplicated)
- **News**: Google Gemini web search grounding
- **Date parsing**: chrono-node
- **Database**: PostgreSQL + Drizzle ORM (for cached deals and conversation history)
- **Auth**: Clerk (sign-in/sign-up, anonymous sessions)
- **Deployment**: Vercel

---

## Key features

### Conversational chat
- Natural-language trip planning with follow-up questions.
- Vague message handling — asks warm, conversational follow-ups with example ideas.
- Context-aware loading statuses (e.g. *"Checking the weather..."*, *"Looking for deals..."*).
- Conversation history with dynamic titles and delete.
- Persistent conversations across sessions (for signed-in users).
- Mobile sidebar drawer with hamburger menu button.

### Live flight deals
- Top 5 lowest-mileage award deals from Seats.aero.
- **Diversified by origin city** — round-robin selection across multiple US gateways when no origin is specified.
- Each deal shows: origin → destination, airline, cabin, date, points, taxes, duration, stops.
- Clickable cards that link directly to the airline's booking page.

### Transport & getting around
- **Live routing** — real walking and driving times between every itinerary stop via OSRM.
- **Best mode per leg** — recommends walk, transit, or ride-share based on actual distance.
- **City transit tips** — which pass/card to buy, best apps, cultural tips (AI-generated).
- **Cost estimates** — day pass, single ride, taxi, ride-share, and weekly total.
- Green-themed card in the chat with per-day route breakdown.

### Daily route links
- Each day's landmarks are extracted and turned into a Google Maps directions URL.
- **Highlight summaries** — shows the key stops (e.g. "Louvre → Eiffel Tower → Montmartre").
- Clickable "Daily Routes" card in the chat.

### Section navigator
- **Desktop**: right-side tab listing all itinerary sections (days, weather, transport, packing, deals, routes).
- **Mobile**: floating button (top-right) opens a slide-out drawer with the same section list.
- Click any section to jump directly to it.

### Guardrails
- Wikipedia landmark verification.
- Critic checks for hallucinations, fake transit, inconsistent days.
- Route builder filters out non-place words.
- Image deduplication prevents repeated images.

### One Stop panel
- Sign-in-gated centered modal (95vw x 90vh).
- Save deals, itinerary, packing list, transport plan, and routes.
- To-do list and notes per trip.
- Copy-to-clipboard trip summary.
- localStorage persistence.

---

## API surface

- `POST /api/chat` — streaming chat endpoint (SSE) that runs the LangGraph conversation pipeline.
- `GET /api/chat/conversations` — list saved conversations for the current user.
- `DELETE /api/chat/conversations/[id]` — delete a conversation.
- `GET /api/chat/history` — load message history for a conversation.
- `POST /api/chat/merge-session` — merge anonymous session into user account on sign-in.
- `GET /api/deals` — paginated cached deals (legacy dashboard support).
- `POST /api/itinerary` — on-demand itinerary generation (legacy).
- `POST /api/booking-strategy` — booking strategy agent (legacy).
- `POST /api/logistics-check` — logistics check agent (legacy).
- `POST /api/email-itinerary` — email itinerary (legacy).
- `GET /api/cron/email-deals` — daily digest cron (legacy).

---

## Data sources

- **Seats.aero Partner API** — real award availability, trip details (duration, stops, aircraft).
- **OSRM** — real walking and driving routes between landmarks (free, no API key).
- **Nominatim / OpenStreetMap** — geocoding of landmark names to coordinates (free, no API key).
- **Open-Meteo** — destination weather forecast + long-range climate projections.
- **Wikipedia / Wikimedia Commons** — landmark verification and images (deduplicated).
- **Google Maps** — daily route directions links (no API key required, uses public URL format).
- **Google Gemini** (via LangChain) — chat, itinerary generation, transport tips, critic, and reasoning.
- **Clerk** — authentication and user management.

---

## Project structure

```
src/
  agents/
    conversation-graph.ts    # LangGraph state machine (extract → clarify → gather → guardrails → critic → respond)
    itinerary-guardrails.ts  # Wikipedia landmark verification + Google Maps route link builder
    transport.ts             # Transport agent: OSRM routing + Nominatim geocoding + LLM transit tips
    destination-images.ts    # Wikimedia image hydration (deduplicated)
    weather.ts               # Open-Meteo forecast + climate projections
    news-search.ts           # Destination news search (Gemini web search grounding)
    graph.ts                 # Itinerary graph for deal modal (architect → critic)
    ...
  lib/
    seatsaero.ts             # Seats.aero live search + trip details + deal diversification
    airline-booking.ts       # Airline-specific booking URL builder
    chat-state.ts            # Shared types (ChatPayload, SavedTrip, RouteLink, TransportPlan, etc.)
    chat-db.ts               # Conversation persistence
    ai-provider.ts           # LLM model configuration (Gemini/OpenAI)
    airports.ts              # Airport code/name mappings (70+ global destinations)
    city-map.ts              # IATA → city/country mappings (70+ entries for news search)
    airlines.ts              # Airline code → name/description mappings
    ...
  components/
    chat/
      ChatPage.tsx           # Main chat UI with sidebar, messages, section navigator, One Stop panel
      OneStopPanel.tsx       # Sign-in-gated modal for saved trips, to-dos, notes
    SplashRedirect.tsx       # Redirects old domain to jalan-ai.vercel.app
    WalkersIcon.tsx          # Custom walking figure logo
    AuthProvider.tsx         # Clerk provider wrapper
  app/
    api/
      chat/route.ts          # Streaming chat endpoint (SSE)
      chat/conversations/    # Conversation CRUD
      chat/history/          # Message history
      ...
scripts/
  smoke-test.ts              # Post-deploy smoke tests (deals, logistics, itinerary, chat endpoint)
```

---

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables** (see `.env.example`):
   - `SEATS_AERO_API_KEY` — Seats.aero Partner API key.
   - `GOOGLE_GENERATIVE_AI_API_KEY` or `OPENAI_API_KEY` — LLM provider key.
   - `GEMINI_API_KEY` — Gemini API key for news search grounding.
   - `DATABASE_URL` — PostgreSQL connection string.
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — Clerk auth keys.
   - `CHAT_MODEL` — optional, defaults to `gemini-flash-lite-latest`.

3. **Run the database migration:**
   ```bash
   npm run db:push
   ```

4. **Start the dev server:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   ```

6. **Deploy to Vercel:**
   ```bash
   npx vercel --prod
   npx vercel alias <deployment-url> jalan-ai.vercel.app
   npx vercel alias <deployment-url> flight-deals-dashboard.vercel.app
   ```

7. **Run smoke tests** (post-deploy):
   ```bash
   SMOKE_TEST_URL=https://jalan-ai.vercel.app npx tsx -r dotenv/config scripts/smoke-test.ts
   ```
   Verifies: deals with real airline info, logistics check, itinerary with images + day headings, no duplicate deals section, no tweak prompt in markdown, chat route links, diversified deals by origin.

---

## Highlights

- Built a **conversational travel planner** powered by a LangGraph multi-agent loop (extract → clarify → gather → guardrails → critic → respond) that turns natural-language requests into full itineraries.
- Added a **transport agent** that geocodes every itinerary stop via Nominatim, gets real walking/driving times via OSRM, recommends the best transport mode per leg, and generates city-specific transit tips + cost estimates via LLM.
- Integrated **live Seats.aero award deal search** with trip-detail enrichment (duration, stops, aircraft), direct airline booking links, and **deal diversification by origin city** (round-robin selection across US gateways).
- Added **hallucination guardrails** that verify every itinerary landmark against Wikipedia and flag unverified places for the critic to reject.
- Implemented **daily Google Maps route links** with highlight summaries by extracting landmarks from the itinerary and building clickable directions URLs — no API key required.
- Built a **deduplicated image hydration agent** that prevents repeated images across itinerary days by tracking used Wikimedia URLs and skipping duplicates.
- Supports **70+ global destinations** with fallback to city name for weather, news, and images when IATA codes aren't in the lookup tables.
- Built a **section navigator** (desktop sidebar + mobile drawer) that lets users jump to any itinerary section.
- Built a **One Stop panel** (sign-in-gated modal) for users to save deals, itineraries, transport plans, packing lists, routes, to-dos, and notes per trip.
- Integrated **Clerk authentication** with anonymous session merging and sign-in-gated features.
- Added **vague message handling** — when users send unclear messages, the agent asks warm, conversational follow-ups with example trip ideas.
- Used **chrono-node** for flexible natural-language date parsing (e.g. *"in two weeks"*, *"next October"*, *"2 week trip"*).
- Implemented **post-deploy smoke tests** that verify deals, logistics, itinerary quality, route links, deal diversification, and chat endpoint behavior.
