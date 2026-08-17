import { db } from '../db';
import { flights, deals } from '../db/schema';
import { evaluateThreshold, getRegion, AIRPORT_NAMES } from '../lib/config';
import { generateHoneymoonItinerary } from './graph';
import { searchDestinationNews } from './news-search';
import { getWeatherForecast } from './weather';
import { getDestinationImageUrl, hydrateItineraryImages } from './destination-images';
import { hasAIProvider, getChatModel } from '../lib/ai-provider';
import { prefetchCashPrices } from './cash-price';

import { formatFlightDetailsSection, formatNewsSection, generateOccasionItinerary, getRandomOccasion } from '../lib/itinerary-templates';

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function processFlights(rawFlights: any[]) {
  console.log(`Processing ${rawFlights.length} flights...`);

  // Prefetch live cash prices from Google Flights for every unique route/cabin/date.
  // This lets the CPP calculation use real market cash instead of static estimates.
  const cashRoutes = rawFlights.map(f => ({
    origin: f.originCode,
    destination: f.destinationCode,
    cabin: f.cabin,
    date: f.departureDate instanceof Date ? f.departureDate.toISOString().split('T')[0] : String(f.departureDate).slice(0, 10)
  }));
  await prefetchCashPrices(cashRoutes, 8);

  // Bring back the full agentic workflow, but cap the most expensive calls
  // so 3 months of data doesn't run away on time/cost.
  // - AI reasoning for the first 250 GOOD/MAYBE deals.
  // - Full news/weather/LangGraph itinerary for the first 50 GOOD deals.
  // - All GOOD deals still get a deterministic flight summary + fallback plan.
  const MAX_AI_REASONING = 250;
  const MAX_AI_ITINERARY = 0;
  let aiReasoningCount = 0;
  let aiItineraryCount = 0;

  const defaultReasoning: Record<string, string> = {
    GOOD_DEAL: "Great deal found with excellent value for this route.",
    MAYBE_GOOD_DEAL: "Solid deal that's close to great value for this route.",
    OKAY_DEAL: "Reasonably priced for this route - not exceptional, but a fair option.",
    BAD_DEAL: "Priced well above typical rates for this route - consider other dates or cabins."
  };

  const flightsToInsert: any[] = [];
  const dealValues: any[] = [];

  for (const flight of rawFlights) {
    const category = evaluateThreshold(flight);
    if (flightsToInsert.length % 100 === 0) {
      console.log(`  ... ${flightsToInsert.length}/${rawFlights.length} categorized (${category})`);
    }

    let reasoning = defaultReasoning[category] || defaultReasoning.OKAY_DEAL;

    // 1. AI rationale for the first 250 GOOD/MAYBE
    if (hasAIProvider && (category === 'GOOD_DEAL' || category === 'MAYBE_GOOD_DEAL') && aiReasoningCount < MAX_AI_REASONING) {
      aiReasoningCount++;
      try {
        const model = getChatModel(0.7)!;
        const res = await model.invoke(
          `Output strictly JSON with no markdown code fences: {"reasoning": "2-sentence punchy rationale why this deal is good."}\n\nFlight: ${JSON.stringify(flight)}`
        );
        const rawText = (res.content as string).trim().replace(/^```(?:json)?\n?/, '').replace(/```$/, '');
        reasoning = JSON.parse(rawText).reasoning;
      } catch (error) {
        console.log('Using fallback reasoning due to API error');
      }
    }

    // 2 & 3. Full agentic itinerary for the first 50 GOOD
    let itineraryText = null;
    let occasion: any = null;

    if (category === 'GOOD_DEAL') {
      const flightDetails = formatFlightDetailsSection(flight);
      itineraryText = flightDetails;

      if (aiItineraryCount < MAX_AI_ITINERARY) {
        aiItineraryCount++;
        const tripStart = new Date(flight.departureDate);
        const tripEnd = flight.returnDate ? new Date(flight.returnDate) : new Date(tripStart.getTime() + 5 * 24 * 60 * 60 * 1000);

        let destinationNews: string | null = null;
        try {
          destinationNews = await searchDestinationNews(flight.destinationCode, tripStart, tripEnd);
        } catch (error) {
          console.log('News search failed, continuing without destination news');
        }

        let weatherForecast: string | null = null;
        try {
          weatherForecast = await getWeatherForecast(flight.destinationCode, tripStart, tripEnd);
        } catch (error) {
          console.log('Weather lookup failed, continuing without forecast');
        }

        try {
          if (hasAIProvider) {
            itineraryText = await generateHoneymoonItinerary(flight, destinationNews, weatherForecast);
            occasion = 'HONEYMOON';
          } else {
            occasion = getRandomOccasion();
            itineraryText = generateOccasionItinerary(flight, occasion, destinationNews, weatherForecast);
          }
        } catch (error) {
          console.log('Using fallback itinerary due to API error');
          occasion = 'LEISURE';
          itineraryText = generateOccasionItinerary(flight, 'LEISURE', destinationNews, weatherForecast);
        }

        let destinationImage: string | null = null;
        try {
          destinationImage = await getDestinationImageUrl(flight.destinationCode);
        } catch (error) {
          console.log('Destination image lookup failed, continuing without image');
        }

        const imageMarkdown = destinationImage
          ? `![${AIRPORT_NAMES[flight.destinationCode] || flight.destinationCode}](${destinationImage})\n\n`
          : '';

        itineraryText = flightDetails + imageMarkdown + itineraryText;

        try {
          itineraryText = await hydrateItineraryImages(itineraryText, destinationImage);
        } catch (error) {
          console.log('Itinerary image hydration failed, keeping placeholders');
        }
      } else {
        // All other GOOD deals get a deterministic fallback plan
        occasion = getRandomOccasion();
        itineraryText = flightDetails + '\n\n' + generateOccasionItinerary(flight, occasion, null, null);
      }
    }

    flightsToInsert.push({
      originCode: flight.originCode,
      originRegion: getRegion(flight.originCode),
      destinationCode: flight.destinationCode,
      airline: flight.airline,
      departureDate: flight.departureDate,
      returnDate: flight.returnDate,
      cabin: flight.cabin,
      fareType: flight.fareType,
      tripType: flight.tripType || 'ROUND_TRIP',
      cashPrice: flight.cashPrice,
      pointsRequired: flight.pointsRequired,
      taxesAndFees: flight.taxesAndFees,
      bookingUrl: flight.bookingUrl,
      isSimulated: flight.isSimulated !== false,
      cashAirline: flight.cashAirline ?? null,
      duration: flight.duration ?? null,
      stops: flight.stops ?? null,
      layoverAirport: flight.layoverAirport ?? null,
      layoverDuration: flight.layoverDuration ?? null
    });

    dealValues.push({
      category: category as any,
      reasoning,
      itinerary: itineraryText,
      occasion: (occasion || 'LEISURE') as any
    });
  }

  console.log(`✅ Categorized ${flightsToInsert.length} flights; inserting in batches...`);

  const insertedIds: number[] = [];
  for (const chunk of chunkArray(flightsToInsert, 1000)) {
    const inserted = await db.insert(flights).values(chunk as any).returning({ id: flights.id });
    insertedIds.push(...inserted.map((row: any) => row.id));
  }

  for (let i = 0; i < dealValues.length; i++) {
    dealValues[i].flightId = insertedIds[i];
  }

  for (const chunk of chunkArray(dealValues, 1000)) {
    await db.insert(deals).values(chunk as any);
  }

  console.log(`✅ Pipeline finished: ${insertedIds.length} flights and ${dealValues.length} deals saved.`);
}

