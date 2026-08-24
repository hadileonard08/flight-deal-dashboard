const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

function extractLandmarkNames(itinerary: string): string[] {
  const matches = Array.from(itinerary.matchAll(/!\[IMAGE:\s*([^\]]+)\]/g));
  const names = matches.map((m) => m[1].trim()).filter(Boolean);
  return [...new Set(names)];
}

async function wikipediaSearchExists(term: string): Promise<boolean> {
  try {
    const headers = { 'User-Agent': 'flight-deal-dashboard/1.0 (itinerary guardrails)' };
    const res = await fetch(
      `${WIKIPEDIA_API}?action=opensearch&search=${encodeURIComponent(term)}&limit=1&namespace=0&format=json&origin=*`,
      { headers }
    );
    if (!res.ok) return true; // Fail open if Wikipedia is down.
    const data = (await res.json()) as [string, string[], string[], string[]];
    const results = data[1] || [];
    return results.length > 0;
  } catch (error) {
    console.error('Wikipedia guardrail check failed for', term, ':', (error as Error).message);
    return true; // Fail open.
  }
}

export async function verifyItineraryLandmarks(itinerary: string, destination?: string): Promise<string[]> {
  const landmarks = extractLandmarkNames(itinerary);
  if (landmarks.length === 0) return [];

  const unverified: string[] = [];
  await Promise.all(
    landmarks.map(async (name) => {
      const exists = await wikipediaSearchExists(name);
      if (!exists) unverified.push(name);
    })
  );

  return unverified;
}
