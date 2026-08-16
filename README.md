# Flight Deal Tracker

An autonomous, multi-agent system that monitors award and cash flight deals from the US to Asia, scores them with live market data, and generates AI-powered trip itineraries. Built with Next.js, PostgreSQL, and LangChain/LangGraph.

**Live dashboard:** https://flight-deals-dashboard.vercel.app

## What it does

- **Scrapes live award deals** from the Seats.aero Partner API (12,000+ real deals across US–Asia routes).
- **Fetches live cash prices** from the Duffel API and Google Flights to value each award redemption accurately.
- **Scores every deal** using the standard points & miles metric, cents-per-point (CPP):
  - `GOOD_DEAL` ≥ 2.0¢
  - `MAYBE_GOOD_DEAL` ≥ 1.5¢
  - `OKAY_DEAL` ≥ 1.0¢
  - `BAD_DEAL` < 1.0¢
- **Guards against mismatched cash data** — if the live cash option is not operated by the award airline, the system falls back to a static route estimate instead of showing a different airline's route (e.g., no Qatar Airways awards paired with a Manila-layover cash option).
- **Generates cabin-aware itineraries** only for `GOOD_DEAL`s through a LangGraph architect/critic loop.
- **Enriches itineraries** with 5-day weather, live destination news, Wikipedia images, and markdown formatting.
- **Displays deals** in a filterable Next.js dashboard with a split-view modal, live cash math, flight details, and direct booking links.
- **Emails itineraries** on demand or via a daily Vercel cron digest using Resend.

## How the agents work

1. **Agent 1 (Scraper)** — pulls real award availability from Seats.aero, normalizes routes, cabins, airlines, and points/tax data.
2. **Cash-Price Agent** — calls Duffel or Google Flights for airline-specific cash prices and flight details (duration, stops, layovers). Prefers a match for the award airline and falls back to a static estimate when no match exists.
3. **Agent 2 (Evaluator)** — runs the CPP guardrail, categorizes the deal, and (for `GOOD_DEAL`s) fetches weather, news, images, and triggers itinerary generation.
4. **LangGraph Itinerary System** — drafts a 5-day, cabin-consistent itinerary, then a critic checks for false upgrades, weather coverage, daily images, and tone. It refines until approved or max revisions.
5. **Email Agent** — converts the markdown itinerary to HTML and sends it on demand or in the daily digest.

The entire pipeline runs every 3 hours via the GitHub Actions workflow in `.github/workflows/pipeline.yml`.

## Data sources

- **Seats.aero API** — real mileage-program award space (points, airline, cabin, dates)
- **Duffel API** — live cash offers and airline-specific routing
- **fast-flights-ts / Google Flights** — fallback cash price lookup when Duffel does not cover the date
- **Open-Meteo** — 5-day destination weather
- **Wikipedia/Wikimedia** — destination and daily activity photos
- **Gemini (via LangChain)** — live Google Search for destination news and the architect/critic itinerary loop
- **Resend** — transactional and digest email delivery

## Tech stack

- **Framework**: Next.js 14 (App Router), Node.js 20+, TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **AI & multi-agent**: LangChain + LangGraph, Gemini or OpenAI
- **Cash pricing**: Duffel API, fast-flights-ts (Google Flights)
- **Styling/UI**: Tailwind CSS, Lucide React, SWR
- **Email**: Resend, `marked` for Markdown → HTML
- **Deployment**: Vercel, GitHub Actions

## Deal evaluation

For points/miles deals:

```
CPP = (live one-way cash value of the seat − taxes/fees paid) / points required × 100
```

The cash value is the cheapest one-way cash fare found for the **same airline** on Duffel or Google Flights. If no matching airline offer is found, the system uses a static route estimate and does not show misleading flight details.

## Itinerary features

Every `GOOD_DEAL` itinerary includes:

- **Flight & Arrival Reality** — exact airline, route, cabin, and a "reality check" that no upgrades or partner re-routing are implied.
- **Representative Cash Flight Details** — duration, stops, layover airport, and layover duration, shown only when the cash flight matches the award airline.
- **Weather Outlook** — 5-day forecast with packing/activity notes.
- **Live News** — current happenings, festivals, holidays, or advisories from Google search.
- **Destination & Daily Photos** — a hero destination image and one Wikipedia image per day tied to a specific activity.
- **Cabin-Appropriate Tone** — luxury stays/transfers/dining for Business/First, smart-budget options for Economy.

## Email

Email is handled by **Resend**.

- **Free tier**: $0/mo, 3,000 emails/month, 100/day.
- **On-demand**: open any deal and enter an email to receive the full itinerary.
- **Daily digest**: Vercel runs `/api/cron/email-deals` once a day at 9am and emails the best `GOOD_DEAL`s to `NOTIFICATION_EMAIL`.

For real outbound email, verify a domain at https://resend.com/domains and set `FROM_EMAIL` to an address on that domain. `onboarding@resend.dev` works only for testing to your Resend account email.

## API endpoints

- `GET /api/deals` — all deals with itineraries
- `POST /api/email-itinerary` — send a specific deal to an email
  - Body: `{ "email": "user@example.com", "dealId": "..." }`
- `GET /api/cron/email-deals` — daily digest trigger (intended for Vercel cron)

## Configuration

Copy `.env.example` to `.env` and fill in the keys:

- `DATABASE_URL` — PostgreSQL connection string
- `GEMINI_API_KEY` or `OPENAI_API_KEY` — for reasoning and itineraries
- `SEATS_AERO_API_KEY` — for award-space deals
- `DUFFEL_API_TOKEN` — for live cash-priced deals
- `RESEND_API_KEY` — for email
- `FROM_EMAIL` — sender address
- `NOTIFICATION_EMAIL` — recipient for the daily digest

The GitHub Actions workflow in `.github/workflows/pipeline.yml` runs the deal pipeline every 3 hours using `npm run run:pipeline`.

## License

MIT

## Contributing

Contributions are welcome — feel free to open a Pull Request.
