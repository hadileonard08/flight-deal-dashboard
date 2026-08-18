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
    const dealsData = await fetchJson('/api/deals?limit=5&cb=' + Date.now(), {}, 15000);
    const deals = dealsData?.deals || [];
    results.push(assert('deals length', deals.length > 0, `Expected at least 1 deal, got ${deals.length}`));

    const first = deals[0];
    results.push(assert('deal cashAirline', first?.cashAirline && !first.cashAirline.includes('Estimate'), `cashAirline is ${first?.cashAirline}`));
    results.push(assert('deal duration', first?.duration > 0, `duration is ${first?.duration}`));
    results.push(assert('deal stops', typeof first?.stops === 'number', `stops is ${first?.stops}`));
    results.push(assert('deal aircraftType', !!first?.aircraftType, `aircraftType is ${first?.aircraftType}`));
    results.push(assert('deal segments', !!first?.segments, `segments is missing`));

    try {
      const segs = JSON.parse(first?.segments || '[]');
      results.push(assert('deal segments parse', Array.isArray(segs) && segs.length > 0, `parsed segments length is ${segs?.length}`));
    } catch (e) {
      results.push(assert('deal segments parse', false, `segments is not valid JSON: ${(e as Error).message}`));
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
      results.push(assert('logistics mentions layover', check.toLowerCase().includes(multiStop.layoverAirport.toLowerCase()), `logistics check does not mention layover ${multiStop.layoverAirport}`));
      results.push(assert('logistics mentions stops', /stops?:?\s*1|one stop|1 stop|single layover|one layover/i.test(check) || /layover/i.test(check), `logistics check does not mention 1 stop`));
    } else {
      results.push(assert('multi-stop deal found', false, 'No multi-stop deal in first 5 to test logistics'));
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
    } else {
      results.push(assert('good deal found', false, 'No GOOD_DEAL in first 5 to test itinerary'));
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
