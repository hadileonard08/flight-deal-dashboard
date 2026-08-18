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
  isEstimate?: boolean;
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

const DUFFEL_API_TOKEN = process.env.DUFFEL_API_TOKEN || '';

const SEARCH_API_BASE = 'https://tickets-api.travelpayouts.com';
const DATA_API_BASE = 'https://api.travelpayouts.com';

const CABIN_MAP: Record<string, string> = {
  ECONOMY: 'economy',
  PREMIUM_ECONOMY: 'premium-economy',
  BUSINESS: 'business',
  FIRST: 'first'
};

const CABIN_MULTIPLIERS: Record<string, number> = {
  BUSINESS: 3.5,
  FIRST: 6.5
};

const SEARCH_CABIN_MAP: Record<string, string> = {
  ECONOMY: 'Y',
  PREMIUM_ECONOMY: 'W',
  BUSINESS: 'C',
  FIRST: 'F'
};

// Parse an ISO 8601 duration like PT11H44M to minutes.
function parseDuration(iso: string): number {
  const match = iso.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10);
  const minutes = parseInt(match[3] || '0', 10);
  return days * 24 * 60 + hours * 60 + minutes;
}

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

// Try Duffel's live offer request API for real-time one-way prices in any cabin.
async function tryDuffel(r: { origin: string; destination: string; cabin: string; date: string }): Promise<FlightDetails[] | null> {
  if (!DUFFEL_API_TOKEN) return null;

  try {
    const res = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true&limit=50', {
      method: 'POST',
      headers: {
        'Accept-Encoding': 'gzip',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Duffel-Version': 'v2',
        'Authorization': `Bearer ${DUFFEL_API_TOKEN}`
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
      console.log(`  Duffel HTTP ${res.status}`);
      return null;
    }

    const json: any = await res.json();
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
        const aircraftType = segments[0]?.aircraft?.name || segments[0]?.aircraft?.iata_code || null;

        return {
          duration: totalDuration,
          stops,
          layoverAirport,
          layoverDuration,
          cashPrice: Number(o.total_amount) || 0,
          airlines,
          aircraftType,
          cabin: r.cabin,
          segments: segments.map((s: any) => ({
            origin: s.origin?.iata_code || '',
            destination: s.destination?.iata_code || '',
            departureAt: s.departing_at || '',
            arrivalAt: s.arriving_at || '',
            airline: s.operating_carrier?.name || s.marketing_carrier?.name || 'Unknown',
            aircraft: s.aircraft?.name || s.aircraft?.iata_code || null,
            flightNumber: s.marketing_carrier_flight_number || s.operating_carrier_flight_number || null,
            durationMinutes: parseDuration(s.duration) || 0
          }))
        };
      });
  } catch (error) {
    console.log(`  Duffel error: ${(error as Error).message}`);
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
      const duration = Number(item.duration) || Number(item.duration_to) || 0;
      const airline = findAirlineName(item.airline) || item.airline;

      // Build a segment list from the airport chain if we can derive one.
      const segmentAirports = airports.length >= 2 ? airports : [item.origin_airport, item.destination_airport];
      const legDuration = Math.max(0, Math.round(duration / Math.max(1, segmentAirports.length - 1)));
      const departureAt = new Date(item.departure_at).getTime();
      const segments: Segment[] = [];
      let currentTime = departureAt;

      for (let i = 0; i < segmentAirports.length - 1; i++) {
        const arrTime = currentTime + legDuration * 60 * 1000;
        segments.push({
          origin: segmentAirports[i],
          destination: segmentAirports[i + 1],
          departureAt: new Date(currentTime).toISOString(),
          arrivalAt: new Date(arrTime).toISOString(),
          airline,
          aircraft: null,
          flightNumber: null,
          durationMinutes: legDuration
        });
        currentTime = arrTime;
      }

      return {
        duration,
        stops: stopCount,
        layoverAirport: layover,
        layoverDuration: null,
        cashPrice: Number(item.price) || 0,
        airlines: [airline].filter(Boolean),
        redirectUrl: `https://www.aviasales.com${item.link}`,
        cabin: 'ECONOMY',
        segments
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

// Batch-prefetch cabin estimates for a list of business/first routes.
export async function prefetchCabinEstimates(routes: { origin: string; destination: string; cabin: string; date: string }[], concurrency = 5) {
  const seen = new Map<string, { origin: string; destination: string; cabin: string; date: string }>();
  for (const r of routes) {
    const key = routeCabinKey(r.origin, r.destination, r.cabin, r.date);
    if (!seen.has(key)) seen.set(key, r);
  }

  const inFlight: Promise<void>[] = [];
  for (const r of seen.values()) {
    const promise = getCabinEstimate(r.origin, r.destination, r.date, r.cabin).then(() => {});
    inFlight.push(promise);

    if (inFlight.length >= concurrency) {
      await Promise.race(inFlight);
      inFlight.splice(inFlight.findIndex(p => p === promise), 1);
    }
  }
  await Promise.all(inFlight);
}

// Try live sources in priority order: Travelpayouts real-time, then Data API (economy),
// then Duffel. Returns all matching offers or null.
async function getLiveResults(r: { origin: string; destination: string; cabin: string; date: string }): Promise<FlightDetails[] | null> {
  // 1. Travelpayouts real-time affiliate search (requires approval).
  if (TP_TOKEN) {
    const realtime = await tryRealtimeSearch(r);
    if (realtime && realtime.length > 0) return realtime;
  }

  // 2. Travelpayouts Data API for economy routes.
  if (TP_TOKEN && r.cabin === 'ECONOMY') {
    const dataResults = await tryDataAPI(r);
    if (dataResults && dataResults.length > 0) return dataResults;
  }

  // 3. Duffel for real-time prices in any cabin.
  if (DUFFEL_API_TOKEN) {
    const duffel = await tryDuffel(r);
    if (duffel && duffel.length > 0) return duffel;
  }

  return null;
}

// Fetch a live economy price and apply the requested cabin multiplier.
// Returns a single estimated FlightDetails for business/first class when
// real-time search is not yet approved.
export async function getCabinEstimate(origin: string, destination: string, date: string, cabin: string): Promise<FlightDetails | null> {
  const results = await getLiveResults({ origin, destination, cabin: cabin.toUpperCase(), date });
  if (results && results.length > 0) {
    const cheapest = results.sort((a, b) => a.cashPrice - b.cashPrice)[0];
    const key = routeCabinKey(origin, destination, cabin.toUpperCase(), date);
    RESULTS_CACHE.set(key, [cheapest]);
    return cheapest;
  }

  const multiplier = CABIN_MULTIPLIERS[cabin.toUpperCase()];
  if (!multiplier) return null;

  const economyResults = await tryDataAPI({ origin, destination, date });
  if (!economyResults || economyResults.length === 0) return null;

  const cheapest = economyResults.sort((a, b) => a.cashPrice - b.cashPrice)[0];
  const estimatedPrice = Math.round(cheapest.cashPrice * multiplier);

  const estimate: FlightDetails = {
    ...cheapest,
    cabin: cabin.toUpperCase(),
    cashPrice: estimatedPrice,
    isEstimate: true
  };

  const key = routeCabinKey(origin, destination, cabin.toUpperCase(), date);
  RESULTS_CACHE.set(key, [estimate]);

  return estimate;
}

async function fetchOne(key: string, r: { origin: string; destination: string; cabin: string; date: string }) {
  const results = await getLiveResults(r);
  if (results && results.length > 0) {
    RESULTS_CACHE.set(key, results.sort((a, b) => a.cashPrice - b.cashPrice));
    return;
  }

  // Last resort: estimate business/first from economy prices.
  if (CABIN_MULTIPLIERS[r.cabin]) {
    const estimate = await getCabinEstimate(r.origin, r.destination, r.date, r.cabin);
    if (estimate) {
      RESULTS_CACHE.set(key, [estimate]);
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

  // 1. Travelpayouts real-time (if/when approved) and Data API / Duffel fallback.
  const live = await getLiveResults(r);
  if (live && live.length > 0) {
    // If the source was Duffel, attach the best Travelpayouts affiliate redirect we can find.
    const hasRedirect = live.some(f => f.redirectUrl);
    if (!hasRedirect && TP_TOKEN) {
      const tpData = await tryDataAPI({ origin: r.origin, destination: r.destination, date: r.date });
      const redirectUrl = tpData?.[0]?.redirectUrl;
      if (redirectUrl) {
        return { success: true, currency: 'USD', flights: live.slice(0, 10).map(f => ({ ...f, redirectUrl })) };
      }
    }
    return { success: true, currency: 'USD', flights: live.slice(0, 10) };
  }

  // 2. Estimate business/first from the cheapest economy result.
  if (CABIN_MULTIPLIERS[cabin]) {
    const estimate = await getCabinEstimate(r.origin, r.destination, r.date, cabin);
    if (estimate) {
      return { success: true, currency: 'USD', flights: [estimate] };
    }
  }

  const isPremium = cabin === 'BUSINESS' || cabin === 'FIRST';
  return {
    success: false,
    currency: 'USD',
    flights: [],
    error: isPremium
      ? 'No results found. For business/first class, the real-time Flight Search API requires Travelpayouts approval.'
      : 'No results found for this route and date in the Travelpayouts Data API.'
  };
}
