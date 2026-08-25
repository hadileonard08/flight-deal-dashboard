---
name: smoke-test
description: Run post-deploy smoke tests for the flight-deal dashboard
subagent: true
allowed-tools:
  - exec
  - read
  - write
  - edit
---

After every code update and deploy, run the flight-deal dashboard smoke test routine:

1. Build the project: `npm run build`
2. Deploy to Vercel: `npx vercel --prod --yes`
3. Alias the production deployment to `flight-deals-dashboard.vercel.app` if it is not already aliased.
4. Run `npx tsx -r dotenv/config scripts/smoke-test.ts` (set `SMOKE_TEST_URL` if needed; it defaults to `https://flight-deals-dashboard.vercel.app`).
5. The smoke test verifies:
   - `/api/deals` returns deals with real airline info (duration, stops, cashAirline, aircraftType, segments) from Seats.aero.
   - `/api/logistics-check` for a multi-stop deal mentions the real layover airport and stop count.
   - `/api/itinerary` for a GOOD_DEAL returns an itinerary containing at least one image.
   - Itinerary has day headings at any markdown level (## Day 1, ### Day 1, etc.).
   - Itinerary markdown does NOT contain a duplicate "Points Flight Deals" section (deals are in payload cards).
   - Itinerary markdown does NOT contain "Want to tweak anything" (moved to a UI element).
   - `/api/chat` for a plan_trip request returns route links and diversified deals (multiple origin cities).
   - Chat response markdown does NOT contain a "Points Flight Deals" heading.
6. If any assertions fail, report the failures, inspect the relevant code, and fix the issue before declaring the update complete.
