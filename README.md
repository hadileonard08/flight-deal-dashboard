# Flight Deal Tracker

A fully automated flight-deal monitoring and itinerary generation system. It continuously scrapes award and cash fares from the US to Asia, evaluates them against regional baselines, and uses a LangGraph multi-agent loop to write cabin-aware, AI-generated itineraries for the best finds. Everything is surfaced in a Next.js dashboard, and the built-in email agent can send any itinerary on demand or deliver a daily digest of top deals.

**Live dashboard:** https://flight-deals-dashboard.vercel.app

## What it does

- **Scrapes deals** from multiple sources (Seats.aero award availability, Duffel/AviationStack cash data, and a simulated fallback).
- **Evaluates** every deal as `GOOD_DEAL`, `MAYBE_GOOD_DEAL`, `OKAY_DEAL`, or `BAD_DEAL` using points-per-cent or cash-region thresholds.
- **Generates itineraries** only for `GOOD_DEAL`s through an architect/critic agent loop. The output is cabin-consistent: luxury for Business/First, smart-budget for Economy, and never fabricates upgrades or premium services.
- **Enriches itineraries** with 5-day Open-Meteo weather forecasts, live web news, a Wikipedia destination photo, and one Wikipedia photo per day tied to a specific activity.
- **Displays everything** in a filterable dashboard with clickable cards, split-view modals, and direct airline booking links.
- **Emails itineraries** — either one-off from the dashboard or automatically via a daily Vercel cron — using Resend.

## How the agents work

1. **Agent 1 (Scraper)** pulls real award availability from the Seats.aero Partner API, falling back to Duffel/AviationStack/simulated data.
2. **Agent 2 (Evaluator)** scores each deal, then fetches weather, live web news, destination/day images, and feeds them to the itinerary generator.
3. **LangGraph Itinerary System** drafts a 5-day plan, then a critic checks for cabin consistency, false upgrades, weather coverage, and daily images. The loop refines until approved or max revisions.
4. **Email Agent** converts the markdown itinerary to HTML, constrains images, and sends it on demand or in the daily digest.

## Data sources

- **Seats.aero API** — real mileage-program award space (points, airline, cabin, dates)
- **Duffel API** — real cash offers when live, simulated data in test mode
- **AviationStack API** — real flight schedules/routes; cash prices are still simulated without Duffel live
- **Open-Meteo** — 5-day destination weather
- **Wikipedia/Wikimedia** — destination and daily activity photos
- **Gemini (via LangChain)** — live Google Search grounding for destination news and the architect/critic itinerary loop
- **Resend** — transactional and digest email delivery

## Tech stack

- **Framework**: Next.js 14 (App Router), Node.js 20+ on Vercel
- **Database**: PostgreSQL + Drizzle ORM
- **AI & multi-agent**: LangChain + LangGraph, Gemini or OpenAI
- **Styling/UI**: Tailwind CSS, Lucide React, SWR
- **Email**: Resend, `marked` for Markdown → HTML

## Deal evaluation

### Points/miles deals (Seats.aero)

Uses cents-per-point (CPP), the standard points & miles metric:

```
CPP = (estimated one-way cash value of the seat − taxes/fees paid) / points required × 100
```

- **GOOD_DEAL**: CPP ≥ 2.0¢
- **MAYBE_GOOD_DEAL**: CPP ≥ 1.5¢
- **OKAY_DEAL**: CPP ≥ 1.0¢
- **BAD_DEAL**: CPP < 1.0¢

### Cash deals (Duffel/AviationStack/simulated)

Same four tiers, but based on fixed cash/points thresholds by cabin and origin region.

Only `GOOD_DEAL` gets a full AI-generated itinerary with weather, news, and photos. `MAYBE_GOOD_DEAL` and `OKAY_DEAL` get a short rationale. `BAD_DEAL` is stored but not prioritized.

## Itinerary features

Every `GOOD_DEAL` itinerary includes:

- **Flight & Arrival Reality** — exact airline, route, cabin, and a "reality check" that no upgrades or partner re-routing are implied.
- **Weather Outlook** — 5-day forecast plus practical packing/activity notes.
- **Live News** — current happenings, festivals, holidays, or advisories from a real Google search.
- **Destination Photo** — a hero image of the destination city.
- **Daily Photos** — one Wikipedia image per day tied to a specific landmark or activity.
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
- `DUFFEL_API_TOKEN` — for cash-priced deals (test or live)
- `RESEND_API_KEY` — for email
- `FROM_EMAIL` — sender address
- `NOTIFICATION_EMAIL` — recipient for the daily digest

The GitHub Actions workflow in `.github/workflows/pipeline.yml` runs the deal pipeline every 3 hours using `npm run run:pipeline`.

## License

MIT

## Contributing

Contributions are welcome — feel free to open a Pull Request.
