# Project Rules for Devin

## Flight Deal Pipeline

- Build: `npm run build`
- Deploy: `npx vercel --prod` then alias to `flight-deals-dashboard.vercel.app`
- Refresh local data: `npm run clear:db && npm run run:pipeline`
  - `clear:db` deletes all `flights` and `deals`.
  - `run:pipeline` runs the full scraping/evaluation pipeline (~2 min for 13k deals now).
- Refresh production data: set `DATABASE_URL` to the Vercel Postgres URL in the environment, then run the same commands. Vercel CLI `env run` does not expose sensitive env values, so it cannot be used locally for the production database.

## Cost & AI Guardrails

- **Only `GOOD_DEAL` flights get a detailed itinerary, and the pipeline avoids paid AI calls.**
  - `processFlights` uses deterministic canned reasoning for every deal (no paid LLM reasoning).
  - `GOOD_DEAL` flights get a deterministic 5-day itinerary; the first `MAX_ITINERARY` (50) also get a free Open-Meteo weather outlook.
  - No live news search, no LangGraph, no image hydration, and no paid model calls during normal pipeline runs.
  - Flights and deals are inserted in 1,000-row batches for speed.
- The scraper now uses `order_by=lowest_mileage` and paginates up to 5,000 records per run to pull availability up to a year out.
- `/api/deals` returns the 4,000 cheapest deals sorted by points to stay under Vercel's response-size limits.
