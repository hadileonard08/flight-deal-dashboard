import { AIRPORT_NAMES } from '../lib/config';

const WIKIPEDIA_CITIES: Record<string, string> = {
  HND: 'Tokyo',
  NRT: 'Tokyo',
  HKG: 'Hong Kong',
  ICN: 'Seoul',
  SIN: 'Singapore',
  BKK: 'Bangkok',
};

interface WikiSummary {
  title?: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string; width: number; height: number };
}

export async function getDestinationImageUrl(destinationCode: string): Promise<string | null> {
  const city = WIKIPEDIA_CITIES[destinationCode] || AIRPORT_NAMES[destinationCode] || destinationCode;

  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as WikiSummary;
    return data.originalimage?.source || data.thumbnail?.source || null;
  } catch (error) {
    console.log('Destination image lookup failed:', (error as Error).message);
    return null;
  }
}
