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

  // Strip generic suffixes and try the shorter name (e.g. "Senso-ji Temple" -> "Senso-ji").
  const stripped = base.replace(/\s+(Temple|Palace|Garden|Park|Castle|National Garden|National Park|Shrine)$/i, '').trim();
  if (stripped && stripped !== base) {
    variants.push(stripped);
  }

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

export async function getImageForTerm(term: string, fallbackTerms: string[] = []): Promise<string | null> {
  if (!term) return null;

  const cleaned = cleanTerm(term);
  if (!cleaned) return null;

  const termsToTry = expandImageTerm(cleaned);

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

  // Cache a generic destination image as a fallback for any day without a match.
  const defaultImage = destinationName ? await getImageForTerm(destinationName) : null;

  const imageUrls = await Promise.all(
    matches.map(async (match) => {
      const term = match[1].trim();
      const fallbackTerms = destinationName && destinationName.toLowerCase() !== cleanTerm(term).toLowerCase()
        ? [`${destinationName} ${term}`, `${term} ${destinationName}`]
        : [];
      let url = await getImageForTerm(term, fallbackTerms);
      if (!url && defaultImage) {
        url = defaultImage;
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
