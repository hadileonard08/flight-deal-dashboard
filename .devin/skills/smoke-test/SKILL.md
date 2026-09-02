---
name: smoke-test
description: Run local or post-deploy smoke tests only when explicitly requested
subagent: true
allowed-tools:
  - exec
  - read
---

Run this skill only when the user explicitly asks to run smoke tests. Never invoke it automatically while investigating or fixing a bug.

Required workflow for bug fixes:

1. Reproduce the reported issue with the narrowest relevant test.
2. Identify the root cause.
3. Implement the fix outside this skill.
4. Run the focused regression test first.
5. Run broader local smoke tests only after the focused test passes and only when requested.
6. Deploy only when the user explicitly requests deployment. Never deploy as part of this skill.
7. Run post-deploy smoke tests only after an explicitly requested deployment.

Commands:

- Local full suite: `npx tsx -r dotenv/config scripts/smoke-test.ts --local`
- Local suite without chat/LLM usage: `npx tsx -r dotenv/config scripts/smoke-test.ts --local --skip-chat`
- Production suite: `npx tsx -r dotenv/config scripts/smoke-test.ts`

The smoke test verifies:
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
If assertions fail, report the failures and stop. Do not edit code or deploy from this skill.
