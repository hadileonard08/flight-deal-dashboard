import { resolveAirlineName, getAirlineCode } from './airlines';

const SEATS_AERO_API_BASE = 'https://seats.aero/partnerapi';

const DEFAULT_US_GATEWAYS = ['JFK', 'LAX', 'SFO', 'ORD', 'SEA', 'IAD', 'BOS', 'MIA', 'DFW', 'DEN', 'ATL', 'SJC', 'HNL', 'PDX', 'PHX'];

const CITY_AIRPORTS: Record<string, string[]> = {
  // Asia — multi-airport cities
  TYO: ['HND', 'NRT'],
  SEL: ['ICN', 'GMP'],
  OSA: ['KIX', 'ITM'],
  // Asia — single airport cities (explicit mapping for clarity)
  HKG: ['HKG'],
  ICN: ['ICN'],
  SIN: ['SIN'],
  BKK: ['BKK'],
  TPE: ['TPE'],
  KUL: ['KUL'],
  MNL: ['MNL'],
  SGN: ['SGN'],
  HAN: ['HAN'],
  DPS: ['DPS'],
  CGK: ['CGK'],
  BOM: ['BOM'],
  DEL: ['DEL'],
  CNX: ['CNX'],
  PUS: ['PUS'],
  // Europe — multi-airport cities
  LON: ['LHR', 'LGW', 'STN'],
  PAR: ['CDG', 'ORY'],
  MIL: ['MXP', 'LIN', 'BGY'],
  // Europe — single airport cities
  LHR: ['LHR'],
  LGW: ['LGW'],
  CDG: ['CDG'],
  ORY: ['ORY'],
  FRA: ['FRA'],
  AMS: ['AMS'],
  MAD: ['MAD'],
  BCN: ['BCN'],
  FCO: ['FCO'],
  MXP: ['MXP'],
  MUC: ['MUC'],
  ZRH: ['ZRH'],
  GVA: ['GVA'],
  VIE: ['VIE'],
  DUB: ['DUB'],
  LIS: ['LIS'],
  ATH: ['ATH'],
  PRG: ['PRG'],
  WAW: ['WAW'],
  CPH: ['CPH'],
  ARN: ['ARN'],
  OSL: ['OSL'],
  HEL: ['HEL'],
  IST: ['IST'],
  // Middle East
  DXB: ['DXB'],
  AUH: ['AUH'],
  DOH: ['DOH'],
  TLV: ['TLV'],
  // Latin America
  MEX: ['MEX'],
  CUN: ['CUN'],
  BOG: ['BOG'],
  LIM: ['LIM'],
  SCL: ['SCL'],
  EZE: ['EZE'],
  GRU: ['GRU'],
  GIG: ['GIG'],
  // Oceania
  SYD: ['SYD'],
  MEL: ['MEL'],
  BNE: ['BNE'],
  AKL: ['AKL'],
  NAN: ['NAN'],
  // Africa
  JNB: ['JNB'],
  CPT: ['CPT'],
  NBO: ['NBO'],
  CMN: ['CMN'],
};

const CABIN_MAP_REVERSE: Record<string, string> = {
  Y: 'ECONOMY',
  W: 'PREMIUM_ECONOMY',
  J: 'BUSINESS',
  F: 'FIRST',
};

function resolveDestinationAirports(code: string): string[] {
  return CITY_AIRPORTS[code] || [code];
}

function roughCategory(cabin: string, points: number): string {
  if (cabin === 'ECONOMY') return points <= 30000 ? 'GOOD_DEAL' : points <= 45000 ? 'MAYBE_GOOD_DEAL' : points <= 60000 ? 'OKAY_DEAL' : 'BAD_DEAL';
  if (cabin === 'PREMIUM_ECONOMY') return points <= 50000 ? 'GOOD_DEAL' : points <= 70000 ? 'MAYBE_GOOD_DEAL' : points <= 90000 ? 'OKAY_DEAL' : 'BAD_DEAL';
  if (cabin === 'BUSINESS') return points <= 70000 ? 'GOOD_DEAL' : points <= 100000 ? 'MAYBE_GOOD_DEAL' : points <= 130000 ? 'OKAY_DEAL' : 'BAD_DEAL';
  if (cabin === 'FIRST') return points <= 100000 ? 'GOOD_DEAL' : points <= 140000 ? 'MAYBE_GOOD_DEAL' : points <= 180000 ? 'OKAY_DEAL' : 'BAD_DEAL';
  return 'LIVE';
}

export interface SeatsAeroSegment {
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  airline: string;
  flightNumber: string | null;
  aircraft: string | null;
  durationMinutes: number | null;
}

export interface SeatsAeroTripDetails {
  duration: number; // minutes
  stops: number;
  layoverAirport: string | null;
  layoverDuration: number | null; // minutes
  airlines: string[];
  aircraftType: string | null;
  segments: SeatsAeroSegment[];
}

const CABIN_API: Record<string, string> = {
  ECONOMY: 'economy',
  PREMIUM_ECONOMY: 'premium',
  BUSINESS: 'business',
  FIRST: 'first'
};

const CABIN_AVAILABILITY: Record<string, { availableKey: string; mileageKey: string; rawMileageKey: string; airlinesKey: string }> = {
  economy: { availableKey: 'YAvailable', mileageKey: 'YMileageCost', rawMileageKey: 'YMileageCostRaw', airlinesKey: 'YAirlines' },
  premium: { availableKey: 'WAvailable', mileageKey: 'WMileageCost', rawMileageKey: 'WMileageCostRaw', airlinesKey: 'WAirlines' },
  business: { availableKey: 'JAvailable', mileageKey: 'JMileageCost', rawMileageKey: 'JMileageCostRaw', airlinesKey: 'JAirlines' },
  first: { availableKey: 'FAvailable', mileageKey: 'FMileageCost', rawMileageKey: 'FMileageCostRaw', airlinesKey: 'FAirlines' }
};

function getApiKey() {
  const key = process.env.SEATS_AERO_API_KEY;
  if (!key || key.includes('your_seats_aero_api_key')) return null;
  return key;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSeatsAeroTripDetails(
  origin: string,
  destination: string,
  date: string,
  cabin: string,
  pointsRequired?: number | null,
  airline?: string | null
): Promise<SeatsAeroTripDetails | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const cabinSlug = CABIN_API[cabin.toUpperCase()] || 'economy';
  const { availableKey, mileageKey, airlinesKey } = CABIN_AVAILABILITY[cabinSlug];
  const airlineCode = airline ? getAirlineCode(airline) : null;

  const searchParams = new URLSearchParams({
    origin_airport: origin,
    destination_airport: destination,
    start_date: date,
    end_date: date,
    order_by: 'lowest_mileage',
    take: '10',
    cabins: cabinSlug
  });

  const headers = {
    'Partner-Authorization': apiKey,
    'Accept': 'application/json'
  };

  try {
    const searchRes = await fetchWithTimeout(`${SEATS_AERO_API_BASE}/search?${searchParams.toString()}`, { headers });
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const results = searchData?.data || [];
    if (!results.length) return null;

    const airlineHasCode = (r: any, code: string | null) => {
      if (!code) return true;
      const airlines = r[airlinesKey] || '';
      return airlines.split(',').map((c: string) => c.trim()).includes(code);
    };

    const match = results.find((r: any) => {
      const available = r[availableKey];
      const cost = parseInt(r[mileageKey], 10);
      return !!available && cost > 0 && airlineHasCode(r, airlineCode) && (!pointsRequired || cost === pointsRequired);
    }) || results.find((r: any) => !!r[availableKey] && airlineHasCode(r, airlineCode))
      || results.find((r: any) => !!r[availableKey]);

    if (!match) return null;

    const tripRes = await fetchWithTimeout(`${SEATS_AERO_API_BASE}/trips/${match.ID}`, { headers });
    if (!tripRes.ok) return null;

    const tripData = await tripRes.json();
    const trips = tripData?.data || [];
    if (!trips.length) return null;

    const trip = trips.find((t: any) => {
      const carriers = t.Carriers ? t.Carriers.split(',').map((c: string) => c.trim()) : [];
      return t.Cabin === cabinSlug && (!airlineCode || carriers.includes(airlineCode));
    }) || trips.find((t: any) => t.Cabin === cabinSlug) || trips[0];
    const segmentsRaw = trip.AvailabilitySegments || [];

    const segments: SeatsAeroSegment[] = segmentsRaw.map((s: any) => ({
      origin: s.OriginAirport,
      destination: s.DestinationAirport,
      departureAt: s.DepartsAt,
      arrivalAt: s.ArrivesAt,
      airline: resolveAirlineName(s.FlightNumber?.match(/^[A-Z]+/)?.[0] || trip.Carriers) || 'Unknown',
      flightNumber: s.FlightNumber || null,
      aircraft: s.AircraftName || s.AircraftCode || null,
      durationMinutes: typeof s.Duration === 'number' ? s.Duration : null
    }));

    let layoverDuration: number | null = null;
    if (segments.length > 1) {
      const firstArrival = new Date(segments[0].arrivalAt).getTime();
      const secondDeparture = new Date(segments[1].departureAt).getTime();
      if (!isNaN(firstArrival) && !isNaN(secondDeparture) && secondDeparture > firstArrival) {
        layoverDuration = Math.round((secondDeparture - firstArrival) / 60000);
      }
    }

    const carriers: string[] = trip.Carriers
      ? [...new Set(trip.Carriers.split(',').map((c: string) => c.trim()).filter(Boolean))] as string[]
      : [];

    return {
      duration: typeof trip.TotalDuration === 'number' ? trip.TotalDuration : null,
      stops: typeof trip.Stops === 'number' ? trip.Stops : null,
      layoverAirport: trip.Connections?.[0] || null,
      layoverDuration,
      airlines: carriers.map(resolveAirlineName).filter(Boolean),
      aircraftType: trip.Aircraft?.[0] || null,
      segments
    };
  } catch (err) {
    if ((err as Error).name !== 'AbortError') console.error('Seats.aero trip lookup failed:', (err as Error).message);
    return null;
  }
}

export interface LiveSearchParams {
  originCode?: string;
  destinationCode?: string;
  startDate?: string;
  endDate?: string;
  cabin?: string;
}

async function getTripDetailsById(tripId: string, cabinSlug: string): Promise<Partial<SeatsAeroTripDetails> | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const headers = {
      'Partner-Authorization': apiKey,
      'Accept': 'application/json',
    };
    const tripRes = await fetchWithTimeout(`${SEATS_AERO_API_BASE}/trips/${tripId}`, { headers }, 6000);
    if (!tripRes.ok) return null;

    const tripData = await tripRes.json();
    const trips = tripData?.data || [];
    if (!trips.length) return null;

    const trip = trips.find((t: any) => t.Cabin === cabinSlug) || trips[0];
    const segmentsRaw = trip.AvailabilitySegments || [];

    const segments: SeatsAeroSegment[] = segmentsRaw.map((s: any) => ({
      origin: s.OriginAirport,
      destination: s.DestinationAirport,
      departureAt: s.DepartsAt,
      arrivalAt: s.ArrivesAt,
      airline: resolveAirlineName(s.FlightNumber?.match(/^[A-Z]+/)?.[0] || trip.Carriers) || 'Unknown',
      flightNumber: s.FlightNumber || null,
      aircraft: s.AircraftName || s.AircraftCode || null,
      durationMinutes: typeof s.Duration === 'number' ? s.Duration : null,
    }));

    let layoverDuration: number | null = null;
    if (segments.length > 1) {
      const firstArrival = new Date(segments[0].arrivalAt).getTime();
      const secondDeparture = new Date(segments[1].departureAt).getTime();
      if (!isNaN(firstArrival) && !isNaN(secondDeparture) && secondDeparture > firstArrival) {
        layoverDuration = Math.round((secondDeparture - firstArrival) / 60000);
      }
    }

    const carriers: string[] = trip.Carriers
      ? [...new Set(trip.Carriers.split(',').map((c: string) => c.trim()).filter(Boolean))] as string[]
      : [];

    return {
      duration: typeof trip.TotalDuration === 'number' ? trip.TotalDuration : null,
      stops: typeof trip.Stops === 'number' ? trip.Stops : null,
      layoverAirport: trip.Connections?.[0] || null,
      layoverDuration,
      airlines: carriers.map(resolveAirlineName).filter(Boolean),
      aircraftType: trip.Aircraft?.[0] || null,
      segments,
    };
  } catch (err) {
    return null;
  }
}

export async function searchSeatsAeroLive(params: LiveSearchParams): Promise<any[]> {
  const apiKey = getApiKey();
  if (!apiKey || !params.destinationCode) return [];

  const origins = params.originCode ? [params.originCode] : DEFAULT_US_GATEWAYS;
  const destinations = resolveDestinationAirports(params.destinationCode);

  const startDate = params.startDate || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  let endDate = params.endDate;
  if (!endDate) {
    const end = new Date(startDate);
    end.setDate(end.getDate() + 30);
    endDate = end.toISOString().split('T')[0];
  }

  const searchParams = new URLSearchParams({
    origin_airport: origins.join(','),
    destination_airport: destinations.join(','),
    start_date: startDate,
    end_date: endDate,
    order_by: 'lowest_mileage',
    take: '100',
  });

  if (params.cabin && CABIN_API[params.cabin.toUpperCase()]) {
    searchParams.set('cabins', CABIN_API[params.cabin.toUpperCase()]);
  }

  const headers = {
    'Partner-Authorization': apiKey,
    'Accept': 'application/json',
  };

  try {
    const res = await fetchWithTimeout(`${SEATS_AERO_API_BASE}/search?${searchParams.toString()}`, { headers }, 15000);
    if (!res.ok) {
      console.error('Seats.aero live search failed:', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    const results = data?.data || [];

    const deals: any[] = [];
    for (const result of results) {
      const originCode = result.Route?.OriginAirport;
      const destinationCode = result.Route?.DestinationAirport;
      const departureDate = result.Date;
      if (!originCode || !destinationCode || !departureDate) continue;

      for (const [letter, cabinName] of Object.entries(CABIN_MAP_REVERSE)) {
        const available = result[`${letter}Available`];
        const mileageCost = parseInt(result[`${letter}MileageCost`], 10);
        const airlines = result[`${letter}Airlines`];
        const taxes = (parseFloat(result[`${letter}TotalTaxes`]) || 0) / 100;

        if (!available || !mileageCost || mileageCost <= 0) continue;

        // Use the first airline for this result/cabin to avoid duplicate rows.
        const airlineCode = airlines
          ? airlines.split(',').map((c: string) => c.trim()).filter(Boolean)[0]
          : result.Source || 'Multiple Airlines';

        deals.push({
          id: `live-${result.ID}-${letter}-${airlineCode}`,
          resultId: result.ID,
          originCode,
          destinationCode,
          departureDate: new Date(departureDate),
          returnDate: null,
          cabin: cabinName,
          tripType: 'ONE_WAY',
          pointsRequired: mileageCost,
          taxesAndFees: taxes,
          bookingUrl: `https://www.seats.aero/search?origin=${originCode}&destination=${destinationCode}&date=${departureDate}`,
          airline: resolveAirlineName(airlineCode) || airlineCode,
          duration: null,
          stops: null,
          layoverAirport: null,
          layoverDuration: null,
          aircraftType: null,
          category: roughCategory(cabinName, mileageCost),
          reasoning: 'Live search from seats.aero',
        });
      }
    }

    const sorted = deals.sort((a, b) => a.pointsRequired - b.pointsRequired);

    // When the user didn't specify an origin, diversify by origin city:
    // pick the cheapest deal from each unique origin, then fill remaining slots
    // with the next cheapest across all origins.
    const hasUserOrigin = params.originCode && params.originCode.length > 0;
    let topDeals: any[];

    if (hasUserOrigin) {
      topDeals = sorted.slice(0, 5);
    } else {
      const byOrigin = new Map<string, any[]>();
      for (const d of sorted) {
        const arr = byOrigin.get(d.originCode) || [];
        arr.push(d);
        byOrigin.set(d.originCode, arr);
      }
      topDeals = [];
      // Round-robin: take cheapest from each origin in turn
      const pools = Array.from(byOrigin.values());
      let idx = 0;
      while (topDeals.length < 5 && pools.some((p) => p.length > 0)) {
        const pool = pools[idx % pools.length];
        if (pool.length > 0) topDeals.push(pool.shift()!);
        idx++;
      }
    }

    await Promise.all(
      topDeals.map(async (deal) => {
        const cabinSlug = CABIN_API[deal.cabin] || 'economy';
        const trip = await getTripDetailsById(deal.resultId, cabinSlug);
        if (trip) {
          deal.duration = trip.duration ?? deal.duration;
          deal.stops = trip.stops ?? deal.stops;
          deal.layoverAirport = trip.layoverAirport ?? deal.layoverAirport;
          deal.layoverDuration = trip.layoverDuration ?? deal.layoverDuration;
          deal.aircraftType = trip.aircraftType ?? deal.aircraftType;
        }
      })
    );

    return topDeals;
  } catch (err) {
    console.error('Seats.aero live search error:', err);
    return [];
  }
}
