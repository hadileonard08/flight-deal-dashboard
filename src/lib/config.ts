export const REGIONS = {
  WEST_COAST: ['LAX', 'SFO', 'SEA', 'SAN'],
  CENTRAL: ['ORD', 'DFW', 'DEN', 'MSP', 'MDW'],
  EAST_COAST: ['JFK', 'EWR', 'IAD', 'ATL', 'MIA']
};

// Human-readable city/airport names for the route summary shown on GOOD_DEAL itineraries.
export const AIRPORT_NAMES: Record<string, string> = {
  LAX: 'Los Angeles',
  SFO: 'San Francisco',
  SEA: 'Seattle',
  SAN: 'San Diego',
  ORD: 'Chicago',
  DFW: 'Dallas',
  DEN: 'Denver',
  MSP: 'Minneapolis',
  MDW: 'Chicago (Midway)',
  JFK: 'New York (JFK)',
  EWR: 'Newark',
  IAD: 'Washington, D.C. (Dulles)',
  ATL: 'Atlanta',
  MIA: 'Miami',
  HND: 'Tokyo Haneda',
  NRT: 'Tokyo Narita',
  HKG: 'Hong Kong',
  ICN: 'Seoul Incheon',
  SIN: 'Singapore',
  BKK: 'Bangkok',
};

export function getRegion(airportCode: string) {
  if (REGIONS.WEST_COAST.includes(airportCode)) return 'WEST_COAST';
  if (REGIONS.CENTRAL.includes(airportCode)) return 'CENTRAL';
  return 'EAST_COAST';
}

// Rough one-way retail cash value estimates by destination + cabin, used only to
// estimate cents-per-point (CPP) value for award redemptions. These are ballpark
// figures, not live pricing - CPP is a heuristic, not an exact valuation.
const ONE_WAY_CASH_ESTIMATE: Record<string, Record<string, number>> = {
  // Base one-way cash estimates per destination and cabin. These are intentionally
  // conservative West-Coast floors; origin region multipliers are applied below.
  HND: { ECONOMY: 650, PREMIUM_ECONOMY: 1100, BUSINESS: 2200, FIRST: 4000 },
  NRT: { ECONOMY: 630, PREMIUM_ECONOMY: 1050, BUSINESS: 2100, FIRST: 3800 },
  HKG: { ECONOMY: 700, PREMIUM_ECONOMY: 1200, BUSINESS: 2400, FIRST: 4200 },
  ICN: { ECONOMY: 650, PREMIUM_ECONOMY: 1100, BUSINESS: 2100, FIRST: 4000 },
  SIN: { ECONOMY: 750, PREMIUM_ECONOMY: 1250, BUSINESS: 2500, FIRST: 4500 },
  BKK: { ECONOMY: 700, PREMIUM_ECONOMY: 1150, BUSINESS: 2300, FIRST: 4200 },
};

const REGION_MULTIPLIER: Record<string, number> = {
  WEST_COAST: 1.0,
  CENTRAL: 1.15,
  EAST_COAST: 1.3,
};

function estimateOneWayCashValue(originCode: string, destinationCode: string, cabin: string): number | null {
  const cabinMap = ONE_WAY_CASH_ESTIMATE[destinationCode];
  if (!cabinMap) return null;
  const base = cabinMap[cabin] ?? cabinMap['ECONOMY'];
  const region = getRegion(originCode);
  return Math.round(base * (REGION_MULTIPLIER[region] ?? 1.0));
}

// Get the best available cash value for a redemption: live Duffel/Travelpayouts price
// for the deal's airline (or the cheapest alternative), or the static estimate table as fallback.
export function getEstimatedCashValue(flight: any): number | null {
  const { getLiveCashPrice } = require('../agents/cash-price');
  const dateStr = flight.departureDate instanceof Date
    ? flight.departureDate.toISOString().split('T')[0]
    : String(flight.departureDate).slice(0, 10);
  const liveCash = getLiveCashPrice(flight.originCode, flight.destinationCode, flight.cabin, dateStr, flight.airline);

  return liveCash ?? estimateOneWayCashValue(flight.originCode, flight.destinationCode, flight.cabin);
}

// Cents-per-point (CPP) value of a redemption using the canonical formula:
// CPP = (Cash Price - Taxes & Fees) / Points Required × 100.
// 2.0¢+ is the standard "good value" benchmark used by the points & miles community.
export function calculateCPP(flight: any): number | null {
  if (!flight.pointsRequired || flight.pointsRequired <= 0) return null;

  const estimatedCashValue = getEstimatedCashValue(flight);
  if (!estimatedCashValue) return null;

  const netValue = estimatedCashValue - (flight.taxesAndFees || 0);
  return (netValue / flight.pointsRequired) * 100;
}

export function evaluateThreshold(flight: any) {
  const region = getRegion(flight.originCode);
  const isWest = region === 'WEST_COAST';

  if (flight.fareType === 'POINTS') {
    // Store the estimated cash value and representative flight details so the UI can
    // show "why this is a good deal" math and duration/stops in the modal.
    const estimatedCashValue = getEstimatedCashValue(flight);
    if (estimatedCashValue && !flight.cashPrice) {
      flight.cashPrice = estimatedCashValue;
    }

    const dateStr = flight.departureDate instanceof Date
      ? flight.departureDate.toISOString().split('T')[0]
      : String(flight.departureDate).slice(0, 10);
    const { getFlightDetails } = require('../agents/cash-price');
    const details = getFlightDetails(flight.originCode, flight.destinationCode, flight.cabin, dateStr, flight.airline);
    if (details) {
      if (!flight.duration) flight.duration = details.duration;
      if (typeof flight.stops !== 'number') flight.stops = details.stops;
      if (details.layoverAirport && !flight.layoverAirport) flight.layoverAirport = details.layoverAirport;
      if (details.layoverDuration && !flight.layoverDuration) flight.layoverDuration = details.layoverDuration;
      if (details.airlines?.length && !flight.cashAirline) flight.cashAirline = details.airlines.join(', ');
      if (details.aircraftType && !flight.aircraftType) flight.aircraftType = details.aircraftType;
      if (details.segments?.length && !flight.segments) flight.segments = JSON.stringify(details.segments);
    }

    // If live sources returned no details, build a high-level summary from the route.
    // This ensures the modal and logistics check always have at least a single segment.
    if (estimatedCashValue && (!details || !details.segments?.length)) {
      if (typeof flight.stops !== 'number') flight.stops = 0;
      if (!flight.layoverAirport) flight.layoverAirport = null;
      if (!flight.layoverDuration) flight.layoverDuration = null;
      if (!flight.aircraftType) flight.aircraftType = null;
      if (!flight.cashAirline) flight.cashAirline = 'Estimate (no live airline match)';
      if (!flight.segments) {
        const segment = {
          origin: flight.originCode,
          destination: flight.destinationCode,
          departureAt: `${dateStr}T00:00:00.000Z`,
          arrivalAt: `${dateStr}T00:00:00.000Z`,
          airline: flight.airline,
          aircraft: null,
          flightNumber: null,
          durationMinutes: 0
        };
        flight.segments = JSON.stringify([segment]);
      }
    }

    const cpp = calculateCPP(flight);

    // Primary guardrail: value the redemption in cents-per-point.
    if (cpp !== null) {
      if (cpp >= 2.0) return 'GOOD_DEAL';
      if (cpp >= 1.5) return 'MAYBE_GOOD_DEAL';
      if (cpp >= 1.0) return 'OKAY_DEAL';
      return 'BAD_DEAL';
    }

    // Fallback for destinations without a cash-value estimate: raw points thresholds.
    const pointsThresholds: Record<string, { west: number, central: number, east: number }> = {
      'ECONOMY': { west: 20000, central: 25000, east: 25000 },
      'PREMIUM_ECONOMY': { west: 35000, central: 40000, east: 40000 },
      'BUSINESS': { west: 50000, central: 60000, east: 60000 },
      'FIRST': { west: 80000, central: 90000, east: 90000 }
    };
    const cabinThresholds = pointsThresholds[flight.cabin] || pointsThresholds['BUSINESS'];
    const threshold = isWest ? cabinThresholds.west : (region === 'CENTRAL' ? cabinThresholds.central : cabinThresholds.east);

    if (flight.pointsRequired <= threshold) return 'GOOD_DEAL';
    if (flight.pointsRequired <= threshold + 15000) return 'MAYBE_GOOD_DEAL';
    if (flight.pointsRequired <= threshold + 35000) return 'OKAY_DEAL';
    return 'BAD_DEAL';
  }

  // Define pricing thresholds based on cabin class and region (realistic pricing)
  const thresholds: Record<string, { west: number, central: number, east: number }> = {
    'ECONOMY': { west: 700, central: 800, east: 900 },
    'PREMIUM_ECONOMY': { west: 1200, central: 1300, east: 1400 },
    'BUSINESS': { west: 2500, central: 2800, east: 3000 },
    'FIRST': { west: 4500, central: 5000, east: 5500 }
  };

  const cabinThresholds = thresholds[flight.cabin] || thresholds['ECONOMY'];
  const threshold = isWest ? cabinThresholds.west : (region === 'CENTRAL' ? cabinThresholds.central : cabinThresholds.east);

  if (flight.cashPrice <= threshold) return 'GOOD_DEAL';
  if (flight.cashPrice <= threshold + 600) return 'MAYBE_GOOD_DEAL';
  if (flight.cashPrice <= threshold + 1500) return 'OKAY_DEAL';

  return 'BAD_DEAL';
}
