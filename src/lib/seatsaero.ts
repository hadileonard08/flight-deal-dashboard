import { resolveAirlineName, getAirlineCode } from './airlines';

const SEATS_AERO_API_BASE = 'https://seats.aero/partnerapi';

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
