// Real local events lookup via the Ticketmaster Discovery API
// Free API key, no affiliate program required: https://developer.ticketmaster.com/

export interface LocalEvent {
  name: string;
  date: string;
  venue: string;
  url: string;
  segment: string;
}

// Maps our destination airport codes to the city/country Ticketmaster expects
export const CITY_MAP: Record<string, { city: string; countryCode: string }> = {
  HND: { city: 'Tokyo', countryCode: 'JP' },
  NRT: { city: 'Tokyo', countryCode: 'JP' },
  HKG: { city: 'Hong Kong', countryCode: 'HK' },
  ICN: { city: 'Seoul', countryCode: 'KR' },
  SIN: { city: 'Singapore', countryCode: 'SG' },
  BKK: { city: 'Bangkok', countryCode: 'TH' },
};

export async function getLocalEvents(
  destinationCode: string,
  startDate: Date,
  endDate: Date
): Promise<LocalEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;

  if (!apiKey || apiKey.includes('your_ticketmaster_api_key')) {
    console.log('⚠️ Ticketmaster API key not configured. Get a free key at https://developer.ticketmaster.com/');
    console.log('⚠️ Add TICKETMASTER_API_KEY to .env to include real local events in itineraries');
    return [];
  }

  const location = CITY_MAP[destinationCode];
  if (!location) {
    console.log(`⚠️ No city mapping for destination ${destinationCode}, skipping event lookup`);
    return [];
  }

  if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
    return [];
  }

  try {
    const startStr = startDate.toISOString().split('.')[0] + 'Z';
    const endStr = endDate.toISOString().split('.')[0] + 'Z';

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&city=${encodeURIComponent(location.city)}&countryCode=${location.countryCode}&startDateTime=${startStr}&endDateTime=${endStr}&size=5&sort=date,asc`;

    console.log(`🎫 Looking up real events in ${location.city} for the travel window...`);
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`⚠️ Ticketmaster API returned ${response.status} for ${location.city}`);
      return [];
    }

    const data = await response.json();
    const events = data._embedded?.events || [];

    const mapped: LocalEvent[] = events.map((event: any) => ({
      name: event.name,
      date: event.dates?.start?.localDate || 'TBA',
      venue: event._embedded?.venues?.[0]?.name || location.city,
      url: event.url,
      segment: event.classifications?.[0]?.segment?.name || 'Event'
    }));

    console.log(`✅ Found ${mapped.length} real event(s) in ${location.city} during the trip window`);
    return mapped;

  } catch (error) {
    console.log(`Ticketmaster API failed for ${location.city}:`, error);
    return [];
  }
}
