import { createQuery, getFlights, Passengers } from 'fast-flights-ts';

export interface FlightDetails {
  duration: number;          // total one-way duration in minutes
  stops: number;             // number of stops (segments - 1)
  layoverAirport: string | null;
  layoverDuration: number | null; // minutes
}

const PRICE_CACHE = new Map<string, number | null>();
const DETAILS_CACHE = new Map<string, FlightDetails | null>();

const CABIN_MAP: Record<string, string> = {
  ECONOMY: 'economy',
  PREMIUM_ECONOMY: 'premium-economy',
  BUSINESS: 'business',
  FIRST: 'first'
};

function routeCabinKey(origin: string, destination: string, cabin: string) {
  return `${origin}:${destination}:${cabin}`;
}

// Pre-fetch live one-way cash prices and representative flight details from Google Flights.
// This lets evaluateThreshold use real market cash instead of static estimates, and the
// UI can show duration/stops/layover for the modal.
export async function prefetchCashPrices(routes: { origin: string; destination: string; cabin: string; date: string }[], concurrency = 8) {
  // Use one price/details per route/cabin (not every date) to keep lookups fast and avoid rate limits.
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
    if (PRICE_CACHE.has(key)) continue;

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
      PRICE_CACHE.set(key, lowest.price);
      DETAILS_CACHE.set(key, extractFlightDetails(lowest.flights as any[]));
      return;
    }
  } catch (error) {
    // silence individual failures, will fall back to null below
  }

  PRICE_CACHE.set(key, null);
  DETAILS_CACHE.set(key, null);
}

function extractFlightDetails(segments: any[]): FlightDetails {
  const totalDuration = segments.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
  const stops = Math.max(0, segments.length - 1);

  let layoverAirport: string | null = null;
  let layoverDuration: number | null = null;

  if (stops > 0 && segments.length >= 2) {
    // Use the first stop's layover time and airport
    const first = segments[0];
    const second = segments[1];
    layoverAirport = first.to_airport?.code || null;

    if (first.arrival && second.departure) {
      const arr = new Date(first.arrival.date[0], first.arrival.date[1] - 1, first.arrival.date[2], first.arrival.time[0], first.arrival.time[1]);
      const dep = new Date(second.departure.date[0], second.departure.date[1] - 1, second.departure.date[2], second.departure.time[0], second.departure.time[1]);
      layoverDuration = Math.round((dep.getTime() - arr.getTime()) / (1000 * 60));
    }
  }

  return { duration: totalDuration, stops, layoverAirport, layoverDuration };
}

// Get a live cash price for a route/cabin. Returns null if not cached or fetch failed;
// the caller should fall back to a static estimate.
export function getLiveCashPrice(origin: string, destination: string, cabin: string, _date: string): number | null {
  const key = routeCabinKey(origin, destination, cabin);
  return PRICE_CACHE.get(key) ?? null;
}

// Get representative flight details for a route/cabin. Returns null if unavailable.
export function getFlightDetails(origin: string, destination: string, cabin: string, _date: string): FlightDetails | null {
  const key = routeCabinKey(origin, destination, cabin);
  return DETAILS_CACHE.get(key) ?? null;
}
