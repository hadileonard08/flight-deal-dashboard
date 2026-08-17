# Flight Deal Dashboard

**Live site:** https://flight-deals-dashboard.vercel.app

An autonomous, multi-agent flight-deal dashboard. It scrapes real award space from the US to Asia, values each redemption against the cheapest live one-way cash alternative, categorizes the deal, and generates AI-powered itineraries on demand for the best redemptions.

Built with Next.js, PostgreSQL, LangChain/LangGraph, and a continuous deal pipeline.

---

## What the dashboard shows

The dashboard is split into two levels:

1. **Home page** — a grid of origin-city cards. Each card shows:
   - The city name.
   - Total number of deals available from that city.
   - A breakdown of deal quality: **GOOD**, **MAYBE**, **OKAY**, and **OTHER**.
   - The lowest points or cash starting price for that city.

2. **City page** (`/origin/[city]`) — every deal from the selected origin. It includes a filter bar and pagination:
   - **Category** (GOOD / MAYBE / OKAY / OTHER)
   - **Airline**
   - **Cabin** (Economy, Premium Economy, Business, First)
   - **Trip type** (One Way / Round Trip)
   - **Month**, **Year**, **Week**
   - **Sort by** Deals, Points, or Date

Click any deal card to open the **Deal Modal** with full details.

---

## Deal categories and how they are scored

Every deal is scored with the points-and-miles metric **cents per point (CPP)**:

```
CPP = (Cash Price − Taxes & Fees) ÷ Points Required × 100
```

The thresholds are:

| Category | CPP threshold | Color in the UI |
| --- | --- | --- |
| **GOOD** | ≥ 2.0¢ | green |
| **MAYBE** | ≥ 1.5¢ | yellow |
| **OKAY** | ≥ 1.0¢ | blue |
| **OTHER** | < 1.0¢ | gray |

A higher CPP means your points are worth more. A GOOD deal means the points redemption is worth at least 2 cents per point, which is the common "great value" benchmark in the points-and-miles community.

### How Cash Price is determined

The **Cash Price** used in the formula is the cheapest one-way cash flight found for the **same route, cabin, and departure date**. It is looked up from:

1. **Duffel API** (preferred, if a `DUFFEL_API_TOKEN` is configured).
2. **Google Flights** via `fast-flights-ts` (fallback if Duffel fails or is not configured).
3. **Static route estimate table** (last-resort fallback if both live sources fail).

Important caveats:

- The cheapest cash option may be on a **different airline** than the award flight. The modal explicitly labels this as the **Representative Cash Flight Details** and says: *"Based on the cheapest one-way cash option found for this route and cabin. Your actual award flight may differ in airline, timing, stops, or layover."*
- The cash price is now cached and looked up per `route/cabin/date`, so the date you click matters.
- If the live lookup does not find any cash option, the modal still shows the section but notes that no representative cash details are available.

---

## The deal modal

Opening a deal shows:

- **Route, airline, cabin, and date**
- **Price** — points required, plus taxes and fees when applicable
- **Why this is a [category] deal** — a short rationale, including the CPP math when a live cash price exists
- **Representative Cash Flight Details** — duration, stops, layover airport and duration, and the cash airline
- **Book This Flight** — a direct booking link to the Seats.aero search page
- **Email this itinerary** — enter an email and the full itinerary is sent via Resend (only for GOOD deals, see below)

---

## AI Itineraries

Itineraries are **not** pre-generated for every deal. They are created **on demand** when you open a **GOOD** deal.

When you click a GOOD deal, the system:

1. Checks the database for an existing full itinerary.
2. If one exists, it returns it immediately.
3. If not, it calls the agentic pipeline to build one and caches it in the database.

The generated itinerary includes:

- Flight and arrival reality check
- 5-day destination weather outlook from Open-Meteo
- Recent destination news from a live web search
- A destination hero image and daily Wikipedia images
- A 5-day activity plan in a cabin-appropriate tone
- Direct booking link

Because the heavy AI work happens only when a GOOD deal is opened, the dashboard stays fast and the pipeline stays cheap.

---

## Data sources and refresh

### Sources

- **Seats.aero API** — real mileage-program award space (points, airline, cabin, dates, taxes)
- **Duffel API** — live one-way cash offers
- **fast-flights-ts / Google Flights** — fallback cash price lookup
- **Open-Meteo** — 5-day destination weather
- **Wikipedia / Wikimedia** — destination and daily activity images
- **Gemini or OpenAI (via LangChain)** — destination news search and AI itinerary generation
- **Resend** — on-demand and digest email delivery

### Refresh cadence

The deal pipeline runs automatically every **3 hours** via GitHub Actions (`.github/workflows/pipeline.yml`). It can also be triggered manually from the Actions tab.

The scraper requests award space up to **1 year out** and processes up to **12,000 records** per run. Categories, cash prices, and any on-demand itineraries are stored in PostgreSQL and served by the Next.js API.

---

## Tech stack

- **Framework**: Next.js 14 (App Router), TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **AI & multi-agent**: LangChain + LangGraph, Gemini or OpenAI
- **Cash pricing**: Duffel API, fast-flights-ts (Google Flights)
- **UI**: Tailwind CSS, Lucide React, SWR
- **Email**: Resend, `marked` for Markdown → HTML
- **Deployment**: Vercel
- **Pipeline automation**: GitHub Actions

---

## API endpoints

The dashboard uses these endpoints internally:

- `GET /api/origins` — origin cities with counts and category breakdowns
- `GET /api/deals` — paginated deals with filtering
- `GET /api/filter-options` — available filter values (airlines, cabins, categories, months, years, weeks)
- `POST /api/itinerary` — generate and return the full AI itinerary for a GOOD deal
- `POST /api/email-itinerary` — email a specific deal to an address
- `GET /api/cron/email-deals` — daily digest trigger (intended for Vercel cron)

---

## Local setup

1. Clone the repository:

   ```bash
   git clone https://github.com/hadileonard08/flight-deal-dashboard.git
   cd flight-deal-dashboard
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the environment file and fill in your keys:

   ```bash
   cp .env.example .env
   ```

   Required for the pipeline:

   - `DATABASE_URL` — PostgreSQL connection string
   - `SEATS_AERO_API_KEY` — award-space source
   - `GEMINI_API_KEY` or `OPENAI_API_KEY` — reasoning and itineraries

   Optional but recommended:

   - `DUFFEL_API_TOKEN` — more reliable live cash prices
   - `RESEND_API_KEY` — email sending
   - `FROM_EMAIL` — sender address
   - `NOTIFICATION_EMAIL` — daily digest recipient

4. Run the local dev server:

   ```bash
   npm run dev
   ```

5. Run the pipeline once to populate the database:

   ```bash
   npm run clear:db
   npm run run:pipeline
   ```

---

## Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Build for production |
| `npm run run:pipeline` | Scrape, evaluate, and store flights and deals |
| `npm run clear:db` | Delete all `flights` and `deals` records |
| `npm run clear:db && npm run run:pipeline` | Full refresh |

---

## Important notes for readers

- **Cash prices are estimates.** The system tries to find the cheapest one-way cash option for the exact route, cabin, and date. The actual award flight may be on a different airline, route, or schedule.
- **"OTHER" deals are not bad flights** — they are redemptions where the CPP is below 1.0¢, meaning paying cash or waiting for a better award is usually a better use of points.
- **Itineraries are generated on demand.** The first time you open a GOOD deal, the modal may show a brief loading state while the AI builds the plan.
- **Data refreshes automatically** every 3 hours, but you can run the pipeline manually at any time.

---

## License

MIT
