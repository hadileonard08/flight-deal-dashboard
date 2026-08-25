import { AIRPORT_NAMES } from '../lib/airports';

const WIKIPEDIA_CITIES: Record<string, string> = {
  // Asia
  HND: 'Tokyo',
  NRT: 'Tokyo',
  KIX: 'Osaka',
  HKG: 'Hong Kong',
  ICN: 'Seoul',
  SIN: 'Singapore',
  BKK: 'Bangkok',
  CNX: 'Chiang Mai',
  TPE: 'Taipei',
  KUL: 'Kuala Lumpur',
  MNL: 'Manila',
  SGN: 'Ho Chi Minh City',
  HAN: 'Hanoi',
  DPS: 'Bali',
  CGK: 'Jakarta',
  BOM: 'Mumbai',
  DEL: 'New Delhi',
  PUS: 'Busan',
  // Europe
  LHR: 'London',
  LGW: 'London',
  CDG: 'Paris',
  ORY: 'Paris',
  FRA: 'Frankfurt',
  AMS: 'Amsterdam',
  MAD: 'Madrid',
  BCN: 'Barcelona',
  FCO: 'Rome',
  MXP: 'Milan',
  MUC: 'Munich',
  ZRH: 'Zurich',
  GVA: 'Geneva',
  VIE: 'Vienna',
  DUB: 'Dublin',
  LIS: 'Lisbon',
  ATH: 'Athens',
  PRG: 'Prague',
  WAW: 'Warsaw',
  CPH: 'Copenhagen',
  ARN: 'Stockholm',
  OSL: 'Oslo',
  HEL: 'Helsinki',
  IST: 'Istanbul',
  // Middle East
  DXB: 'Dubai',
  AUH: 'Abu Dhabi',
  DOH: 'Doha',
  TLV: 'Tel Aviv',
  // Latin America
  MEX: 'Mexico City',
  CUN: 'Cancun',
  BOG: 'Bogota',
  LIM: 'Lima',
  SCL: 'Santiago',
  EZE: 'Buenos Aires',
  GRU: 'Sao Paulo',
  GIG: 'Rio de Janeiro',
  // Oceania
  SYD: 'Sydney',
  MEL: 'Melbourne',
  BNE: 'Brisbane',
  AKL: 'Auckland',
  NAN: 'Nadi',
  // Africa
  JNB: 'Johannesburg',
  CPT: 'Cape Town',
  NBO: 'Nairobi',
  CMN: 'Casablanca',
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

export async function getDestinationImageUrl(destinationCode: string, destinationName?: string): Promise<string | null> {
  const city = WIKIPEDIA_CITIES[destinationCode] || AIRPORT_NAMES[destinationCode] || destinationName || destinationCode;
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
    .trim();
}

function scoreImageRelevance(title: string, term: string): number {
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ');
  const titleWords = normalize(title).split(/\s+/).filter(Boolean);
  const termWords = normalize(term).split(/\s+/).filter(w => w.length > 2);
  if (termWords.length === 0) return 0;
  let matches = 0;
  for (const word of termWords) {
    if (titleWords.some(t => t.includes(word) || word.includes(t) || t.replace(/s$/, '') === word.replace(/s$/, ''))) matches++;
  }
  return matches / termWords.length;
}

function expandImageTerm(term: string): string[] {
  const variants: string[] = [];
  const base = term.trim();
  if (!base) return variants;

  variants.push(base);

  if (!base.toLowerCase().includes('landmark')) variants.push(`${base} landmark`);
  if (!base.toLowerCase().includes('city')) variants.push(`${base} city`);

  // Add variations for places that may be called different things
  if (!base.toLowerCase().endsWith('station')) variants.push(`${base} station`);
  if (!base.toLowerCase().endsWith('street')) variants.push(`${base} street`);
  if (!base.toLowerCase().endsWith('district')) variants.push(`${base} district`);
  if (!base.toLowerCase().endsWith('market')) variants.push(`${base} market`);
  if (!base.toLowerCase().endsWith('park')) variants.push(`${base} park`);
  if (!base.toLowerCase().endsWith('temple')) variants.push(`${base} temple`);

  // Strip generic suffixes and try the shorter name (e.g. "Senso-ji Temple" -> "Senso-ji").
  const stripped = base.replace(/\s+(Temple|Palace|Garden|Park|Castle|National Garden|National Park|Shrine|Station|Street|Market|District|Building)$/i, '').trim();
  if (stripped && stripped !== base) {
    variants.push(stripped);
  }

  // Also add photo/building variants
  variants.push(`${base} photo`);
  variants.push(`${base} building`);

  return [...new Set(variants)];
}

async function fetchWikimediaCommonsImage(term: string): Promise<string | null> {
  try {
    const headers = { 'User-Agent': 'flight-deal-dashboard/1.0 (image lookup)' };
    const searchRes = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|thumb|size&iiurlwidth=800&format=json&origin=*`,
      { headers }
    );
    if (!searchRes.ok) return null;
    const data = (await searchRes.json()) as any;
    const pages = data?.query?.pages;
    if (!pages) return null;

    const candidates: { url: string; title: string; score: number }[] = [];

    for (const pageId in pages) {
      const page = pages[pageId];
      const imageinfo = page?.imageinfo;
      const title = page?.title;
      if (imageinfo && imageinfo.length > 0) {
        const url = imageinfo[0].thumburl || imageinfo[0].url;
        if (url && !isFlagUrl(url)) {
          candidates.push({ url, title, score: scoreImageRelevance(title, term) });
        }
      }
    }

    if (candidates.length === 0) return null;

    // Prefer the image whose filename/title most closely matches the search term.
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].url;
  } catch (error) {
    console.log('Wikimedia Commons image lookup failed for', term, ':', (error as Error).message);
    return null;
  }
}

// Fallback: use Wikipedia article API to find the lead image for a landmark.
// This works better for non-English landmark names because Wikipedia articles
// have redirects from localized names.
async function fetchWikipediaArticleImage(term: string): Promise<string | null> {
  try {
    const headers = { 'User-Agent': 'flight-deal-dashboard/1.0 (image lookup)' };
    // Search for the Wikipedia article
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrlimit=3&prop=pageimages&piprop=thumbnail&pithumbsize=800&format=json&origin=*`,
      { headers }
    );
    if (!searchRes.ok) return null;
    const data = (await searchRes.json()) as any;
    const pages = data?.query?.pages;
    if (!pages) return null;

    for (const pageId in pages) {
      const page = pages[pageId];
      const thumb = page?.thumbnail?.source;
      if (thumb && !isFlagUrl(thumb)) return thumb;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getImageForTerm(term: string, fallbackTerms: string[] = []): Promise<string | null> {
  if (!term) return null;

  const cleaned = cleanTerm(term);
  if (!cleaned) return null;

  const termsToTry = expandImageTerm(cleaned);

  for (const t of [...termsToTry, ...fallbackTerms]) {
    const cleanedT = cleanTerm(t);
    if (!cleanedT) continue;

    // Try Wikimedia Commons first.
    const commonsUrl = await fetchWikimediaCommonsImage(cleanedT);
    if (commonsUrl && !isFlagUrl(commonsUrl)) return commonsUrl;

    // Fallback: Wikipedia article lead image (better for non-English landmark names).
    const wikiUrl = await fetchWikipediaArticleImage(cleanedT);
    if (wikiUrl && !isFlagUrl(wikiUrl)) return wikiUrl;
  }

  return null;
}

/**
 * Ensures every day heading in the itinerary has an image placeholder.
 * If the LLM forgot to include ![IMAGE: ...] for some days, this function
 * inserts one using the first bold landmark name found in that day's block.
 * If no bold landmark is found, uses the destination name as a fallback.
 */
function ensureImagePlaceholders(itinerary: string, destinationName: string | null): string {
  // Split by day headings at any level, keeping delimiters.
  const blocks = itinerary.split(/(?=#+\s+Day\s+\d+)/i);

  const result = blocks.map((block) => {
    // Check if this block is a day section
    const headingMatch = block.match(/(#+\s+Day\s+\d+[^\n]*)/i);
    if (!headingMatch) return block;

    // Check if there's already an image placeholder in this block
    if (/!\[IMAGE:/i.test(block)) return block;

    // Find the first bold landmark in this block (excluding the heading itself)
    const linesAfterHeading = block.slice(headingMatch[0].length);
    const boldMatch = linesAfterHeading.match(/\*\*([^*]+)\*\*/);
    const landmark = boldMatch ? boldMatch[1].trim() : (destinationName || 'Landmark');

    // Insert the placeholder right after the heading line
    const headingEnd = block.indexOf(headingMatch[0]) + headingMatch[0].length;
    return block.slice(0, headingEnd) + `\n\n![IMAGE: ${landmark}]` + block.slice(headingEnd);
  });

  return result.join('');
}

export async function hydrateItineraryImages(
  itinerary: string,
  destinationName: string | null = null
): Promise<string> {
  // First, ensure every day has an image placeholder. If the LLM forgot to
  // include one for some days, insert one using the first bold landmark.
  const itineraryWithPlaceholders = ensureImagePlaceholders(itinerary, destinationName);

  // Match placeholders the model may emit, optionally with a fabricated URL.
  const placeholderRegex = /!\[IMAGE:\s*([^\]]+)\](?:\([^)]*\))?/g;
  const matches = Array.from(itineraryWithPlaceholders.matchAll(placeholderRegex));

  if (matches.length === 0) return itinerary;

  // Track used URLs to prevent duplicate images across days.
  const usedUrls = new Set<string>();

  // Pre-fetch a destination image as final fallback for any day whose
  // landmark image can't be found. Every day must have an image.
  let destinationImageUrl: string | null = null;
  if (destinationName) {
    destinationImageUrl = await getDestinationImageUrl(destinationName);
  }

  const imageResults = await Promise.all(
    matches.map(async (match) => {
      const term = match[1].trim();
      const cleanedTerm = cleanTerm(term);
      const fallbackTerms: string[] = [];

      if (destinationName) {
        const dest = destinationName;
        const destLower = dest.toLowerCase();
        const termLower = cleanedTerm.toLowerCase();

        // Don't add destination as fallback if the term IS the destination.
        if (destLower !== termLower) {
          fallbackTerms.push(
            `${dest} ${term}`,
            `${term} ${dest}`,
            `${dest} ${term} landmark`,
            `${dest} ${term} photo`,
            `${term} building ${dest}`,
            `${term} ${dest} night`,
            `${term} ${dest} skyline`,
            `${dest} ${term} street`,
          );
        }
      }

      let url = await getImageForTerm(term, fallbackTerms);

      // If this URL was already used for another landmark, try to find an alternative.
      if (url && usedUrls.has(url)) {
        const altTerms = [
          destinationName ? `${destinationName} ${term} photo` : '',
          destinationName ? `${destinationName} ${term} night` : '',
          `${term} building`,
          `${term} photo`,
          `${term} landmark`,
          destinationName ? `${destinationName} ${term} street` : '',
          destinationName ? `${destinationName} ${term} district` : '',
        ].filter((t): t is string => Boolean(t));
        const uniqueAltTerms = altTerms.filter(t => !fallbackTerms.includes(t));
        const altUrl = await getImageForTerm(term, [...fallbackTerms, ...uniqueAltTerms]);
        if (altUrl && !usedUrls.has(altUrl)) {
          url = altUrl;
        }
      }

      // Last resort: use the destination image if we couldn't find a landmark image,
      // but only if it hasn't been used yet. Better to show the destination image
      // than no image at all.
      if (!url && destinationImageUrl && !usedUrls.has(destinationImageUrl)) {
        url = destinationImageUrl;
      }

      if (url) usedUrls.add(url);
      return { match: match[0], term, url };
    })
  );

  return imageResults.reduce((acc, { match, term, url }) => {
    if (url) {
      return acc.replace(match, `![${term}](${url})`);
    }
    // Keep a visible placeholder text if absolutely no image can be found.
    // Better than a blank gap.
    return acc.replace(match, `*${term}*`);
  }, itinerary);
}
