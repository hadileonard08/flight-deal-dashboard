import { createQuery, getFlights, Passengers } from 'fast-flights-ts';

const CACHE = new Map<string, number | null>();

const CABIN_MAP: Record<string, string> = {
  ECONOMY: 'economy',
  PREMIUM_ECONOMY: 'premium-economy',
  BUSINESS: 'business',
  FIRST: 'first'
};

// Pre-fetch live one-way cash prices from Google Flights for a set of routes.
// This lets evaluateThreshold use real market cash instead of static estimates.
function routeCabinKey(origin: string, destination: string, cabin: string) {
  return `${origin}:${destination}:${cabin}`;
}

export async function prefetchCashPrices(routes: { origin: string; destination: string; cabin: string; date: string }[], concurrency = 8) {
  // Use one cash price per route/cabin (not every date) to keep lookups fast and avoid rate limits.
  const seen = new Map<string, { origin: string; destination: string; cabin: string; date: string }>();
  for (const r of routes) {
    const key = routeCabinKey(r.origin, r.destination, r.cabin);
    if (!seen.has(key)) seen.set(key, r);
  }
  const unique = Array.from(seen.values());

  console.log(`💰 Fetching live cash prices for ${unique.length} unique route/cabin combos...`);

  const inFlight: Promise<void>[] = [];
  let completed = 0;

  for (const r of unique) {
    const key = routeCabinKey(r.origin, r.destination, r.cabin);
    if (CACHE.has(key)) continue;

    const promise = fetchOne(key, r).finally(() => {
      completed++;
      if (completed % 10 === 0 || completed === unique.length) {
        console.log(`  ... ${completed}/${unique.length} cash prices fetched`);
      }
    });

    inFlight.push(promise);

    if (inFlight.length >= concurrency) {
      await Promise.race(inFlight);
      inFlight.splice(inFlight.findIndex(p => p === promise), 1);
    }
  }

  await Promise.all(inFlight);
  console.log(`✅ Live cash price lookup complete.`);
}

async function fetchOne(key: string, r: { origin: string; destination: string; cabin: string; date: string }) {
  const seat = CABIN_MAP[r.cabin] || 'economy';
  try {
    const query = createQuery({
      flights: [{ date: r.date, from_airport: r.origin, to_airport: r.destination }],
      seat: seat as any,
      trip: 'one-way',
      passengers: new Passengers({ adults: 1 }),
      currency: 'USD'
    });

    const results = await getFlights(query, { timeout: 12_000, maxRetries: 1, retryDelay: 2_000 });
    const flights = Array.isArray(results) ? results : [];
    const withPrice = flights.filter((f: any) => typeof f?.price === 'number' && f.price > 0);
    const lowest = withPrice.sort((a: any, b: any) => a.price - b.price)[0];

    if (lowest && lowest.price > 0) {
      CACHE.set(key, lowest.price);
      return;
    }
  } catch (error) {
    // silence individual failures, will fall back to null below
  }

  CACHE.set(key, null);
}

// Get a live cash price for a route/cabin. Returns null if not cached or fetch failed;
// the caller should fall back to a static estimate.
export function getLiveCashPrice(origin: string, destination: string, cabin: string, _date: string): number | null {
  const key = routeCabinKey(origin, destination, cabin);
  return CACHE.get(key) ?? null;
}
