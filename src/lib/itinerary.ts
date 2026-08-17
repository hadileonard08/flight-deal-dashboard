import {
  formatFlightDetailsSection,
  generateOccasionItinerary,
  getRandomOccasion
} from '@/lib/itinerary-templates';
import { generateHoneymoonItinerary } from '@/agents/graph';
import { searchDestinationNews } from '@/agents/news-search';
import { getWeatherForecast } from '@/agents/weather';
import { getDestinationImageUrl, hydrateItineraryImages } from '@/agents/destination-images';
import { hasAIProvider } from '@/lib/ai-provider';
import { AIRPORT_NAMES } from '@/lib/config';

export async function generateFullItinerary(flight: any): Promise<{ itinerary: string; occasion: string }> {
  const flightDetails = formatFlightDetailsSection(flight);
  const tripStart = new Date(flight.departureDate);
  const tripEnd = flight.returnDate
    ? new Date(flight.returnDate)
    : new Date(tripStart.getTime() + 5 * 24 * 60 * 60 * 1000);

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

  let itineraryText = flightDetails;
  let occasion: string;

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

  return { itinerary: itineraryText, occasion };
}
