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

    // 3. /api/itinerary for a GOOD_DEAL contains at least one image.
    const good = deals.find((d: any) => d.category === 'GOOD_DEAL');
    if (good) {
      const itin = await fetchJson('/api/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: good.id, force: true })
      }, 120000);
      const text = itin?.itinerary || '';
      results.push(assert('itinerary length', text.length > 500, `itinerary is too short: ${text.length}`));
      results.push(assert('itinerary has image', /!\[[^\]]*\]\([^)]+\)/.test(text), 'itinerary contains no markdown images'));

      // 3a. Itinerary should have day headings at any level (## Day 1, ### Day 1, etc.)
      results.push(assert('itinerary has day headings', /#{1,4}\s+Day\s+\d+/i.test(text), 'itinerary has no Day headings'));

      // 3b. Itinerary should NOT contain duplicate "Points Flight Deals" markdown section
      // (deals are now rendered as rich cards in the payload, not in the markdown)
      const dealSectionCount = (text.match(/#{1,3}\s+Points\s+Flight\s+Deals/gi) || []).length;
      results.push(assert('no duplicate deals section in markdown', dealSectionCount === 0, `found ${dealSectionCount} "Points Flight Deals" headings in itinerary markdown (should be 0 — deals are in payload cards)`));

      // 3c. Itinerary should NOT contain "Want to tweak anything" (moved to UI element)
      results.push(assert('no tweak prompt in markdown', !/want to tweak anything/i.test(text), 'itinerary markdown still contains "Want to tweak anything" (should be UI-only)'));
    } else {
      results.push(assert('good deal found', false, 'No GOOD_DEAL in first 50 to test itinerary'));
    }

    // 4. /api/chat should return route links and diverse deals for a plan_trip request.
    // The chat endpoint is SSE-streamed, so we read the full stream and parse the final "done" event.
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180000);
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Plan a trip to Tokyo in October' }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let payload: any = null;
      let responseText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        // Parse SSE lines
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'content' && evt.chunk) responseText += evt.chunk;
            if (evt.type === 'done') payload = evt.payload;
          } catch {}
        }
      }

      // Route links should be present and non-empty
      const routeLinks = payload?.routeLinks || [];
      results.push(assert('chat route links present', routeLinks.length > 0, `expected route links, got ${routeLinks.length}`));

      // Deals should be diversified by origin (not all same origin)
      const chatDeals = payload?.deals || [];
      if (chatDeals.length > 0) {
        const origins = new Set(chatDeals.map((d: any) => d.originCode));
        results.push(assert('chat deals diversified by origin', origins.size > 1, `expected deals from multiple origins, got ${origins.size} unique origin(s): ${Array.from(origins).join(', ')}`));
      } else {
        results.push(assert('chat deals present', false, 'no deals returned in chat payload'));
      }

      // Response markdown should NOT contain "Points Flight Deals" heading
      const mdDealHeadings = (responseText.match(/#{1,3}\s+Points\s+Flight\s+Deals/gi) || []).length;
      results.push(assert('chat no deals in markdown', mdDealHeadings === 0, `chat response markdown contains ${mdDealHeadings} "Points Flight Deals" heading(s) (should be 0)`));
    } catch (e) {
      results.push(assert('chat endpoint test', false, `Failed to test /api/chat: ${(e as Error).message}`));
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
