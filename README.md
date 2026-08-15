# Autonomous Flight Deal & Itinerary Generator

A full-stack, multi-agent flight tracking and itinerary generation system that continuously scrapes flight deals from major US gateways to Asia, evaluates them against regional baseline pricing, and triggers a LangGraph multi-agent loop to generate highly customized luxury honeymoon itineraries when top-tier deals are found.

## Features

- **Multi-Agent System**: LangGraph-powered AI agents for itinerary generation
- **Real-time Deal Tracking**: Monitors flight deals from US to Asia
- **AI-Powered Evaluation**: Uses GPT-4o to evaluate and categorize deals
- **Auto-Generated Itineraries**: Creates luxury honeymoon itineraries for top deals
- **Discord Notifications**: Instant alerts when good deals are found
- **Web Dashboard**: Next.js UI to view deals and itineraries
- **Database Storage**: PostgreSQL with Drizzle ORM for persistence

## Tech Stack

- **Frameworks**: Next.js 14+ (App Router), Node.js (TypeScript)
- **Database**: PostgreSQL + Drizzle ORM
- **AI & Multi-Agent**: Gemini or OpenAI SDK (gpt-4o, gpt-4o-mini) via @langchain + @langchain/langgraph
- **Styling & UI**: Tailwind CSS, Lucide React, SWR
- **External APIs**: Duffel API (real flight data), AviationStack API, Seats.aero API, Ticketmaster API, Discord Webhooks

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 16+
- Gemini API Key or OpenAI API Key (for itinerary/reasoning generation)
- Discord Webhook URL

### Installation

1. Clone the repository and navigate to the project directory
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your actual API keys and database URL.

4. Set up PostgreSQL and create the database:
   ```bash
   createdb flight_tracker
   ```

5. Run database migrations:
   ```bash
   npm run db:push
   ```

### Running the Application

**Start the development server:**
```bash
npm run dev
```

**Run the flight deal pipeline:**
```bash
npm run run:pipeline
```

**Build for production:**
```bash
npm run build
npm start
```

## Project Structure

```
src/
├── agents/           # AI agent implementations
├── app/             # Next.js app router pages and API routes
├── db/              # Database schema and connection
├── lib/             # Utility functions and configuration
└── scripts/         # Standalone scripts (pipeline runner, etc.)
```

## How It Works

1. **Agent 1 (Scraper)**: Scrapes real award availability (points/miles) from the Seats.aero Partner API, falling back to Duffel/AviationStack/simulated cash data if not configured
2. **Agent 2 (Evaluator)**: Evaluates deals against regional thresholds using AI
3. **LangGraph System**: Generates luxury honeymoon itineraries for good deals
4. **Agent 3 (Notifier)**: Sends Discord notifications for new deals
5. **Dashboard**: Displays deals and itineraries in real-time

## Getting Real Flight Data

### Option 0: Seats.aero API (Award/points deals — recommended if you want miles-based deals)
- **Real award availability**: Cached search across 20+ mileage programs, 70,000+ routes
- **Free for Pro users**: Up to 1,000 API calls/day at no cost
- **Sign up**: Generate a key on your [Seats.aero settings page](https://seats.aero/settings) (requires a Pro subscription)
- **Auth**: Uses the `Partner-Authorization` header (not Bearer) with your `pro_...` key
- **Add to .env**:
  ```
  SEATS_AERO_API_KEY="pro_your_key_here"
  ```
- Note: this returns **points required**, not cash prices — the dashboard displays these deals with a points/taxes breakdown instead of a dollar amount.

To get real *cash-priced* flight data instead of simulated data:

### Option 1: Duffel API (Recommended)
- **Self-serve, no affiliate program**: Sign up and start querying in minutes
- **Free test mode**: Build and test your integration risk-free (uses simulated "Duffel Airways" data)
- **Real prices**: Activate your account (business details, no cost) to switch to a `duffel_live_` token and get real airline offers
- **Sign up**: https://duffel.com/
- **Add to .env**:
  ```
  DUFFEL_API_TOKEN="duffel_live_your_token_here"
  ```

### Option 2: AviationStack API
- **Real-time flight schedules/status**: Free tier available (100 requests/month)
- **No pricing data**: Fares are still simulated even with this key, only routes/airlines/times are real
- **Sign up**: https://aviationstack.com/
- **Add to .env**:
  ```
  AVIATIONSTACK_API_KEY="your_api_key"
  ```

Note: Amadeus's free self-service developer program was discontinued in 2026, so it's no longer an option. Most flight-pricing APIs (Kiwi, Skyscanner, etc.) require an affiliate/commercial agreement since they monetize via booking commissions — Duffel is one of the few that doesn't.

Once you add a Duffel live token, the pipeline will automatically use real flight data.

## AI Provider for Itineraries & Reasoning

Deal reasoning and itinerary generation (via the LangGraph architect/critic loop) use whichever provider is configured, preferring **OpenAI** over Gemini:

1. `OPENAI_API_KEY` set → uses OpenAI (`gpt-4o`) via `@langchain/openai`
2. Otherwise `GEMINI_API_KEY` set → uses Gemini (`gemini-flash-lite-latest`) via `@langchain/google-genai`
3. Otherwise → falls back to static template itineraries

This preference only affects text generation (reasoning + itinerary writing). The live web news search below always uses Gemini specifically, regardless of this setting, since it depends on a Gemini-only feature.

Get a free Gemini key at https://aistudio.google.com/apikey — it must be a persistent API key (starts with `AIzaSy...`), not a temporary OAuth access token copied from a browser session or `gcloud auth print-access-token`, which will fail with a `401 ACCESS_TOKEN_TYPE_UNSUPPORTED` error.

```
GEMINI_API_KEY="AIzaSy_your_real_key_here"
```

Note: both providers require an active billing account on their respective platforms even to use their free-tier quotas for certain features (e.g. OpenAI returns `429 insufficient_quota` with no payment method on file; Gemini's Google Search grounding - see below - is unavailable on the free tier at all). A `401`/`403`/`429` here means the key authenticates but the account needs billing set up, not a code issue.

## Real Local Events in Itineraries

For every **GOOD_DEAL**, the evaluator looks up real events happening at the destination city during the trip dates via the **Ticketmaster Discovery API** (concerts, sports, theater, festivals) and works them into the generated itinerary instead of inventing fake ones.

- **Free, no affiliate program required**: Sign up at https://developer.ticketmaster.com/
- **Add to .env**:
  ```
  TICKETMASTER_API_KEY="your_api_key"
  ```
- Without a key, itineraries are generated normally but skip the "Local Events During Your Stay" section
- Configured for Tokyo (HND/NRT), Hong Kong (HKG), Seoul (ICN), Singapore (SIN), and Bangkok (BKK), but **Ticketmaster's actual ticketed-event coverage in Asia is limited** — in practice Singapore reliably returns real events, while Tokyo, Hong Kong, Seoul, and Bangkok usually return none (Ticketmaster doesn't operate direct ticketing in those markets). The lookup fails safe either way: no events found just means no events section is added, never a fabricated one.

## Live Web News in Itineraries

For every **GOOD_DEAL**, in addition to Ticketmaster events, the evaluator also performs a **live Google Search** (via Gemini's built-in search grounding tool) for real, current news relevant to the destination during the trip window — festivals, public holidays, weather advisories, safety/travel advisories, transit disruptions. This is an actual web search executed by Google on Gemini's behalf, not a hallucinated summary; if nothing relevant is found, no section is added.

- **Requires**: `GEMINI_API_KEY` (see [AI Provider](#ai-provider-for-itineraries--reasoning) section above) — this feature is Gemini-only since it uses Gemini's `google_search` tool
- **No extra setup needed** beyond having a working Gemini key
- Note: Google Search grounding has its own separate, smaller quota from regular Gemini text generation. If you see `429` errors specifically for this feature while normal itinerary generation still works, it means the grounding-specific quota is exhausted (resets daily on the free tier, or is lifted with billing enabled) — this fails safe by skipping the news section, never blocking itinerary generation.

## API Endpoints

- `GET /api/deals` - Retrieve all flight deals with itineraries

## Configuration

### Deal Evaluation Standard

For **points/award redemptions** (Seats.aero data), deals are evaluated by **cents-per-point (CPP) value** - the standard metric used by the points & miles community:

```
CPP = (estimated one-way cash value of the seat - taxes/fees paid) / points required × 100
```

- **GOOD_DEAL**: CPP ≥ 2.0¢/point (the widely-used "good value" benchmark)
- **MAYBE_GOOD_DEAL**: CPP ≥ 1.5¢/point
- **OKAY_DEAL**: CPP ≥ 1.0¢/point - fair but unremarkable
- **BAD_DEAL**: CPP < 1.0¢/point - you'd likely get more value redeeming elsewhere

Cash value estimates are rough per-destination/cabin figures (see `ONE_WAY_CASH_ESTIMATE` in `src/lib/config.ts`), not live pricing - CPP is a heuristic to flag genuinely good redemptions, not an exact valuation. Destinations without a cash estimate fall back to fixed points thresholds by cabin/region.

For **cash fares** (Duffel/AviationStack/simulated data), the same 4 tiers are used but based on fixed price thresholds by cabin class and origin region instead of CPP.

All four tiers are saved and shown on the dashboard (nothing is silently dropped). To keep AI usage bounded, only `GOOD_DEAL`/`MAYBE_GOOD_DEAL` get an AI-generated rationale; `OKAY_DEAL`/`BAD_DEAL` use static copy instead. Only `GOOD_DEAL` gets a full AI-generated itinerary with local events and live news.

### Regional Thresholds (cash fares & fallback points thresholds)

- **West Coast (LAX, SFO, SEA, SAN)**: 50,000 points for business class
- **Central (ORD, DFW, DEN, MSP, MDW)**: 60,000 points for business class
- **East Coast (JFK, EWR, IAD, ATL, MIA)**: 60,000 points for business class

To keep AI usage bounded, only `GOOD_DEAL` and `MAYBE_GOOD_DEAL` get an AI-generated rationale; `OKAY_DEAL`/`BAD_DEAL` use clear static copy instead. Only `GOOD_DEAL` gets a full AI-generated itinerary with local events and live news.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
