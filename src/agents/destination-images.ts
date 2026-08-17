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
  return getImageForTerm(city);
}

export async function getImageForTerm(term: string): Promise<string | null> {
  if (!term) return null;

  const cleanTerm = term
    .replace(/\[|\]/g, '')
    .replace(/^IMAGE:\s*/i, '')
    .trim();

  if (!cleanTerm) return null;

  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTerm)}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as WikiSummary;
    return data.originalimage?.source || data.thumbnail?.source || null;
  } catch (error) {
    console.log('Image lookup failed for', cleanTerm, ':', (error as Error).message);
    return null;
  }
}

export async function hydrateItineraryImages(itinerary: string, fallbackImageUrl: string | null = null): Promise<string> {
  // Match placeholders the model may emit, optionally with a fabricated URL.
  const placeholderRegex = /!\[IMAGE:\s*([^\]]+)\](?:\([^)]*\))?/g;
  const matches = Array.from(itinerary.matchAll(placeholderRegex));

  if (matches.length === 0) return itinerary;

  const imageUrls = await Promise.all(
    matches.map(async (match) => {
      const term = match[1].trim();
      let url = await getImageForTerm(term);
      if (!url && fallbackImageUrl) {
        url = fallbackImageUrl;
      }
      return { match: match[0], term, url };
    })
  );

  return imageUrls.reduce((acc, { match, term, url }) => {
    if (url) {
      return acc.replace(match, `![${term}](${url})`);
    }
    return acc.replace(match, '');
  }, itinerary);
}
