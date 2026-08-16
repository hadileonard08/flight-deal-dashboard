import { REGIONS } from '../lib/config';
import { resolveAirlineName } from '../lib/airlines';

// Seats.aero Partner API integration for real award availability data
// Docs: https://developers.seats.aero/reference/cached-search
const SEATS_AERO_API_BASE = 'https://seats.aero/partnerapi';

interface FlightDeal {
  originCode: string;
  destinationCode: string;
  airline: string;
  departureDate: Date;
  cabin: string;
  fareType: string;
  tripType: string;
  pointsRequired: number;
  taxesAndFees: number;
  cashPrice?: number;
  bookingUrl?: string;
  isSimulated: boolean;
}

// Maps Seats.aero's single-letter cabin codes to our cabin enum
const CABIN_MAP: Record<string, string> = {
  Y: 'ECONOMY',
  W: 'PREMIUM_ECONOMY',
  J: 'BUSINESS',
  F: 'FIRST'
};

export async function scrapeFlightDeals(): Promise<FlightDeal[]> {
  const apiKey = process.env.SEATS_AERO_API_KEY;

  if (!apiKey || apiKey.includes('your_seats_aero_api_key')) {
    console.log('⚠️ Seats.aero API key not configured. Returning empty array to try web scraping.');
    return [];
  }

  try {
    const deals: FlightDeal[] = [];

    // Target Asian destinations from US gateways
    const asianDestinations = ['HND', 'NRT', 'HKG', 'ICN', 'SIN', 'BKK'];
    const origins = Array.from(new Set(Object.values(REGIONS).flat()));

    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 90);
    const endDateStr = endDate.toISOString().split('T')[0];

    const url = `${SEATS_AERO_API_BASE}/search?origin_airport=${origins.join(',')}&destination_airport=${asianDestinations.join(',')}&start_date=${startDate}&end_date=${endDateStr}&take=500`;

    const response = await fetch(url, {
      headers: {
        'Partner-Authorization': apiKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`❌ Seats.aero API returned ${response.status}: ${await response.text()}`);
      return [];
    }

    const data = await response.json();
    const results = data?.data || [];

    for (const result of results) {
      const originCode = result.Route?.OriginAirport;
      const destinationCode = result.Route?.DestinationAirport;
      const departureDate = result.Date;

      if (!originCode || !destinationCode || !departureDate) continue;

      for (const [letter, cabinName] of Object.entries(CABIN_MAP)) {
        const available = result[`${letter}Available`];
        const mileageCost = parseInt(result[`${letter}MileageCost`], 10);
        const airlines = result[`${letter}Airlines`];
        const taxes = parseFloat(result[`${letter}TotalTaxes`]) || 0;

        if (!available || !mileageCost || mileageCost <= 0) continue;

        const airlineList = airlines
          ? airlines.split(',').map((code: string) => code.trim()).filter(Boolean)
          : [result.Source || 'Multiple Airlines'];

        for (const airlineCode of airlineList) {
          deals.push({
            originCode,
            destinationCode,
            airline: resolveAirlineName(airlineCode),
            departureDate: new Date(departureDate),
            cabin: cabinName,
            fareType: 'POINTS',
            tripType: 'ONE_WAY',
            pointsRequired: mileageCost,
            taxesAndFees: taxes,
            bookingUrl: `https://seats.aero/search?origin=${originCode}&destination=${destinationCode}&date=${departureDate}`,
            isSimulated: false
          });
        }
      }
    }

    console.log(`✅ Scraped ${deals.length} real award deals from Seats.aero`);
    return deals;

  } catch (error) {
    console.error('❌ Error scraping Seats.aero:', error);
    return [];
  }
}
