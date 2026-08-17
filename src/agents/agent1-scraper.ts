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
    endDate.setDate(today.getDate() + 365); // up to 1 year out
    const endDateStr = endDate.toISOString().split('T')[0];

    const baseParams = `origin_airport=${origins.join(',')}&destination_airport=${asianDestinations.join(',')}&start_date=${startDate}&end_date=${endDateStr}&order_by=lowest_mileage`;
    const take = 5000;
    const maxTotal = 12000;

    let cursor: number | undefined;
    let skip = 0;
    let hasMore = true;
    const seenIds = new Set<string>();

    while (hasMore && skip < maxTotal) {
      let url = `${SEATS_AERO_API_BASE}/search?${baseParams}&take=${take}&skip=${skip}`;
      if (cursor !== undefined) {
        url += `&cursor=${cursor}`;
      }

      console.log(`🌐 Fetching Seats.aero page: skip=${skip}, take=${take}`);
      const response = await fetch(url, {
        headers: {
          'Partner-Authorization': apiKey,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.log(`❌ Seats.aero API returned ${response.status}: ${await response.text()}`);
        break;
      }

      const data = await response.json();
      const results = data?.data || [];

      if (results.length === 0) {
        hasMore = false;
        break;
      }

      for (const result of results) {
        if (seenIds.has(result.ID)) continue;
        seenIds.add(result.ID);

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

      skip += results.length;
      hasMore = data?.hasMore ?? false;
      cursor = data?.cursor ?? cursor;
      console.log(`✅ Fetched ${results.length} results, total ${deals.length} deals, hasMore=${hasMore}`);
    }

    console.log(`✅ Scraped ${deals.length} real award deals from Seats.aero`);
    return deals;

  } catch (error) {
    console.error('❌ Error scraping Seats.aero:', error);
    return [];
  }
}
