import { AIRPORT_NAMES } from '../lib/config';

const WIKIPEDIA_CITIES: Record<string, string> = {
  HND: 'Tokyo',
  NRT: 'Tokyo',
  HKG: 'Hong Kong',
  ICN: 'Seoul',
  SIN: 'Singapore',
  BKK: 'Bangkok',
  TPE: 'Taipei',
  KUL: 'Kuala Lumpur',
  MNL: 'Manila',
  SGN: 'Ho Chi Minh City',
  HAN: 'Hanoi',
  DPS: 'Bali',
  CGK: 'Jakarta'
};

const FLAG_PATTERNS = [
  /flag_of/gi,
  /\/flag\//gi,
  /_flag\./gi,
  /emblem_of/gi,
  /coat_of_arms/gi,
  /_emblem\./gi
];

function isFlagUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  return FLAG_PATTERNS.some(pattern => pattern.test(url));
}

export async function getDestinationImageUrl(destinationCode: string): Promise<string | null> {
  const city = WIKIPEDIA_CITIES[destinationCode] || AIRPORT_NAMES[destinationCode] || destinationCode;
  if (!city) return null;

  // Prefer a cityscape / skyline image over a flag or coat of arms.
  const cityscapeUrl = await getImageForTerm(`${city} skyline`, [`${city} cityscape`, `${city} city`]);
  if (cityscapeUrl && !isFlagUrl(cityscapeUrl)) return cityscapeUrl;

  const cityUrl = await getImageForTerm(city, [`${city} city`, `${city} landmark`]);
  if (cityUrl && !isFlagUrl(cityUrl)) return cityUrl;

  return null;
}

function cleanTerm(term: string): string {
  return term
    .replace(/\[|\]/g, '')
    .replace(/^IMAGE:\s*/i, '')
    .replace(/\b(Night|Market|Temple|Palace|Park|Stream|Village|Tower|District|Garden|Castle|Bridge|Beach|Mountain|Plaza|Square|Street|Walk|Station)\b/gi, '$1')
    .trim();
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

  // Always append the term itself to the fallback list, plus some generic helpful variants.
  const termsToTry = [cleaned];
  if (!cleaned.toLowerCase().includes('landmark')) termsToTry.push(`${cleaned} landmark`);
  if (!cleaned.toLowerCase().includes('city')) termsToTry.push(`${cleaned} city`);
  if (!cleaned.toLowerCase().includes('night')) termsToTry.push(`${cleaned} night`);

  for (const t of [...termsToTry, ...fallbackTerms]) {
    const cleanedT = cleanTerm(t);
    if (!cleanedT) continue;

    // Use Wikimedia Commons search only.
    const commonsUrl = await fetchWikimediaCommonsImage(cleanedT);
    if (commonsUrl && !isFlagUrl(commonsUrl)) return commonsUrl;
  }

  return null;
}

export async function hydrateItineraryImages(
  itinerary: string,
  destinationName: string | null = null
): Promise<string> {
  // Match placeholders the model may emit, optionally with a fabricated URL.
  const placeholderRegex = /!\[IMAGE:\s*([^\]]+)\](?:\([^)]*\))?/g;
  const matches = Array.from(itinerary.matchAll(placeholderRegex));

  if (matches.length === 0) return itinerary;

  const imageUrls = await Promise.all(
    matches.map(async (match) => {
      const term = match[1].trim();
      const fallbackTerms = destinationName && destinationName.toLowerCase() !== cleanTerm(term).toLowerCase()
        ? [`${destinationName} ${term}`, `${term} ${destinationName}`]
        : [];
      const url = await getImageForTerm(term, fallbackTerms);
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
