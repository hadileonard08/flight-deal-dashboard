import { CITY_MAP } from './event-scraper';

// Uses Gemini's built-in Google Search grounding tool to look up real, current
// news/happenings for a destination city around the trip dates. This is a live
// web search performed by Google on Gemini's behalf - not a fabricated summary.
// Docs: https://ai.google.dev/gemini-api/docs/google-search

function formatDateForPrompt(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export async function searchDestinationNews(
  destinationCode: string,
  tripStart: Date,
  tripEnd: Date
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.includes('your_gemini_api_key')) {
    console.log('⚠️ GEMINI_API_KEY not configured, skipping live news search for itinerary');
    return null;
  }

  const location = CITY_MAP[destinationCode];
  if (!location) {
    console.log(`⚠️ No city mapping for destination ${destinationCode}, skipping news search`);
    return null;
  }

  if (!tripStart || !tripEnd || isNaN(tripStart.getTime()) || isNaN(tripEnd.getTime())) {
    return null;
  }

  const prompt = `Search the web for real, current news relevant to a traveler visiting ${location.city} between ${formatDateForPrompt(tripStart)} and ${formatDateForPrompt(tripEnd)}.
Look specifically for: notable festivals or seasonal happenings, major public holidays or closures, weather advisories, safety/travel advisories, transit disruptions, and any newsworthy events during that window.
Respond with a concise markdown bullet list (max 6 bullets) of only what you actually find via search, each with a one-line summary. If you find nothing relevant, respond with exactly: NO_RELEVANT_NEWS`;

  try {
    console.log(`📰 Searching the web for current news/happenings in ${location.city}...`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }]
        })
      }
    );

    if (!response.ok) {
      console.log(`⚠️ Gemini search grounding returned ${response.status} for ${location.city}`);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    const trimmed = text.trim();

    if (!trimmed || trimmed.includes('NO_RELEVANT_NEWS')) {
      console.log(`✅ No notable current news found for ${location.city} during the trip window`);
      return null;
    }

    console.log(`✅ Found current news/happenings for ${location.city}`);
    return trimmed;

  } catch (error) {
    console.log(`Gemini search grounding failed for ${location.city}:`, error);
    return null;
  }
}
