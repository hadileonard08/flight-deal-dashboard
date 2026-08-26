# Project Rules for Devin

## Flight Deal Pipeline

- Build: `npm run build`
- Deploy: `npx vercel --prod` then alias to `flight-deals-dashboard.vercel.app`
- Refresh data: `npm run clear:db && npm run run:pipeline`
  - `clear:db` deletes all `flights` and `deals`.
  - `run:pipeline` runs the full scraping/evaluation pipeline.
- To refresh production data: set `DATABASE_URL` to the Vercel Postgres URL, then run the same commands. Vercel CLI does not expose sensitive env values locally, so the pipeline must run in GitHub Actions (where `DATABASE_URL` is a repo secret) or on a machine with the Vercel Postgres connection string.

## Cost & AI Guardrails

- **Heavy AI is on-demand only; the pipeline stays fast even with up to 1 year of data.**
  - `processFlights` uses AI-generated reasoning for the first `MAX_AI_REASONING` (250) `GOOD_DEAL`/`MAYBE_GOOD_DEAL` flights.
  - The pipeline no longer pre-generates or stores deterministic fallback itineraries.
  - Full agentic itineraries (live news, Open-Meteo weather, LangGraph AI loop, Wikipedia images) are generated on demand when a user opens a `GOOD_DEAL` in the modal and are then cached in PostgreSQL.
  - Flights and deals are inserted in 1,000-row batches for speed.
- **Deal quality is based on the standard CPP formula.**
  - `CPP = (Cash Price − Taxes & Fees) / Points Required × 100`.
  - `GOOD_DEAL` ≥ 2.0¢, `MAYBE_GOOD_DEAL` ≥ 1.5¢, `OKAY_DEAL` ≥ 1.0¢, otherwise `BAD_DEAL`.
  - Cash Price comes from Duffel (real one-way offers in any cabin) when configured, then the Travelpayouts affiliate API (real-time Flight Search when approved, otherwise the free Data API `prices_for_dates` for economy). It prefers the award airline, then falls back to the cheapest cash option for that exact route and date. If live lookup fails, the static estimate table is used.
- The scraper uses `order_by=lowest_mileage` and searches up to 365 days (1 year) out with a max of 12,000 records per run.
- `/api/deals` is paginated; the dashboard loads 20 deals per page on demand.

## Maintenance Mode

- Set the environment variable `MAINTENANCE_MODE=true` to put the site into maintenance.
- When enabled, all page requests (except `/maintenance` and static assets) are redirected to `/maintenance`, which shows "We are updating".
- To enable on Vercel: add `MAINTENANCE_MODE=true` in the project environment variables and redeploy (`npx vercel --prod`).
- To restore the site, change it to `MAINTENANCE_MODE=false` (or remove it) and redeploy.

## Testing (save Gemini tokens — test locally first!)

### Image quality test (NO Gemini tokens, NO server required)
```bash
npx tsx scripts/test-images.ts                          # full test (14 landmarks + 5 destinations + hydration)
npx tsx scripts/test-images.ts --landmarks "X" "Y"      # test specific landmarks
npx tsx scripts/test-images.ts --destination London     # test specific destination
npx tsx scripts/test-images.ts --full                   # hydration test only
```

### Smoke tests (local first, then production)
```bash
# Step 1: Start dev server
npm run dev

# Step 2: Run smoke tests against localhost (uses Gemini tokens but catches bugs before deploying)
npx tsx scripts/smoke-test.ts --local

# Step 3: Skip chat tests to save tokens (only tests deals, logistics, itinerary API)
npx tsx scripts/smoke-test.ts --local --skip-chat

# Step 4: Run against production after deploying
npx tsx scripts/smoke-test.ts
```

- `--local` tests against `http://localhost:3000` (default for local dev)
- `--skip-chat` skips all chat tests (3 chat tests consume ~$0.05-0.10 in Gemini tokens per run)
- Cities are randomized from a pool of 15 destinations each run (Tokyo, Paris, London, Bangkok, Seoul, Barcelona, Rome, Istanbul, Singapore, Amsterdam, Dubai, Hong Kong, Madrid, Sydney, Lisbon)
- The football trip test always uses London (to verify stadium landmarks)

