# Project Rules for Devin

## Flight Deal Pipeline

- Build: `npm run build`
- Deploy: `npx vercel --prod` then alias to `flight-deals-dashboard.vercel.app`
- Refresh data: `npm run clear:db && npm run run:pipeline`
  - `clear:db` deletes all `flights` and `deals`.
  - `run:pipeline` runs the full scraping/evaluation pipeline.

## Cost & AI Guardrails

- **Only `GOOD_DEAL` flights trigger expensive API calls, and only the first 300 of them per pipeline run.**
  - `agent2-evaluator.ts` only calls `searchDestinationNews`, `getWeatherForecast`, and `generateHoneymoonItinerary` for the first `MAX_AI_ITINERARY` (300) `GOOD_DEAL` flights.
  - Every `GOOD_DEAL` still gets a deterministic `Flight & Arrival Details` summary in its itinerary.
  - `MAYBE_GOOD_DEAL`, `OKAY_DEAL`, and `BAD_DEAL` get canned/deterministic reasoning, no news, no weather, and no AI-generated itinerary.
  - `hasAIProvider` reasoning is also capped to the first `MAX_AI_REASONING` (500) `GOOD_DEAL`/`MAYBE_GOOD_DEAL` flights.
- The scraper now uses `order_by=lowest_mileage` and paginates up to 5,000 records per run to pull availability up to a year out.
