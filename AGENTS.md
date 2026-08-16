# Project Rules for Devin

## Flight Deal Pipeline

- Build: `npm run build`
- Deploy: `npx vercel --prod` then alias to `flight-deals-dashboard.vercel.app`
- Refresh data: `npm run clear:db && npm run run:pipeline`
  - `clear:db` deletes all `flights` and `deals`.
  - `run:pipeline` runs the full scraping/evaluation pipeline.
- To refresh production data: set `DATABASE_URL` to the Vercel Postgres URL, then run the same commands. Vercel CLI does not expose sensitive env values locally, so the pipeline must run in GitHub Actions (where `DATABASE_URL` is a repo secret) or on a machine with the Vercel Postgres connection string.

## Cost & AI Guardrails

- **Agentic workflow is restored with caps to keep 3-month runs fast.**
  - `processFlights` uses AI-generated reasoning for the first `MAX_AI_REASONING` (250) `GOOD_DEAL`/`MAYBE_GOOD_DEAL` flights.
  - `GOOD_DEAL` flights get a full agentic itinerary: live news, Open-Meteo weather, LangGraph/Honeymoon AI itinerary, and Wikipedia images for the first `MAX_AI_ITINERARY` (50) flights.
  - All other `GOOD_DEAL` flights get a deterministic fallback plan with a flight summary.
  - Flights and deals are inserted in 1,000-row batches for speed.
- **Deal quality is based on the standard CPP formula.**
  - `CPP = (Cash Price − Taxes & Fees) / Points Required × 100`.
  - `GOOD_DEAL` ≥ 2.0¢, `MAYBE_GOOD_DEAL` ≥ 1.5¢, `OKAY_DEAL` ≥ 1.0¢, otherwise `BAD_DEAL`.
  - Cash Price comes from live Google Flights via `fast-flights-ts`; if it fails, the static estimate table is used.
- The scraper uses `order_by=lowest_mileage` and searches 90 days (3 months) out with a max of 5,000 records per run.
- `/api/deals` returns the 4,000 cheapest deals sorted by points to stay under Vercel's response-size limits.
