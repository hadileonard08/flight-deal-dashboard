import { createQuery, getFlights, Passengers } from 'fast-flights-ts';
import { AIRLINE_NAMES } from '../lib/airlines';

export interface FlightDetails {
  duration: number;          // total one-way duration in minutes
  stops: number;             // number of stops (segments - 1)
  layoverAirport: string | null;
  layoverDuration: number | null; // minutes
  cashPrice: number;
  airlines: string[];
}

const RESULTS_CACHE = new Map<string, FlightDetails[] | null>();

const CABIN_MAP: Record<string, string> = {
  ECONOMY: 'economy',
  PREMIUM_ECONOMY: 'premium-economy',
  BUSINESS: 'business',
  FIRST: 'first'
};

const DUFFEL_API_KEY = process.env.DUFFEL_API_TOKEN || '';

function routeCabinKey(origin: string, destination: string, cabin: string, date: string) {
  return `${origin}:${destination}:${cabin}:${date}`;
}

function nameToCode(name: string): string | null {
  const lower = (name || '').toLowerCase();
  for (const [code, mapped] of Object.entries(AIRLINE_NAMES)) {
    if (mapped.toLowerCase() === lower) return code;
  }
  return null;
}

// Parse an ISO 8601 duration like PT11H44M, P1DT8H40M, or PT16H15M to minutes.
function parseDuration(iso: string): number {
  const match = iso.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10);
  const minutes = parseInt(match[3] || '0', 10);
  return days * 24 * 60 + hours * 60 + minutes;
}

// Pre-fetch live one-way cash prices and representative flight details from Duffel.
// Falls back to fast-flights-ts if Duffel fails, then to the static estimate table.
export async function prefetchCashPrices(routes: { origin: string; destination: string; cabin: string; date: string }[], concurrency = 3) {
  const seen = new Map<string, { origin: string; destination: string; cabin: string; date: string }>();
  for (const r of routes) {
    const key = routeCabinKey(r.origin, r.destination, r.cabin, r.date);
    if (!seen.has(key)) seen.set(key, r);
  }
  const unique = Array.from(seen.values());

  console.log(`💰 Fetching live cash prices for ${unique.length} unique route/cabin combos...`);

  const inFlight: Promise<void>[] = [];
  let completed = 0;

  for (const r of unique) {
    const key = routeCabinKey(r.origin, r.destination, r.cabin, r.date);
    if (RESULTS_CACHE.has(key)) continue;

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
  if (DUFFEL_API_KEY) {
    try {
      const duffel = await fetchDuffel(r);
      if (duffel && duffel.length > 0) {
        RESULTS_CACHE.set(key, duffel.sort((a, b) => a.cashPrice - b.cashPrice));
        return;
      }
    } catch (error) {
      console.log(`  Duffel failed for ${r.origin}-${r.destination}, falling back to Google Flights`);
    }
  }

  try {
    const seat = CABIN_MAP[r.cabin] || 'economy';
    const query = createQuery({
      flights: [{ date: r.date, from_airport: r.origin, to_airport: r.destination }],
      seat: seat as any,
      trip: 'one-way',
      passengers: new Passengers({ adults: 1 }),
      currency: 'USD'
    });

    const results = await getFlights(query, { timeout: 12_000, maxRetries: 1, retryDelay: 2_000 });
    const flights = Array.isArray(results) ? results : [];
    const withPrice = flights
      .filter((f: any) => typeof f?.price === 'number' && f.price > 0)
      .map((f: any) => ({
        ...extractFlightDetails(f.flights as any[]),
        cashPrice: f.price as number,
        airlines: (Array.isArray(f.airlines) ? f.airlines : []).map((a: any) => String(a))
      }))
      .sort((a, b) => a.cashPrice - b.cashPrice);

    if (withPrice.length > 0) {
      RESULTS_CACHE.set(key, withPrice);
      return;
    }
  } catch (error) {
    // silence
  }

  RESULTS_CACHE.set(key, null);
}

async function fetchDuffel(r: { origin: string; destination: string; cabin: string; date: string }): Promise<FlightDetails[]> {
  const res = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true&limit=200', {
    method: 'POST',
    headers: {
      'Accept-Encoding': 'gzip',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Duffel-Version': 'v2',
      'Authorization': `Bearer ${DUFFEL_API_KEY}`
    },
    body: JSON.stringify({
      data: {
        slices: [{ origin: r.origin, destination: r.destination, departure_date: r.date }],
        passengers: [{ type: 'adult' }],
        cabin_class: CABIN_MAP[r.cabin] || 'economy'
      }
    })
  });

  if (!res.ok) {
    throw new Error(`Duffel HTTP ${res.status}`);
  }

  const json = await res.json();
  const offers = json.data?.offers || [];

  return offers
    .filter((o: any) => o.slices?.[0]?.segments?.length > 0)
    .map((o: any) => {
      const slice = o.slices[0];
      const segments = slice.segments;
      const totalDuration = parseDuration(slice.duration);
      const stops = Math.max(0, segments.length - 1);

      let layoverAirport: string | null = null;
      let layoverDuration: number | null = null;

      if (stops > 0 && segments.length >= 2) {
        const first = segments[0];
        const second = segments[1];
        layoverAirport = first.destination?.iata_code || null;

        if (first.arriving_at && second.departing_at) {
          const arr = new Date(first.arriving_at);
          const dep = new Date(second.departing_at);
          if (!isNaN(arr.getTime()) && !isNaN(dep.getTime())) {
            layoverDuration = Math.max(0, Math.round((dep.getTime() - arr.getTime()) / (1000 * 60)));
          }
        }
      }

      const airlines = Array.from(new Set(segments.map((s: any) => s.operating_carrier?.name || s.marketing_carrier?.name || 'Unknown')));

      return {
        duration: totalDuration,
        stops,
        layoverAirport,
        layoverDuration,
        cashPrice: Number(o.total_amount) || 0,
        airlines
      };
    });
}

function extractFlightDetails(segments: any[]): Omit<FlightDetails, 'cashPrice' | 'airlines'> {
  const totalDuration = segments.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
  const stops = Math.max(0, segments.length - 1);

  let layoverAirport: string | null = null;
  let layoverDuration: number | null = null;

  if (stops > 0 && segments.length >= 2) {
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

function findBestMatch(results: FlightDetails[] | null, airline: string): FlightDetails | null {
  if (!results || results.length === 0) return null;
  if (!airline) return results[0];

  const sorted = [...results].sort((a, b) => a.cashPrice - b.cashPrice);

  const airlineLower = airline.toLowerCase();
  const targetCode = nameToCode(airline);

  // Prefer the exact airline (e.g. Qatar Airways)
  const exact = sorted.find(r =>
    r.airlines.some(a => a.toLowerCase() === airlineLower) ||
    (targetCode && r.airlines.some(a => nameToCode(a) === targetCode))
  );
  if (exact) return exact;

  // Partial match by name substring (e.g. Alaska -> Alaska Airlines)
  const partial = sorted.find(r =>
    r.airlines.some(a => a.toLowerCase().includes(airlineLower) || airlineLower.includes(a.toLowerCase()))
  );
  if (partial) return partial;

  // Fall back to the cheapest cash option for this route/cabin/date.
  // The UI wording makes clear this is the cheapest one-way cash alternative,
  // which may differ from the award airline.
  return sorted[0];
}

// Get the live cash price for a route/cabin/date, preferring the deal's airline.
export function getLiveCashPrice(origin: string, destination: string, cabin: string, date: string, airline?: string): number | null {
  const key = routeCabinKey(origin, destination, cabin, date);
  const results = RESULTS_CACHE.get(key);
  const match = findBestMatch(results ?? null, airline || '');
  return match?.cashPrice ?? null;
}

// Get representative flight details for a route/cabin/date, preferring the deal's airline.
export function getFlightDetails(origin: string, destination: string, cabin: string, date: string, airline?: string): FlightDetails | null {
  const key = routeCabinKey(origin, destination, cabin, date);
  const results = RESULTS_CACHE.get(key);
  return findBestMatch(results ?? null, airline || '') ?? null;
}
