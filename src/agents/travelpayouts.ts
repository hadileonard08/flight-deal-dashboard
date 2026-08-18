import crypto from 'crypto';
import { findAirlineName, AIRLINE_INFO } from '../lib/airlines';

export interface Segment {
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  airline: string;
  aircraft?: string | null;
  flightNumber?: string | null;
  durationMinutes: number;
}

export interface FlightDetails {
  duration: number;
  stops: number;
  layoverAirport: string | null;
  layoverDuration: number | null;
  cashPrice: number;
  airlines: string[];
  aircraftType?: string | null;
  segments?: Segment[];
  redirectUrl?: string;
  cabin?: string;
}

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  cabin?: string;
  adults?: number;
  children?: number;
  infants?: number;
}

const RESULTS_CACHE = new Map<string, FlightDetails[] | null>();

const TP_TOKEN = process.env.TRAVELPAYOUTS_API_TOKEN || '';
const TP_MARKER = process.env.TRAVELPAYOUTS_MARKER || '';
const TP_HOST = process.env.TRAVELPAYOUTS_HOST || 'flight-deals-dashboard.vercel.app';
const TP_USER_IP = '127.0.0.1';

const SEARCH_API_BASE = 'https://tickets-api.travelpayouts.com';
const DATA_API_BASE = 'https://api.travelpayouts.com';

const CABIN_MAP: Record<string, string> = {
  ECONOMY: 'economy',
  PREMIUM_ECONOMY: 'premium-economy',
  BUSINESS: 'business',
  FIRST: 'first'
};

const SEARCH_CABIN_MAP: Record<string, string> = {
  ECONOMY: 'Y',
  PREMIUM_ECONOMY: 'W',
  BUSINESS: 'C',
  FIRST: 'F'
};

function routeCabinKey(origin: string, destination: string, cabin: string, date: string) {
  return `${origin}:${destination}:${cabin}:${date}`;
}

function nameToCode(name: string): string | null {
  const lower = (name || '').trim().toLowerCase();
  if (!lower) return null;

  for (const [code, info] of Object.entries(AIRLINE_INFO)) {
    if (info.name.toLowerCase() === lower) return code;
  }

  for (const [code, info] of Object.entries(AIRLINE_INFO)) {
    const tokens = new Set([code.toLowerCase(), ...info.name.toLowerCase().replace(/[()]/g, ' ').split(/\s+/).filter(Boolean)]);
    if (tokens.has(lower)) return code;
  }

  for (const [code, info] of Object.entries(AIRLINE_INFO)) {
    if (info.name.toLowerCase().includes(lower)) return code;
  }

  return null;
}

// Collect all values from a nested object for the Travelpayouts MD5 signature.
// Dict keys are sorted alphabetically; arrays are traversed in order.
function collectValues(obj: any): string[] {
  const values: string[] = [];
  if (obj === null || obj === undefined) return values;

  if (Array.isArray(obj)) {
    for (const item of obj) values.push(...collectValues(item));
  } else if (typeof obj === 'object') {
    for (const key of Object.keys(obj).sort()) {
      values.push(...collectValues(obj[key]));
    }
  } else {
    values.push(String(obj));
  }
  return values;
}

function generateSignature(params: Record<string, any>): string {
  const values = collectValues(params);
  const raw = `${TP_TOKEN}:${values.join(':')}`;
  return crypto.createHash('md5').update(raw).digest('hex');
}

function tpHeaders(signature: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip',
    'x-real-host': TP_HOST,
    'x-user-ip': TP_USER_IP,
    'x-signature': signature,
    'x-affiliate-user-id': TP_TOKEN
  };
}

function parseSearchBody(r: { origin: string; destination: string; cabin: string; date: string; passengers?: { adults?: number; children?: number; infants?: number } }) {
  const directions: { origin: string; destination: string; date: string }[] = [
    { origin: r.origin, destination: r.destination, date: r.date }
  ];

  const passengers = {
    adults: r.passengers?.adults ?? 1,
    children: r.passengers?.children ?? 0,
    infants: r.passengers?.infants ?? 0
  };

  return {
    marker: TP_MARKER,
    locale: 'en',
    search_params: {
      trip_class: SEARCH_CABIN_MAP[r.cabin] || 'Y',
      passengers,
      directions
    }
  };
}

async function tryRealtimeSearch(r: { origin: string; destination: string; cabin: string; date: string; passengers?: { adults?: number; children?: number; infants?: number } }): Promise<FlightDetails[] | null> {
  if (!TP_TOKEN || !TP_MARKER) return null;

  try {
    const startBody = parseSearchBody(r);
    const startSignature = generateSignature(startBody);
    const startRes = await fetch(`${SEARCH_API_BASE}/search/affiliate/start`, {
      method: 'POST',
      headers: tpHeaders(startSignature),
      body: JSON.stringify({ ...startBody, signature: startSignature })
    });

    if (!startRes.ok) {
      console.log(`  Travelpayouts realtime start failed: ${startRes.status} ${await startRes.text().catch(() => '')}`);
      return null;
    }

    const startJson: any = await startRes.json();
    const searchId = startJson?.search_id;
    const resultsUrl = startJson?.results_url || SEARCH_API_BASE;
    if (!searchId) {
      console.log('  Travelpayouts realtime start returned no search_id');
      return null;
    }

    let lastUpdate = 0;
    for (let i = 0; i < 20; i++) {
      const pollBody = { search_id: searchId, last_update_timestamp: lastUpdate };
      const pollSignature = generateSignature(pollBody);

      const pollRes = await fetch(`${resultsUrl}/search/affiliate/results`, {
        method: 'POST',
        headers: tpHeaders(pollSignature),
        body: JSON.stringify(pollBody)
      });

      if (pollRes.status === 304) {
        await new Promise(res => setTimeout(res, 3000));
        continue;
      }
      if (!pollRes.ok) {
        console.log(`  Travelpayouts realtime poll failed: ${pollRes.status}`);
        return null;
      }

      const data: any = await pollRes.json();
      lastUpdate = data?.last_update_timestamp ?? lastUpdate;

      if (data?.is_over && data?.tickets) {
        return parseRealtimeResults(data, searchId);
      }
      if (data?.is_over) break;
      await new Promise(res => setTimeout(res, 3000));
    }
  } catch (error) {
    console.log(`  Travelpayouts realtime error: ${(error as Error).message}`);
  }

  return null;
}

function parseRealtimeResults(data: any, searchId: string): FlightDetails[] | null {
  try {
    const tickets = data.tickets || [];
    const results: FlightDetails[] = [];
    const agents: Record<string, any> = {};
    for (const a of data.agents || []) agents[a.id] = a;

    for (const ticket of tickets) {
      const proposals = ticket.proposals || [];
      if (proposals.length === 0) continue;

      const best = proposals.reduce((cheapest: any, p: any) => {
        const price = p?.price?.amount ?? Infinity;
        const cheapestPrice = cheapest?.price?.amount ?? Infinity;
        return price < cheapestPrice ? p : cheapest;
      }, null);

      const terms = best?.terms?.[best.agent_id];
      let redirectUrl: string | undefined;
      if (terms?.url) {
        redirectUrl = `${DATA_API_BASE}/v1/flight_searches/${searchId}/clicks/${terms.url}.json?marker=${encodeURIComponent(TP_MARKER)}`;
      }

      const flightTerms = best?.flight_terms || [];
      const carriers = new Set<string>();
      const segments: Segment[] = [];
      let totalDuration = 0;

      for (let idx = 0; idx < flightTerms.length; idx++) {
        const ft = Array.isArray(flightTerms[idx]) ? flightTerms[idx][0] : flightTerms[idx];
        if (!ft) continue;
        const carrier = ft.carrier || '';
        if (carrier) carriers.add(carrier);

        const seg = ticket.segments?.[idx];
        const leg = data.flight_legs?.find((l: any) => l?.id === seg?.flight_id) || {};
        totalDuration += Number(ft.duration ?? leg.duration ?? 0);

        segments.push({
          origin: seg?.origin || leg?.origin || '',
          destination: seg?.destination || leg?.destination || '',
          departureAt: seg?.departure || leg?.departure || '',
          arrivalAt: seg?.arrival || leg?.arrival || '',
          airline: findAirlineName(carrier) || carrier,
          aircraft: null,
          flightNumber: ft.number || leg?.flight_number || null,
          durationMinutes: Number(ft.duration ?? leg.duration ?? 0)
        });
      }

      results.push({
        duration: totalDuration,
        stops: Math.max(0, segments.length - 1),
        layoverAirport: null,
        layoverDuration: null,
        cashPrice: Number(best.price?.amount) || 0,
        airlines: Array.from(carriers).map(c => findAirlineName(c) || c),
        segments,
        redirectUrl,
        cabin: best?.trip_class
      });
    }

    return results.length ? results : null;
  } catch (error) {
    console.log(`  Travelpayouts realtime parse error: ${(error as Error).message}`);
    return null;
  }
}

// Fetch cached economy prices from the Travelpayouts Data API v3 prices_for_dates endpoint.
// This works out of the box with the free token and returns a redirect `link`.
async function tryDataAPI(r: { origin: string; destination: string; date: string }): Promise<FlightDetails[] | null> {
  if (!TP_TOKEN) return null;

  const params = new URLSearchParams({
    origin: r.origin,
    destination: r.destination,
    departure_at: r.date,
    currency: 'usd',
    sorting: 'price',
    direct: 'false',
    limit: '5',
    token: TP_TOKEN
  });

  try {
    const res = await fetch(`${DATA_API_BASE}/aviasales/v3/prices_for_dates?${params.toString()}`, {
      headers: { 'Accept-Encoding': 'gzip' }
    });
    if (!res.ok) return null;

    const json: any = await res.json();
    if (!json?.success || !Array.isArray(json.data) || json.data.length === 0) return null;

    return json.data.map((item: any) => {
      const stopCount = Number(item.transfers) || 0;
      const airports = extractAirportsFromLink(item.link || '', stopCount);
      const layover = stopCount === 1 ? airports[1] : null;

      return {
        duration: Number(item.duration) || Number(item.duration_to) || 0,
        stops: stopCount,
        layoverAirport: layover,
        layoverDuration: null,
        cashPrice: Number(item.price) || 0,
        airlines: [findAirlineName(item.airline) || item.airline].filter(Boolean),
        redirectUrl: `https://www.aviasales.com${item.link}`,
        cabin: 'ECONOMY'
      };
    });
  } catch (error) {
    console.log(`  Travelpayouts Data API error: ${(error as Error).message}`);
    return null;
  }
}

// The `link` field contains a `t=...` parameter with encoded segment airports at the end.
// For example t=CX...2040JFKHKGHND_... -> ['JFK','HKG','HND'].
function extractAirportsFromLink(link: string, stops: number): string[] {
  try {
    const tMatch = link.match(/[?&]t=([^&_]+)/);
    if (!tMatch) return [];
    const tValue = tMatch[1];
    const codeCount = stops + 2;
    if (tValue.length < codeCount * 3) return [];
    const airportsPart = tValue.slice(-codeCount * 3);
    const airports: string[] = [];
    for (let i = 0; i < airportsPart.length; i += 3) {
      airports.push(airportsPart.slice(i, i + 3));
    }
    return airports;
  } catch {
    return [];
  }
}

async function fetchOne(key: string, r: { origin: string; destination: string; cabin: string; date: string }) {
  if (!TP_TOKEN) {
    RESULTS_CACHE.set(key, null);
    return;
  }

  // Try real-time affiliate search first. This requires separate Travelpayouts approval.
  const realtime = await tryRealtimeSearch(r);
  if (realtime && realtime.length > 0) {
    RESULTS_CACHE.set(key, realtime.sort((a, b) => a.cashPrice - b.cashPrice));
    return;
  }

  // Real-time unavailable or not approved. Use the cached Data API for economy routes.
  if (r.cabin === 'ECONOMY') {
    const dataResults = await tryDataAPI(r);
    if (dataResults && dataResults.length > 0) {
      RESULTS_CACHE.set(key, dataResults.sort((a, b) => a.cashPrice - b.cashPrice));
      return;
    }
  }

  RESULTS_CACHE.set(key, null);
}

export async function prefetchCashPrices(routes: { origin: string; destination: string; cabin: string; date: string }[], concurrency = 2) {
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
  console.log('✅ Live cash price lookup complete.');
}

function findBestMatch(results: FlightDetails[] | null, airline: string): FlightDetails | null {
  if (!results || results.length === 0) return null;
  if (!airline) return results[0];

  const sorted = [...results].sort((a, b) => a.cashPrice - b.cashPrice);
  const airlineLower = airline.toLowerCase();
  const targetCode = nameToCode(airline);

  const exact = sorted.find(r =>
    r.airlines.some(a => a.toLowerCase() === airlineLower) ||
    (targetCode && r.airlines.some(a => nameToCode(a) === targetCode))
  );
  if (exact) return exact;

  const partial = sorted.find(r =>
    r.airlines.some(a => a.toLowerCase().includes(airlineLower) || airlineLower.includes(a.toLowerCase()))
  );
  if (partial) return partial;

  return sorted[0];
}

export function getLiveCashPrice(origin: string, destination: string, cabin: string, date: string, airline?: string): number | null {
  const key = routeCabinKey(origin, destination, cabin, date);
  const results = RESULTS_CACHE.get(key);
  const match = findBestMatch(results ?? null, airline || '');
  return match?.cashPrice ?? null;
}

export function getFlightDetails(origin: string, destination: string, cabin: string, date: string, airline?: string): FlightDetails | null {
  const key = routeCabinKey(origin, destination, cabin, date);
  const results = RESULTS_CACHE.get(key);
  return findBestMatch(results ?? null, airline || '') ?? null;
}

// Standalone search helper for the /api/flight-search endpoint.
// Returns live/cached results with explicit redirect URLs.
export async function searchFlights(params: FlightSearchParams): Promise<{ success: boolean; currency: string; flights: FlightDetails[]; error?: string }> {
  if (!TP_TOKEN) {
    return { success: false, currency: 'USD', flights: [], error: 'Travelpayouts API token not configured' };
  }

  const cabin = (params.cabin || 'ECONOMY').toUpperCase();
  const r = {
    origin: params.origin,
    destination: params.destination,
    cabin,
    date: params.departureDate,
    passengers: {
      adults: params.adults ?? 1,
      children: params.children ?? 0,
      infants: params.infants ?? 0
    }
  };

  // Real-time first (will work when/if access is approved).
  const realtime = await tryRealtimeSearch(r);
  if (realtime && realtime.length > 0) {
    return { success: true, currency: 'USD', flights: realtime };
  }

  // Cached Data API for one-way economy.
  if (cabin === 'ECONOMY') {
    const cached = await tryDataAPI({ origin: r.origin, destination: r.destination, date: r.date });
    if (cached && cached.length > 0) {
      return { success: true, currency: 'USD', flights: cached };
    }
  }

  return {
    success: false,
    currency: 'USD',
    flights: [],
    error: 'No results found. For business/first class, the real-time Flight Search API requires Travelpayouts approval.'
  };
}
