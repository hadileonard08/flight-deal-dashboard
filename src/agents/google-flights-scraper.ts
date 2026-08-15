import { REGIONS } from '../lib/config';

interface FlightDeal {
  originCode: string;
  destinationCode: string;
  airline: string;
  departureDate: Date;
  returnDate: Date;
  cabin: string;
  fareType: string;
  tripType: string;
  cashPrice: number;
  taxesAndFees: number;
  bookingUrl?: string;
  isSimulated: boolean;
}

// Try to scrape real flight data from APIs, fallback to realistic generation
export async function scrapeGoogleFlights(): Promise<FlightDeal[]> {
  const deals: FlightDeal[] = [];
  
  try {
    console.log('🌐 Attempting real flight data from APIs...');
    
    // Try Duffel API first (self-serve flights API, no affiliate program required)
    const duffelDeals = await scrapeDuffelAPI();
    if (duffelDeals.length > 0) {
      console.log(`✅ Found ${duffelDeals.length} real deals from Duffel API`);
      return duffelDeals;
    }
    
    // Try AviationStack as fallback (free tier available, schedules only)
    const aviationDeals = await scrapeAviationStackAPI();
    if (aviationDeals.length > 0) {
      console.log(`✅ Found ${aviationDeals.length} real deals from AviationStack`);
      return aviationDeals;
    }
    
    // Fallback to realistic data generation
    console.log('⚠️ No API data available, using realistic fallback');
    return generateRealisticFlightData();
    
  } catch (error) {
    console.error('❌ Real scraping failed:', error);
    return generateRealisticFlightData();
  }
}

// Scrape Duffel API (self-serve flights API, no affiliate program required)
// Sign up at https://duffel.com - free test mode, live mode requires simple account activation
async function scrapeDuffelAPI(): Promise<FlightDeal[]> {
  const deals: FlightDeal[] = [];
  const apiToken = process.env.DUFFEL_API_TOKEN;
  
  if (!apiToken || apiToken.includes('your_duffel_api_token')) {
    console.log('⚠️ Duffel API token not configured. Get one free at https://duffel.com/');
    console.log('⚠️ Add DUFFEL_API_TOKEN to .env file (duffel_test_... for sandbox, duffel_live_... for real prices)');
    return [];
  }
  
  const isTestToken = apiToken.startsWith('duffel_test_');
  if (isTestToken) {
    console.log('⚠️ Using Duffel TEST token - prices/schedules are simulated by Duffel Airways, not real');
    console.log('⚠️ Activate your Duffel account and use a duffel_live_ token for real airline prices');
  }
  
  try {
    console.log('✈️ Fetching flight data from Duffel API...');
    
    const destinations = ['NRT', 'HND', 'HKG', 'ICN', 'SIN', 'BKK'];
    const origins = ['LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'];
    const today = new Date();
    const departureDate = new Date(today);
    departureDate.setDate(today.getDate() + 45);
    const returnDateBase = new Date(departureDate);
    returnDateBase.setDate(departureDate.getDate() + 10);

    for (const origin of origins) {
      for (const destination of destinations) {
        try {
          const offerRequestResponse = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Duffel-Version': 'v2',
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              data: {
                slices: [
                  { origin, destination, departure_date: departureDate.toISOString().split('T')[0] },
                  { origin: destination, destination: origin, departure_date: returnDateBase.toISOString().split('T')[0] }
                ],
                passengers: [{ type: 'adult' }],
                cabin_class: 'economy'
              }
            })
          });

          if (!offerRequestResponse.ok) {
            console.log(`Duffel API returned ${offerRequestResponse.status} for ${origin}-${destination}`);
            continue;
          }

          const offerData = await offerRequestResponse.json();
          const offers = offerData.data?.offers || [];

          for (const offer of offers.slice(0, 2)) {
            const price = parseFloat(offer.total_amount);
            if (!price || price <= 0) continue;

            const outboundSlice = offer.slices?.[0];
            const inboundSlice = offer.slices?.[1];
            const airlineName = offer.owner?.name || 'Multiple Airlines';
            const outDate = outboundSlice?.segments?.[0]?.departing_at;
            const inDate = inboundSlice?.segments?.[0]?.departing_at;
            const outDateStr = outDate ? new Date(outDate).toISOString().split('T')[0] : departureDate.toISOString().split('T')[0];
            const inDateStr = inDate ? new Date(inDate).toISOString().split('T')[0] : returnDateBase.toISOString().split('T')[0];

            deals.push({
              originCode: origin,
              destinationCode: destination,
              airline: airlineName,
              departureDate: new Date(outDate || departureDate),
              returnDate: new Date(inDate || returnDateBase),
              cabin: 'ECONOMY',
              fareType: 'CASH',
              tripType: 'ROUND_TRIP',
              cashPrice: price,
              taxesAndFees: parseFloat(offer.tax_amount) || 0,
              bookingUrl: `https://www.google.com/travel/flights?q=flights%20from%20${origin}%20to%20${destination}%20on%20${outDateStr}%20on%20${inDateStr}&hl=en&gl=us&trip=round_trip`,
              isSimulated: isTestToken
            });
          }
        } catch (error) {
          console.log(`Duffel API failed for ${origin}-${destination}:`, error);
        }
      }
    }
  } catch (error) {
    console.log('Duffel API failed:', error);
  }

  return deals;
}

// Scrape AviationStack API (free tier available)
async function scrapeAviationStackAPI(): Promise<FlightDeal[]> {
  const deals: FlightDeal[] = [];
  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  
  if (!apiKey || apiKey.includes('your_aviationstack_api_key')) {
    console.log('⚠️ AviationStack API key not configured. Get free key at https://aviationstack.com/');
    console.log('⚠️ Add AVIATIONSTACK_API_KEY to .env file');
    return [];
  }
  
  try {
    console.log('🛫 Fetching real flight data from AviationStack API...');
    
    const destinations = ['HND', 'NRT', 'HKG', 'ICN', 'SIN', 'BKK'];
    const origins = ['LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'];
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(today.getMonth() + 2);

    for (const origin of origins) {
      for (const destination of destinations) {
        try {
          const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&dep_iata=${origin}&arr_iata=${destination}&limit=3`;
          
          const response = await fetch(url);
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.data && Array.isArray(data.data)) {
              for (const flight of data.data) {
                const airline = flight.airline?.name || 'Multiple Airlines';
                const price = Math.floor(Math.random() * 2000) + 500; // AviationStack doesn't provide pricing
                
                deals.push({
                  originCode: origin,
                  destinationCode: destination,
                  airline: airline,
                  departureDate: new Date(flight.departure?.scheduled),
                  returnDate: new Date(flight.arrival?.scheduled),
                  cabin: 'ECONOMY',
                  fareType: 'CASH',
                  tripType: 'ROUND_TRIP',
                  cashPrice: price,
                  taxesAndFees: Math.floor(price * 0.15),
                  bookingUrl: 'https://www.google.com/travel/flights',
                  isSimulated: true // AviationStack provides real schedules but not real pricing
                });
              }
            }
          }
        } catch (error) {
          console.log(`AviationStack API failed for ${origin}-${destination}:`, error);
        }
      }
    }
  } catch (error) {
    console.log('AviationStack API failed:', error);
  }

  return deals;
}

// Generate realistic flight pricing data (fallback)
function generateRealisticFlightData(): FlightDeal[] {
  const deals: FlightDeal[] = [];
  
  console.log('🔍 Generating realistic flight pricing data...');
  
  const destinations = ['HND', 'NRT', 'HKG', 'ICN', 'SIN', 'BKK'];
  const origins = ['LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'];
  const cabinClasses = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'];
  const today = new Date();
  const currentYear = today.getFullYear();
  const nextYear = currentYear + 1;
  const years = [currentYear, nextYear];

  for (const origin of origins) {
    for (const destination of destinations) {
      for (const cabin of cabinClasses) {
        try {
          const basePrice = getRealisticPrice(origin, destination, cabin);
          const airline = getAirlineForRoute(origin, destination);
          
          if (!validateAirlineRoute(origin, destination, airline)) {
            console.log(`⚠️ Skipping invalid route: ${airline} doesn't fly ${origin}-${destination}`);
            continue;
          }
          
          const flightDate = new Date(`${years[Math.floor(Math.random() * years.length)]}-${Math.floor(Math.random() * 12) + 1}-${Math.floor(Math.random() * 28) + 1}`);
          const formattedDate = flightDate.toISOString().split('T')[0];
          
          const returnDate = new Date(flightDate);
          returnDate.setDate(returnDate.getDate() + Math.floor(Math.random() * 7) + 7);
          const formattedReturnDate = returnDate.toISOString().split('T')[0];
          
          console.log(`📡 Generated deal ${origin} → ${destination} (${cabin}): $${basePrice} with ${airline} (round-trip)`);
          
          deals.push({
            originCode: origin,
            destinationCode: destination,
            airline: airline,
            departureDate: flightDate,
            returnDate: returnDate,
            cabin: cabin,
            fareType: 'CASH',
            tripType: 'ROUND_TRIP',
            cashPrice: basePrice,
            taxesAndFees: Math.floor(basePrice * 0.15),
            bookingUrl: `https://www.google.com/travel/flights?q=flights%20from%20${origin}%20to%20${destination}%20on%20${formattedDate}%20on%20${formattedReturnDate}&hl=en&gl=us&trip=round_trip`,
            isSimulated: true
          });
          
        } catch (error) {
          console.log(`Failed to generate deal for ${origin}-${destination}-${cabin}:`, error);
        }
      }
    }
  }

  console.log(`✅ Generated ${deals.length} realistic flight deals`);
  return deals;
}

// Get realistic price based on route and cabin class
function getRealisticPrice(origin: string, destination: string, cabin: string): number {
  const basePriceMap: Record<string, Record<string, number>> = {
    'HND': { 'ECONOMY': 850, 'PREMIUM_ECONOMY': 1500, 'BUSINESS': 2800, 'FIRST': 4800 },
    'NRT': { 'ECONOMY': 800, 'PREMIUM_ECONOMY': 1400, 'BUSINESS': 2600, 'FIRST': 4500 },
    'HKG': { 'ECONOMY': 900, 'PREMIUM_ECONOMY': 1600, 'BUSINESS': 3200, 'FIRST': 5400 },
    'ICN': { 'ECONOMY': 850, 'PREMIUM_ECONOMY': 1550, 'BUSINESS': 3000, 'FIRST': 5100 },
    'SIN': { 'ECONOMY': 950, 'PREMIUM_ECONOMY': 1700, 'BUSINESS': 3400, 'FIRST': 5700 },
    'BKK': { 'ECONOMY': 850, 'PREMIUM_ECONOMY': 1550, 'BUSINESS': 3100, 'FIRST': 5200 }
  };

  const basePrice = basePriceMap[destination]?.[cabin] || 1000;
  const variance = Math.floor(Math.random() * 200) - 100;
  return basePrice + variance;
}

// Validate if airline actually flies the route
function validateAirlineRoute(origin: string, destination: string, airline: string): boolean {
  const validRoutes: Record<string, string[]> = {
    'JAL': ['HND', 'NRT', 'HKG', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'ANA': ['HND', 'NRT', 'HKG', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Singapore Airlines': ['SIN', 'HKG', 'ICN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR', 'HND', 'NRT'],
    'Cathay Pacific': ['HKG', 'HND', 'NRT', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Korean Air': ['ICN', 'HND', 'NRT', 'HKG', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Asiana': ['ICN', 'HND', 'NRT', 'HKG', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Thai Airways': ['BKK', 'HND', 'NRT', 'HKG', 'ICN', 'SIN', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'United': ['HND', 'NRT', 'HKG', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'American': ['HND', 'NRT', 'HKG', 'ICN', 'SIN', 'BKK', 'LAX', 'ORD', 'JFK', 'EWR'],
    'Delta': ['HND', 'NRT', 'HKG', 'ICN', 'SIN', 'BKK', 'SEA', 'JFK', 'EWR'],
    'China Airlines': ['HKG', 'HND', 'NRT', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'EVA Air': ['HKG', 'HND', 'NRT', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Malaysia Airlines': ['HKG', 'HND', 'NRT', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Philippine Airlines': ['HKG', 'HND', 'NRT', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Vietnam Airlines': ['HKG', 'HND', 'NRT', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Air China': ['HKG', 'HND', 'NRT', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'China Eastern': ['HKG', 'HND', 'NRT', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'China Southern': ['HKG', 'HND', 'NRT', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Qatar Airways': ['HKG', 'HND', 'NRT', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Emirates': ['HKG', 'HND', 'NRT', 'ICN', 'SIN', 'BKK', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'British Airways': ['HKG', 'HND', 'NRT', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Lufthansa': ['HKG', 'HND', 'NRT', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR'],
    'Qantas': ['SIN', 'HKG', 'HND', 'NRT', 'LAX', 'SFO', 'SEA', 'ORD', 'JFK', 'EWR']
  };
  
  const validDestinations = validRoutes[airline] || [];
  return validDestinations.includes(destination) && validDestinations.includes(origin);
}

// Get realistic airline for route with validation
function getAirlineForRoute(origin: string, destination: string): string {
  const routeMap: Record<string, string[]> = {
    'HND': ['JAL', 'ANA', 'United', 'American', 'Delta', 'Cathay Pacific', 'Singapore Airlines', 'Thai Airways', 'Korean Air', 'Asiana', 'China Airlines', 'EVA Air', 'Malaysia Airlines', 'Philippine Airlines', 'Vietnam Airlines', 'Air China', 'China Eastern', 'China Southern'],
    'NRT': ['JAL', 'ANA', 'Delta', 'United', 'American', 'Cathay Pacific', 'Singapore Airlines', 'Thai Airways', 'Korean Air', 'Asiana', 'China Airlines', 'EVA Air', 'Malaysia Airlines', 'Philippine Airlines', 'Vietnam Airlines', 'Air China', 'China Eastern', 'China Southern', 'Qatar Airways', 'Emirates'],
    'HKG': ['Cathay Pacific', 'United', 'American', 'Delta', 'JAL', 'ANA', 'Singapore Airlines', 'Thai Airways', 'Korean Air', 'Asiana', 'China Airlines', 'EVA Air', 'Malaysia Airlines', 'Philippine Airlines', 'Vietnam Airlines', 'Air China', 'China Eastern', 'China Southern', 'Qatar Airways', 'Emirates', 'British Airways', 'Lufthansa'],
    'ICN': ['Korean Air', 'Asiana', 'Delta', 'United', 'American', 'JAL', 'ANA', 'Cathay Pacific', 'Singapore Airlines', 'Thai Airways', 'China Airlines', 'EVA Air', 'Malaysia Airlines', 'Philippine Airlines', 'Vietnam Airlines', 'Air China', 'China Eastern', 'China Southern', 'Qatar Airways', 'Emirates'],
    'SIN': ['Singapore Airlines', 'United', 'American', 'Delta', 'JAL', 'ANA', 'Cathay Pacific', 'Thai Airways', 'Korean Air', 'Asiana', 'China Airlines', 'EVA Air', 'Malaysia Airlines', 'Philippine Airlines', 'Vietnam Airlines', 'Air China', 'China Eastern', 'China Southern', 'Qatar Airways', 'Emirates', 'British Airways', 'Lufthansa', 'Qantas'],
    'BKK': ['Thai Airways', 'United', 'American', 'Delta', 'JAL', 'ANA', 'Cathay Pacific', 'Singapore Airlines', 'Korean Air', 'Asiana', 'China Airlines', 'EVA Air', 'Malaysia Airlines', 'Philippine Airlines', 'Vietnam Airlines', 'Air China', 'China Eastern', 'China Southern', 'Qatar Airways', 'Emirates', 'British Airways', 'Lufthansa']
  };

  const airlines = routeMap[destination] || ['United', 'American', 'Delta', 'JAL', 'ANA', 'Cathay Pacific'];
  return airlines[Math.floor(Math.random() * airlines.length)];
}
