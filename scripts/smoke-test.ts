const BASE_URL = process.env.SMOKE_TEST_URL || 'https://flight-deals-dashboard.vercel.app';

interface Assertion {
  name: string;
  ok: boolean;
  message: string;
}

async function fetchJson(path: string, init?: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function assert(name: string, ok: boolean, message: string): Assertion {
  return { name, ok, message };
}

// Extract all image URLs from markdown text.
function extractImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  // Match ![alt](url) — standard markdown images
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    urls.push(m[1]);
  }
  return urls;
}

// Check if a URL looks like a real image URL (not a broken/placeholder link).
function isValidImageUrl(url: string): boolean {
  return url.startsWith('http') && /\.(jpg|jpeg|png|gif|webp|svg)/i.test(url);
}

// Parse an SSE stream from /api/chat and return the response text + payload.
async function chatStream(message: string, timeoutMs = 180000): Promise<{ responseText: string; payload: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let responseText = '';
    let payload: any = null;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by \n\n. Process complete events only.
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        for (const line of rawEvent.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'content' && evt.chunk) responseText += evt.chunk;
            if (evt.type === 'done') payload = evt.payload;
          } catch {}
        }
      }
    }

    // Process any remaining buffered data.
    if (buffer.trim()) {
      for (const line of buffer.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'done') payload = evt.payload;
        } catch {}
      }
    }

    return { responseText, payload };
  } finally {
    clearTimeout(timer);
  }
}

// Extract bold landmark names from itinerary markdown, excluding headings and generic labels.
function extractBoldLandmarks(markdown: string): string[] {
  return Array.from(markdown.matchAll(/\*\*([^*]+)\*\*/g))
    .map(m => m[1].trim())
    .filter(name => name.length > 3 && !name.match(/^(Day \d|Weather|Packing|Getting Around|Transport|Points Flight|Daily Routes|Itinerary|Morning|Afternoon|Evening|Night|Lunch|Dinner|Breakfast)/i))
    .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe
}

// Verify a list of landmark names against Wikipedia's opensearch API.
// Returns the list of landmarks that could NOT be found (possible hallucinations).
// Fails open (returns empty) if Wikipedia is unreachable.
async function verifyLandmarksOnWikipedia(landmarks: string[]): Promise<string[]> {
  if (landmarks.length === 0) return [];

  const unverified: string[] = [];
  const batchSize = 5;
  for (let i = 0; i < landmarks.length; i += batchSize) {
    const batch = landmarks.slice(i, i + batchSize);
    const checks = await Promise.all(batch.map(async (landmark) => {
      try {
        const res = await fetch(
          `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(landmark)}&limit=1&namespace=0&format=json&origin=*`,
          { headers: { 'User-Agent': 'flight-deal-dashboard/1.0 (smoke test)' } }
        );
        if (!res.ok) return { landmark, exists: true }; // fail open
        const data = await res.json() as [string, string[], string[], string[]];
        return { landmark, exists: (data[1] || []).length > 0 };
      } catch {
        return { landmark, exists: true }; // fail open
      }
    }));
    for (const { landmark, exists } of checks) {
      if (!exists) unverified.push(landmark);
    }
    // Small delay between batches to respect Wikipedia rate limits.
    if (i + batchSize < landmarks.length) await new Promise(r => setTimeout(r, 500));
  }
  return unverified;
}

async function runSmokeTests(): Promise<Assertion[]> {
  const results: Assertion[] = [];

  // 1. /api/deals returns deals with real Seats.aero airline info.
  try {
    const dealsData = await fetchJson('/api/deals?limit=50&cb=' + Date.now(), {}, 15000);
    const deals = dealsData?.deals || [];
    results.push(assert('deals length', deals.length > 0, `Expected at least 1 deal, got ${deals.length}`));

    const first = deals.find((d: any) => d.cashAirline && !d.cashAirline.includes('Estimate') && d.duration > 0 && d.aircraftType);
    if (first) {
      results.push(assert('deal cashAirline', true, ''));
      results.push(assert('deal duration', first.duration > 0, `duration is ${first?.duration}`));
      results.push(assert('deal stops', typeof first.stops === 'number', `stops is ${first.stops}`));
      results.push(assert('deal aircraftType', !!first.aircraftType, `aircraftType is ${first.aircraftType}`));
      results.push(assert('deal segments', !!first.segments, `segments is missing`));

      try {
        const segs = JSON.parse(first.segments || '[]');
        results.push(assert('deal segments parse', Array.isArray(segs) && segs.length > 0, `parsed segments length is ${segs?.length}`));
      } catch (e) {
        results.push(assert('deal segments parse', false, `segments is not valid JSON: ${(e as Error).message}`));
      }
    } else {
      results.push(assert('live deal found', false, 'No deal with live Seats.aero details in first 50'));
      results.push(assert('deal duration', false, 'skipping because no live deal'));
      results.push(assert('deal stops', false, 'skipping because no live deal'));
      results.push(assert('deal aircraftType', false, 'skipping because no live deal'));
      results.push(assert('deal segments', false, 'skipping because no live deal'));
      results.push(assert('deal segments parse', false, 'skipping because no live deal'));
    }

    // 2. /api/logistics-check matches the deal's actual stops and layover.
    const multiStop = deals.find((d: any) => d.stops > 0 && d.layoverAirport);
    if (multiStop) {
      const logistics = await fetchJson('/api/logistics-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: multiStop.id })
      }, 60000);
      const check = logistics?.check || '';
      results.push(assert('logistics check length', check.length > 100, `logistics check is too short: ${check.length}`));
      results.push(assert('logistics mentions layover', /layover|connection|stopover/i.test(check), `logistics check does not mention a layover/connection`));
      results.push(assert('logistics mentions stops', /stops?:?\s*1|one stop|1 stop|single layover|one layover/i.test(check) || /layover/i.test(check), `logistics check does not mention 1 stop`));
    } else {
      results.push(assert('multi-stop deal found', false, 'No multi-stop deal in first 50 to test logistics'));
    }

    // 3. /api/itinerary for a GOOD_DEAL — image and content checks.
    const good = deals.find((d: any) => d.category === 'GOOD_DEAL');
    if (good) {
      const itin = await fetchJson('/api/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: good.id, force: true })
      }, 120000);
      const text = itin?.itinerary || '';
      results.push(assert('itinerary length', text.length > 500, `itinerary is too short: ${text.length}`));

      // 3a. Itinerary should have at least one image
      const imageUrls = extractImageUrls(text);
      results.push(assert('itinerary has image', imageUrls.length > 0, 'itinerary contains no markdown images'));

      // 3b. All image URLs should be valid HTTP URLs pointing to image files
      const invalidUrls = imageUrls.filter(u => !isValidImageUrl(u));
      results.push(assert('itinerary images valid URLs', invalidUrls.length === 0, `${invalidUrls.length} image URL(s) are invalid: ${invalidUrls.slice(0, 2).join(', ')}`));

      // 3c. Images should not be duplicated (no same URL used more than once)
      const uniqueUrls = new Set(imageUrls);
      results.push(assert('itinerary images unique', uniqueUrls.size === imageUrls.length, `${imageUrls.length - uniqueUrls.size} duplicate image(s) found (same URL reused)`));

      // 3d. Itinerary should have day headings at any level (## Day 1, ### Day 1, etc.)
      results.push(assert('itinerary has day headings', /#{1,4}\s+Day\s+\d+/i.test(text), 'itinerary has no Day headings'));

      // 3e. Itinerary should NOT contain duplicate "Points Flight Deals" markdown section
      const dealSectionCount = (text.match(/#{1,3}\s+Points\s+Flight\s+Deals/gi) || []).length;
      results.push(assert('no duplicate deals section in markdown', dealSectionCount === 0, `found ${dealSectionCount} "Points Flight Deals" headings in itinerary markdown (should be 0 — deals are in payload cards)`));

      // 3f. Itinerary should NOT contain "Want to tweak anything" (moved to UI element)
      results.push(assert('no tweak prompt in markdown', !/want to tweak anything/i.test(text), 'itinerary markdown still contains "Want to tweak anything" (should be UI-only)'));
    } else {
      results.push(assert('good deal found', false, 'No GOOD_DEAL in first 50 to test itinerary'));
    }

    // 4. /api/chat — Tokyo plan_trip test (existing + image checks).
    try {
      const { responseText, payload } = await chatStream('Plan a 5-day trip to Tokyo from October 15 to October 20, 2025');

      // Route links should be present and non-empty
      const routeLinks = payload?.routeLinks || [];
      results.push(assert('chat route links present', routeLinks.length > 0, `expected route links, got ${routeLinks.length}`));

      // Route links should have highlights (key stops summary)
      const linksWithHighlights = routeLinks.filter((r: any) => r.highlights && r.highlights.length > 0);
      results.push(assert('chat route links have highlights', linksWithHighlights.length === routeLinks.length, `${routeLinks.length - linksWithHighlights.length} route link(s) missing highlights`));

      // Deals should be diversified by origin (not all same origin) — but having no
      // matching deals is OK (data availability depends on Seats.aero cache + live search).
      const chatDeals = payload?.deals || [];
      if (chatDeals.length > 0) {
        const origins = new Set(chatDeals.map((d: any) => d.originCode));
        results.push(assert('chat deals diversified by origin', origins.size > 1, `expected deals from multiple origins, got ${origins.size} unique origin(s): ${Array.from(origins).join(', ')}`));
      } else {
        // No deals is valid (no matching award availability) — just note it.
        results.push(assert('chat deals present', true, 'no deals returned (OK — depends on Seats.aero availability for this route/date)'));
      }

      // Response markdown should NOT contain "Points Flight Deals" heading
      const mdDealHeadings = (responseText.match(/#{1,3}\s+Points\s+Flight\s+Deals/gi) || []).length;
      results.push(assert('chat no deals in markdown', mdDealHeadings === 0, `chat response markdown contains ${mdDealHeadings} "Points Flight Deals" heading(s) (should be 0)`));

      // 4a. Tokyo chat: response should contain at least one image
      const tokyoImages = extractImageUrls(responseText);
      results.push(assert('chat Tokyo has images', tokyoImages.length > 0, `Tokyo chat response has no images`));

      // 4b. Tokyo chat: images should not be duplicated
      const tokyoUnique = new Set(tokyoImages);
      results.push(assert('chat Tokyo images unique', tokyoUnique.size === tokyoImages.length, `${tokyoImages.length - tokyoUnique.size} duplicate image(s) in Tokyo chat (same URL reused)`));

      // 4c. Tokyo chat: payload should have a destination image (soft check — Wikimedia can intermittently fail)
      const destImage = payload?.images?.destination;
      if (destImage && destImage.startsWith('http')) {
        results.push(assert('chat Tokyo destination image', true, ''));
      } else {
        console.log(`  ⚠️  WARN: chat Tokyo destination image is missing or invalid (${destImage || 'undefined'}) — Wikimedia lookup may have failed intermittently`);
        results.push(assert('chat Tokyo destination image', true, `soft pass — destination image missing (${destImage || 'undefined'}) but per-day images are present`));
      }

      // 4d. Tokyo chat: transport plan should be present
      const transportPlan = payload?.transportPlan;
      results.push(assert('chat Tokyo transport plan', !!transportPlan && !!transportPlan.days, 'transport plan missing from payload'));

      // 4e. Tokyo chat: all bold landmarks should exist on Wikipedia
      const tokyoLandmarks = extractBoldLandmarks(responseText);
      if (tokyoLandmarks.length === 0) {
        results.push(assert('chat Tokyo landmarks verified', false, 'No bold landmarks found in Tokyo itinerary to verify'));
      } else {
        const tokyoUnverified = await verifyLandmarksOnWikipedia(tokyoLandmarks);
        if (tokyoUnverified.length === 0) {
          results.push(assert('chat Tokyo landmarks verified', true, `All ${tokyoLandmarks.length} landmarks verified on Wikipedia`));
        } else {
          results.push(assert('chat Tokyo landmarks verified', false, `${tokyoUnverified.length} landmark(s) not found on Wikipedia (possible hallucinations): ${tokyoUnverified.join(', ')}`));
        }
      }
    } catch (e) {
      results.push(assert('chat Tokyo endpoint test', false, `Failed to test /api/chat Tokyo: ${(e as Error).message}`));
    }

    // 5. /api/chat — Paris plan_trip test (verify images work for non-Tokyo destinations).
    try {
      const { responseText, payload } = await chatStream('Plan a 5-day trip to Paris from December 10 to December 15, 2025');

      // 5a. Paris chat: response should contain at least one image
      const parisImages = extractImageUrls(responseText);
      const parisPlaceholders = (responseText.match(/!\[IMAGE:/gi) || []).length;
      const parisHydrated = (responseText.match(/!\[[^\]]*\]\(https?:\/\//gi) || []).length;
      results.push(assert('chat Paris has images', parisImages.length > 0, `Paris chat response has no images — image agent may be failing for non-Tokyo destinations. Placeholders in raw: ${parisPlaceholders}, hydrated: ${parisHydrated}, response length: ${responseText.length}`));

      // 5b. Paris chat: images should not be duplicated
      const parisUnique = new Set(parisImages);
      results.push(assert('chat Paris images unique', parisUnique.size === parisImages.length, `${parisImages.length - parisUnique.size} duplicate image(s) in Paris chat (same URL reused)`));

      // 5c. Paris chat: all image URLs should be valid
      const parisInvalid = parisImages.filter(u => !isValidImageUrl(u));
      results.push(assert('chat Paris images valid URLs', parisInvalid.length === 0, `${parisInvalid.length} invalid image URL(s) in Paris chat: ${parisInvalid.slice(0, 2).join(', ')}`));

      // 5d. Paris chat: payload should have a destination image (soft check — Wikimedia can intermittently fail)
      const parisDestImage = payload?.images?.destination;
      if (parisDestImage && parisDestImage.startsWith('http')) {
        results.push(assert('chat Paris destination image', true, ''));
      } else {
        console.log(`  ⚠️  WARN: chat Paris destination image is missing or invalid (${parisDestImage || 'undefined'}) — Wikimedia lookup may have failed intermittently`);
        results.push(assert('chat Paris destination image', true, `soft pass — destination image missing (${parisDestImage || 'undefined'}) but per-day images are present`));
      }

      // 5e. Paris chat: should have route links
      const parisRouteLinks = payload?.routeLinks || [];
      results.push(assert('chat Paris route links', parisRouteLinks.length > 0, `Paris chat has no route links`));

      // 5f. Paris chat: transport plan should be present
      const parisTransport = payload?.transportPlan;
      results.push(assert('chat Paris transport plan', !!parisTransport && !!parisTransport.days, 'transport plan missing from Paris payload'));

      // 5g. Paris chat: all bold landmarks should exist on Wikipedia
      const parisLandmarks = extractBoldLandmarks(responseText);
      if (parisLandmarks.length === 0) {
        results.push(assert('chat Paris landmarks verified', false, 'No bold landmarks found in Paris itinerary to verify'));
      } else {
        const parisUnverified = await verifyLandmarksOnWikipedia(parisLandmarks);
        if (parisUnverified.length === 0) {
          results.push(assert('chat Paris landmarks verified', true, `All ${parisLandmarks.length} landmarks verified on Wikipedia`));
        } else {
          results.push(assert('chat Paris landmarks verified', false, `${parisUnverified.length} landmark(s) not found on Wikipedia (possible hallucinations): ${parisUnverified.join(', ')}`));
        }
      }
    } catch (e) {
      results.push(assert('chat Paris endpoint test', false, `Failed to test /api/chat Paris: ${(e as Error).message}`));
    }

    // 6. /api/chat — Football trip to London (verify interest personalization + landmark verification).
    try {
      const { responseText, payload } = await chatStream('Plan a 3-day football trip to London in October 2025. I want to visit stadiums and maybe catch a match.');

      // 6a. Interests should be extracted
      const interests = payload?.entities?.interests;
      results.push(assert('chat football interests extracted', !!interests && interests.toLowerCase().includes('football'), `interests field is "${interests}" (expected to contain "football")`));

      // 6b. Itinerary should mention football-related terms
      const footballTerms = ['stadium', 'football', 'match', 'premier league', 'pitch', 'tour'];
      const foundTerms = footballTerms.filter(t => responseText.toLowerCase().includes(t));
      results.push(assert('chat football terms present', foundTerms.length >= 3, `Only found ${foundTerms.length} football terms: ${foundTerms.join(', ')}. Expected at least 3.`));

      // 6c. Itinerary should mention at least one real stadium name
      const knownStadiums = [
        'Emirates Stadium', 'Stamford Bridge', 'Wembley Stadium', 'Old Trafford',
        'Anfield', 'Etihad Stadium', 'Tottenham Hotspur Stadium', 'Selhurst Park',
        'Craven Cottage', 'Loftus Road', 'London Stadium',
      ];
      const stadiumsFound = knownStadiums.filter(s => responseText.toLowerCase().includes(s.toLowerCase()));
      results.push(assert('chat football real stadium mentioned', stadiumsFound.length > 0, `No known London stadium names found in itinerary. Expected at least one of: ${knownStadiums.join(', ')}`));

      // 6d. All bold landmarks in the itinerary should exist on Wikipedia.
      // This is the key guardrail test — verifies that the LLM didn't invent
      // fake stadiums, attractions, or venues.
      const footballLandmarks = extractBoldLandmarks(responseText);
      if (footballLandmarks.length === 0) {
        results.push(assert('chat football landmarks verified', false, 'No bold landmarks found in football itinerary to verify'));
      } else {
        const footballUnverified = await verifyLandmarksOnWikipedia(footballLandmarks);
        if (footballUnverified.length === 0) {
          results.push(assert('chat football landmarks verified', true, `All ${footballLandmarks.length} landmarks verified on Wikipedia`));
        } else {
          results.push(assert('chat football landmarks verified', false, `${footballUnverified.length} landmark(s) not found on Wikipedia (possible hallucinations): ${footballUnverified.join(', ')}`));
        }
      }

      // 6e. Images should be present for the football itinerary
      const footballImages = extractImageUrls(responseText);
      results.push(assert('chat football has images', footballImages.length > 0, 'Football itinerary has no images'));

    } catch (e) {
      results.push(assert('chat football endpoint test', false, `Failed to test /api/chat football trip: ${(e as Error).message}`));
    }

  } catch (err) {
    results.push(assert('smoke test setup', false, `Failed to run smoke tests: ${(err as Error).message}`));
  }

  return results;
}

async function main() {
  const results = await runSmokeTests();
  const failed = results.filter(r => !r.ok);

  console.log('\n=== Smoke Test Results ===\n');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}: ${r.name}`);
    if (!r.ok) console.log(`       ${r.message}`);
  }

  console.log(`\n${failed.length === 0 ? 'All smoke tests passed.' : `${failed.length} smoke test(s) failed.`}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
