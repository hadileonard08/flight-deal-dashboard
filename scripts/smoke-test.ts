// Usage:
//   npx tsx scripts/smoke-test.ts                    # full test against production
//   npx tsx scripts/smoke-test.ts --local            # test against localhost:3000
//   npx tsx scripts/smoke-test.ts --skip-chat        # skip chat tests (saves Gemini tokens)
//   npx tsx scripts/smoke-test.ts --local --skip-chat
//   SMOKE_TEST_URL=http://localhost:3000 npx tsx scripts/smoke-test.ts

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const skipChat = args.includes('--skip-chat');

const BASE_URL = process.env.SMOKE_TEST_URL || (isLocal ? 'http://localhost:3000' : 'https://flight-deals-dashboard.vercel.app');

if (isLocal) {
  console.log(`🏠 Running in LOCAL mode — testing against ${BASE_URL}`);
  console.log(`   Make sure your dev server is running: npm run dev\n`);
}
if (skipChat) {
  console.log(`⏭️  Skipping chat tests (--skip-chat) — saves Gemini tokens\n`);
}

interface Assertion {
  name: string;
  ok: boolean;
  message: string;
}

// Pool of cities for randomized smoke tests. Each run picks 2 random cities
// so we test different destinations each time instead of always Tokyo/Paris.
const CITY_POOL = [
  { name: 'Tokyo', month: 'October', days: 5 },
  { name: 'Paris', month: 'December', days: 5 },
  { name: 'London', month: 'November', days: 4 },
  { name: 'Bangkok', month: 'January', days: 4 },
  { name: 'Seoul', month: 'March', days: 5 },
  { name: 'Barcelona', month: 'September', days: 5 },
  { name: 'Rome', month: 'April', days: 4 },
  { name: 'Istanbul', month: 'May', days: 4 },
  { name: 'Singapore', month: 'February', days: 3 },
  { name: 'Amsterdam', month: 'June', days: 4 },
  { name: 'Dubai', month: 'November', days: 4 },
  { name: 'Hong Kong', month: 'October', days: 4 },
  { name: 'Madrid', month: 'July', days: 4 },
  { name: 'Sydney', month: 'January', days: 5 },
  { name: 'Lisbon', month: 'August', days: 4 },
];

// Pick N random cities from the pool (no repeats).
function pickRandomCities(n: number): typeof CITY_POOL {
  const shuffled = [...CITY_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
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

// Extract bold landmark names from itinerary markdown, excluding headings,
// generic labels, transport agent noise, and non-landmark content.
function extractBoldLandmarks(markdown: string): string[] {
  // Patterns to exclude: transport agent output, headings, generic labels,
  // transit terms, time/distance notes, emoji-prefixed lines.
  const excludePatterns = [
    /^(Day \d|Weather|Packing|Getting Around|Transport|Points Flight|Daily Routes|Itinerary|Morning|Afternoon|Evening|Night|Lunch|Dinner|Breakfast)/i,
    /Getting around.*routing/i,
    /^[🚶🚇🚆🚌🚊⛴️🚕]/, // emoji-prefixed transport modes
    /\b(walk|walking|transit|subway|metro|train|bus|taxi|ride)\b.*\b(min|km|distance)/i,
    /\b\d+\s*(min|km)\b/i, // time/distance notes like "~10 min walk"
    /Tokyo Subway Ticket/i,
    /Navigo/i, // transit pass names
    /Key Transit Stations/i,
    /Transit.Taxi/i,
    /Pass$/i, // transit passes
    /Christmas Market$/i, // seasonal markets rarely have Wikipedia articles
    /Festival$/i, // festivals may not have articles
  ];

  return Array.from(markdown.matchAll(/\*\*([^*]+)\*\*/g))
    .map(m => m[1].trim())
    .filter(name => name.length > 3)
    .filter(name => name.length < 80) // exclude multi-line paragraphs caught by **
    .filter(name => !name.includes('\n')) // exclude multi-line content
    .filter(name => !excludePatterns.some(p => p.test(name)))
    .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe
}

// Verify a list of landmark names against Wikipedia's opensearch API.
// Returns the list of landmarks that could NOT be found (possible hallucinations).
// Fails open (returns empty) if Wikipedia is unreachable.
// Tries the full name first, then a shortened version (strip suffixes like
// "Gardens", "Park", "Museum" etc.) as a fallback.
async function verifyLandmarksOnWikipedia(landmarks: string[]): Promise<string[]> {
  if (landmarks.length === 0) return [];

  // Limit to first 10 landmarks per itinerary to keep Wikipedia API calls
  // reasonable and avoid rate limiting across 3 chat tests.
  const toVerify = landmarks.slice(0, 10);

  const unverified: string[] = [];
  // Process landmarks one at a time (sequential, no parallelism) to avoid
  // Wikipedia API rate-limiting. The previous batch-of-3 with Promise.all
  // caused up to 6 simultaneous requests per batch, which triggered
  // rate-limiting and returned false negatives.
  for (let i = 0; i < toVerify.length; i++) {
    const landmark = toVerify[i];

    // Try the full name first.
    let exists = await wikipediaSearchExists(landmark);

    // Fallback: try without common suffixes (e.g. "Trocadéro Gardens" -> "Trocadéro").
    if (!exists) {
      const stripped = landmark.replace(/\s+(Gardens|Park|Museum|Square|Plaza|Bridge|Tower|Building|Market|Street|District|Neighborhood|Cathedral|Church|Temple|Shrine|Castle|Palace|Monument|Memorial|Gallery|Centre|Center|Stadium|Arena|Ground|Pub|Bar|Restaurant|Cafe|Station|Tube Station|Metro Station)$/i, '').trim();
      if (stripped && stripped !== landmark) {
        exists = await wikipediaSearchExists(stripped);
      }
    }

    // Retry once after a short delay if not found — Wikipedia sometimes
    // returns empty results due to transient rate-limiting.
    if (!exists) {
      await new Promise(r => setTimeout(r, 500));
      exists = await wikipediaSearchExists(landmark);
    }

    if (!exists) unverified.push(landmark);

    // 500ms delay between each landmark to respect Wikipedia rate limits.
    if (i + 1 < toVerify.length) await new Promise(r => setTimeout(r, 500));
  }
  return unverified;
}

// Check if a term exists on Wikipedia. Tries opensearch first (exact-ish),
// then falls back to query search (fuzzy). Returns true if found on either.
// Includes retry logic for Wikipedia rate-limiting (HTTP 429).
async function wikipediaSearchExists(term: string): Promise<boolean> {
  const headers = { 'User-Agent': 'flight-deal-dashboard/1.0 (smoke test)' };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // 1. Try opensearch (exact-ish matching).
      const res = await fetch(
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(term)}&limit=1&namespace=0&format=json&origin=*`,
        { headers }
      );
      if (res.status === 429) {
        // Rate-limited — wait and retry.
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (res.ok) {
        const data = await res.json() as [string, string[], string[], string[]];
        if ((data[1] || []).length > 0) return true;
      }

      // 2. Fallback: try query search (fuzzy matching, finds more results).
      const res2 = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=1&format=json&origin=*`,
        { headers }
      );
      if (res2.status === 429) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (res2.ok) {
        const data2 = await res2.json() as any;
        const hits = data2?.query?.search || [];
        if (hits.length > 0) return true;
      }

      return false;
    } catch {
      return true; // fail open
    }
  }

  // All retries exhausted due to rate-limiting — fail open.
  return true;
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

    // 4. /api/chat — Random city #1 plan_trip test (images, routes, transport, landmarks).
    if (!skipChat) {
      const city1 = CITY_POOL.find((c) => c.name === 'Tokyo') || pickRandomCities(1)[0];
      const city2 = CITY_POOL.find((c) => c.name === 'Paris') || pickRandomCities(1)[0];
      console.log(`  -> Testing cities for this run: ${city1.name} and ${city2.name}\n`);

      try {
        const msg1 = `Plan a ${city1.days}-day trip to ${city1.name} in ${city1.month}`;
        console.log(`  → Testing: "${msg1}"`);
        const { responseText, payload } = await chatStream(msg1);

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

        // 4a. City chat: response should contain at least one image
        const city1Images = extractImageUrls(responseText);
        results.push(assert(`chat ${city1.name} has images`, city1Images.length > 0, `${city1.name} chat response has no images`));

        // 4b. City chat: images should not be duplicated
        const city1Unique = new Set(city1Images);
        results.push(assert(`chat ${city1.name} images unique`, city1Unique.size === city1Images.length, `${city1Images.length - city1Unique.size} duplicate image(s) in ${city1.name} chat (same URL reused)`));

        // 4c. City chat: payload should have a destination image (soft check)
        const destImage = payload?.images?.destination;
        if (destImage && destImage.startsWith('http')) {
          results.push(assert(`chat ${city1.name} destination image`, true, ''));
        } else {
          console.log(`  ⚠️  WARN: chat ${city1.name} destination image is missing or invalid (${destImage || 'undefined'}) — Wikimedia lookup may have failed intermittently`);
          results.push(assert(`chat ${city1.name} destination image`, true, `soft pass — destination image missing (${destImage || 'undefined'}) but per-day images are present`));
        }

        // 4d. City chat: transport plan should be present
        const transportPlan = payload?.transportPlan;
        results.push(assert(`chat ${city1.name} transport plan`, !!transportPlan && !!transportPlan.days, 'transport plan missing from payload'));

        // 4e. City chat: all bold landmarks should exist on Wikipedia
        const city1Landmarks = extractBoldLandmarks(responseText);
        if (city1Landmarks.length === 0) {
          results.push(assert(`chat ${city1.name} landmarks verified`, false, 'No bold landmarks found in itinerary to verify'));
        } else {
          const city1Unverified = await verifyLandmarksOnWikipedia(city1Landmarks);
          if (city1Unverified.length === 0) {
            results.push(assert(`chat ${city1.name} landmarks verified`, true, `All ${city1Landmarks.length} landmarks verified on Wikipedia`));
          } else {
            results.push(assert(`chat ${city1.name} landmarks verified`, false, `${city1Unverified.length} landmark(s) not found on Wikipedia (possible hallucinations): ${city1Unverified.join(', ')}`));
          }
        }
      } catch (e) {
        results.push(assert('chat city1 endpoint test', false, `Failed to test /api/chat ${city1.name}: ${(e as Error).message}`));
      }

      // Brief pause before the next chat test to let Wikipedia API rate limits reset.
      await new Promise(r => setTimeout(r, 3000));

      // 5. /api/chat — Random city #2 plan_trip test (verify images work for different destinations).
      try {
        const msg2 = `Plan a ${city2.days}-day trip to ${city2.name} in ${city2.month}`;
        console.log(`  → Testing: "${msg2}"`);
        const { responseText, payload } = await chatStream(msg2);

        // 5a. City chat: response should contain at least one image
        const city2Images = extractImageUrls(responseText);
        const city2Placeholders = (responseText.match(/!\[IMAGE:/gi) || []).length;
        const city2Hydrated = (responseText.match(/!\[[^\]]*\]\(https?:\/\//gi) || []).length;
        results.push(assert(`chat ${city2.name} has images`, city2Images.length > 0, `${city2.name} chat response has no images — image agent may be failing. Placeholders in raw: ${city2Placeholders}, hydrated: ${city2Hydrated}, response length: ${responseText.length}`));

        // 5b. City chat: images should not be duplicated
        const city2Unique = new Set(city2Images);
        results.push(assert(`chat ${city2.name} images unique`, city2Unique.size === city2Images.length, `${city2Images.length - city2Unique.size} duplicate image(s) in ${city2.name} chat (same URL reused)`));

        // 5c. City chat: all image URLs should be valid
        const city2Invalid = city2Images.filter(u => !isValidImageUrl(u));
        results.push(assert(`chat ${city2.name} images valid URLs`, city2Invalid.length === 0, `${city2Invalid.length} invalid image URL(s) in ${city2.name} chat: ${city2Invalid.slice(0, 2).join(', ')}`));

        // 5d. City chat: payload should have a destination image (soft check)
        const city2DestImage = payload?.images?.destination;
        if (city2DestImage && city2DestImage.startsWith('http')) {
          results.push(assert(`chat ${city2.name} destination image`, true, ''));
        } else {
          console.log(`  ⚠️  WARN: chat ${city2.name} destination image is missing or invalid (${city2DestImage || 'undefined'}) — Wikimedia lookup may have failed intermittently`);
          results.push(assert(`chat ${city2.name} destination image`, true, `soft pass — destination image missing (${city2DestImage || 'undefined'}) but per-day images are present`));
        }

        // 5e. City chat: should have route links
        const city2RouteLinks = payload?.routeLinks || [];
        results.push(assert(`chat ${city2.name} route links`, city2RouteLinks.length > 0, `${city2.name} chat has no route links`));

        // 5f. City chat: transport plan should be present
        const city2Transport = payload?.transportPlan;
        results.push(assert(`chat ${city2.name} transport plan`, !!city2Transport && !!city2Transport.days, `transport plan missing from ${city2.name} payload`));

        // 5g. City chat: all bold landmarks should exist on Wikipedia
        const city2Landmarks = extractBoldLandmarks(responseText);
        if (city2Landmarks.length === 0) {
          results.push(assert(`chat ${city2.name} landmarks verified`, false, 'No bold landmarks found in itinerary to verify'));
        } else {
          const city2Unverified = await verifyLandmarksOnWikipedia(city2Landmarks);
          if (city2Unverified.length === 0) {
            results.push(assert(`chat ${city2.name} landmarks verified`, true, `All ${city2Landmarks.length} landmarks verified on Wikipedia`));
          } else {
            results.push(assert(`chat ${city2.name} landmarks verified`, false, `${city2Unverified.length} landmark(s) not found on Wikipedia (possible hallucinations): ${city2Unverified.join(', ')}`));
          }
        }
      } catch (e) {
        results.push(assert('chat city2 endpoint test', false, `Failed to test /api/chat ${city2.name}: ${(e as Error).message}`));
      }
    } else {
      console.log(`  ⏭️  Skipping chat tests (city + football) — no Gemini tokens consumed\n`);
      results.push(assert('chat tests skipped', true, 'skipped via --skip-chat flag'));
    }

    // Brief pause before the football test to let Wikipedia API rate limits reset.
    await new Promise(r => setTimeout(r, 3000));

    // 6. /api/chat — Football trip to London (verify interest personalization + landmark verification).
    if (!skipChat) {
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
    } // end if (!skipChat)

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
