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
   - `/api/itinerary` for a GOOD_DEAL returns an itinerary with:
     - At least one markdown image.
     - All image URLs are valid HTTP URLs pointing to image files.
     - No duplicate image URLs (same URL reused for multiple landmarks).
     - Day headings at any markdown level (## Day 1, ### Day 1, etc.).
     - No duplicate "Points Flight Deals" section (deals are in payload cards).
     - No "Want to tweak anything" in markdown (moved to a UI element).
   - `/api/chat` Tokyo plan_trip test:
     - Returns route links with highlights (key stops summary).
     - Deals are diversified by origin (multiple origin cities).
     - No "Points Flight Deals" heading in response markdown.
     - Response contains at least one image.
     - Images are not duplicated (no same URL reused).
     - Payload has a valid destination image URL.
     - Payload includes a transport plan with day-by-day data.
   - `/api/chat` Paris plan_trip test (verifies images work for non-Tokyo destinations):
     - Response contains at least one image.
     - Images are not duplicated.
     - All image URLs are valid.
     - Payload has a valid destination image URL.
     - Route links are present.
     - Transport plan is present in payload.
6. If any assertions fail, report the failures, inspect the relevant code, and fix the issue before declaring the update complete.
