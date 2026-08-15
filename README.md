# Autonomous Flight Deal & Itinerary Generator

A full-stack, multi-agent flight tracking and itinerary generation system that continuously scrapes flight deals from major US gateways to Asia, evaluates them against regional baseline pricing, and triggers a LangGraph multi-agent loop to generate highly customized, cabin-aware itineraries when top-tier deals are found. The dashboard displays every deal, and a built-in email agent can send custom itineraries or a daily digest of the best finds.

## Live Demo

The dashboard is deployed at **https://flight-deals-dashboard.vercel.app**.

## Features

- **Multi-Agent System**: LangGraph-powered AI agents for itinerary generation with an architect/critic loop
- **Real-time Deal Tracking**: Monitors award and cash flight deals from the US to Asia
- **AI-Powered Evaluation**: Categorizes deals as `GOOD_DEAL`, `MAYBE_GOOD_DEAL`, `OKAY_DEAL`, or `BAD_DEAL` with natural-language reasoning
- **Cabin-Aware Itineraries**: Luxury recommendations for Business/First, smart-budget suggestions for Economy, and no false upgrades or made-up services
- **Destination & Daily Photos**: Wikipedia-sourced images for the destination and one landmark/activity photo for each day of the itinerary
- **Weather & News**: 5-day Open-Meteo forecasts and live Google web-search news folded into every `GOOD_DEAL` itinerary
- **Direct Airline Booking**: "Book This Flight" buttons link directly to airline websites when the carrier is recognized
- **Web Dashboard**: Next.js UI with clickable cards, split-view modals, and filters
- **Email Custom Itinerary**: Send any deal's full itinerary straight to an email address from the dashboard modal
- **Daily Digest Cron**: Vercel cron sends an automated daily email with the top `GOOD_DEAL`(s) and a full featured itinerary
- **Database Storage**: PostgreSQL with Drizzle ORM for persistence

## Tech Stack

- **Frameworks**: Next.js 14+ (App Router), Node.js 20+ (TypeScript)
- **Database**: PostgreSQL + Drizzle ORM
- **AI & Multi-Agent**: LangChain + LangGraph (Gemini or OpenAI)
- **Styling & UI**: Tailwind CSS, Lucide React, SWR
- **Email**: Resend, marked (Markdown → HTML)
- **External APIs**: Seats.aero, Duffel, AviationStack, Ticketmaster, Open-Meteo, Wikipedia

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Gemini API Key or OpenAI API Key (for itinerary/reasoning generation)
- Resend API Key (for email features)
- Optional: a verified domain for real outbound email, or use `onboarding@resend.dev` for testing

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
├── agents/           # AI agent implementations (scraper, evaluator, weather, images, pipeline)
├── app/              # Next.js app router pages and API routes
│   └── api/          # /deals, /email-itinerary, /cron/email-deals
├── db/               # Database schema and connection
├── lib/              # Utility functions, config, email helpers
├── scripts/          # Standalone scripts (pipeline runner, clear-db)
└── app/              # Dashboard UI
```

## How It Works

1. **Agent 1 (Scraper)**: Scrapes real award availability (points/miles) from the Seats.aero Partner API, falling back to Duffel/AviationStack/simulated cash data if not configured
2. **Agent 2 (Evaluator)**: Evaluates deals against regional thresholds, fetches weather, real events, live news, and destination/day images, and writes a cabin-consistent rationale
3. **LangGraph System**: Generates and critiques a 5-day itinerary for every `GOOD_DEAL`, complete with weather outlook, reality check, and daily images
4. **Email Agent**: Sends custom itineraries on demand via `/api/email-itinerary` and a daily digest via `/api/cron/email-deals`
5. **Dashboard**: Displays all deals and full itineraries in a split-view modal

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

Note: Amadeus's free self-service developer program was discontinued in 2026, so it is no longer an option. Most flight-pricing APIs (Kiwi, Skyscanner, etc.) require an affiliate/commercial agreement since they monetize via booking commissions — Duffel is one of the few that doesn't.

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

## Weather & Images in Itineraries

For every **GOOD_DEAL**:

- **Weather**: a 5-day Open-Meteo forecast is fetched and included as a "Weather Outlook" section.
- **Destination photo**: a hero image of the destination city is pulled from Wikipedia and embedded at the top.
- **Daily photos**: each day of the itinerary includes a Wikipedia image of a specific landmark or activity planned for that day.

These are added after the AI draft is generated so the itinerary stays accurate and the photos are real.

## Email Setup

Email features are powered by **Resend**.

- **Free tier**: $0/mo, 3,000 emails/month, 100/day
- **Sign up**: https://resend.com
- **Add to .env**:
  ```
  RESEND_API_KEY="re_your_key_here"
  FROM_EMAIL="Flight Deals <hello@yourdomain.com>"
  NOTIFICATION_EMAIL="you@example.com"
  ```

### Sending to real recipients

Resend's `onboarding@resend.dev` address can only be used to send to the email address associated with your Resend account (for testing). To send to anyone else, add and verify a domain at https://resend.com/domains, then use an address on that domain as `FROM_EMAIL`.

### What you can do

- **Send a custom itinerary**: open any deal in the dashboard, enter an email, and click **Send**. The email includes the flight summary, booking link, and full AI itinerary with resized images.
- **Daily digest**: Vercel runs `/api/cron/email-deals` every day at 9am and emails a digest of the best `GOOD_DEAL`s to `NOTIFICATION_EMAIL`.

## API Endpoints

- `GET /api/deals` - Retrieve all flight deals with itineraries
- `POST /api/email-itinerary` - Send a specific deal's itinerary to an email address
  - Body: `{ "email": "user@example.com", "dealId": "..." }`
- `GET /api/cron/email-deals` - Trigger the daily digest (intended for Vercel cron, requires `NOTIFICATION_EMAIL` to be set)

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

All four tiers are saved and shown on the dashboard (nothing is silently dropped). To keep AI usage bounded, only `GOOD_DEAL`/`MAYBE_GOOD_DEAL` get an AI-generated rationale; `OKAY_DEAL`/`BAD_DEAL` use static copy instead. Only `GOOD_DEAL` gets a full AI-generated itinerary with local events, live news, weather, and images.

### Regional Thresholds (cash fares & fallback points thresholds)

- **West Coast (LAX, SFO, SEA, SAN)**: 50,000 points for business class
- **Central (ORD, DFW, DEN, MSP, MDW)**: 60,000 points for business class
- **East Coast (JFK, EWR, IAD, ATL, MIA)**: 60,000 points for business class

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
