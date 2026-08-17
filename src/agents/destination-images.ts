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

function cleanTerm(term: string): string {
  return term
    .replace(/\[|\]/g, '')
    .replace(/^IMAGE:\s*/i, '')
    .replace(/\b(Night|Market|Temple|Palace|Park|Stream|Village|Tower|District|Garden|Castle|Bridge|Beach|Mountain|Plaza|Square|Street|Walk|Station)\b/gi, '$1')
    .trim();
}

async function fetchWikipediaImage(term: string): Promise<string | null> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as WikiSummary;
    return data.originalimage?.source || data.thumbnail?.source || null;
  } catch (error) {
    console.log('Wikipedia image lookup failed for', term, ':', (error as Error).message);
    return null;
  }
}

async function fetchWikimediaCommonsImage(term: string): Promise<string | null> {
  try {
    const searchRes = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srnamespace=6&srlimit=3&format=json&origin=*`
    );
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as any;
    const results = searchData?.query?.search || [];

    for (const result of results) {
      const title = result.title;
      const infoRes = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url|thumb|size&iiurlwidth=800&format=json&origin=*`
      );
      if (!infoRes.ok) continue;
      const infoData = (await infoRes.json()) as any;
      const pages = infoData?.query?.pages;
      if (!pages) continue;

      for (const pageId in pages) {
        const imageinfo = pages[pageId]?.imageinfo;
        if (imageinfo && imageinfo.length > 0) {
          return imageinfo[0].thumburl || imageinfo[0].url || null;
        }
      }
    }

    return null;
  } catch (error) {
    console.log('Wikimedia Commons image lookup failed for', term, ':', (error as Error).message);
    return null;
  }
}

export async function getImageForTerm(term: string, fallbackTerms: string[] = []): Promise<string | null> {
  if (!term) return null;

  const cleaned = cleanTerm(term);
  if (!cleaned) return null;

  // Try Wikipedia page summary first (most accurate if a page exists).
  const wikiUrl = await fetchWikipediaImage(cleaned);
  if (wikiUrl) return wikiUrl;

  // Fall back to Wikimedia Commons search for the exact term.
  const commonsUrl = await fetchWikimediaCommonsImage(cleaned);
  if (commonsUrl) return commonsUrl;

  // Try fallback terms (e.g., city name, English translation) one by one.
  for (const fallback of fallbackTerms) {
    const cleanedFallback = cleanTerm(fallback);
    if (!cleanedFallback) continue;

    const fallbackWiki = await fetchWikipediaImage(cleanedFallback);
    if (fallbackWiki) return fallbackWiki;

    const fallbackCommons = await fetchWikimediaCommonsImage(cleanedFallback);
    if (fallbackCommons) return fallbackCommons;
  }

  return null;
}

export async function hydrateItineraryImages(
  itinerary: string,
  destinationName: string | null = null,
  fallbackImageUrl: string | null = null
): Promise<string> {
  // Match placeholders the model may emit, optionally with a fabricated URL.
  const placeholderRegex = /!\[IMAGE:\s*([^\]]+)\](?:\([^)]*\))?/g;
  const matches = Array.from(itinerary.matchAll(placeholderRegex));

  if (matches.length === 0) return itinerary;

  const imageUrls = await Promise.all(
    matches.map(async (match) => {
      const term = match[1].trim();
      const fallbackTerms = destinationName ? [destinationName, `${destinationName} landmark`] : [];
      let url = await getImageForTerm(term, fallbackTerms);
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
