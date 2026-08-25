import { getChatModel } from '../lib/ai-provider';
import type { RouteLink } from './itinerary-guardrails';

export interface LegInfo {
  from: string;
  to: string;
  walkMinutes: number | null;
  driveMinutes: number | null;
  distanceKm: number | null;
  recommendedMode: string;
  note: string;
}

export interface DayTransport {
  day: string;
  title: string;
  legs: LegInfo[];
  summary: string;
}

export interface TransportPlan {
  cityTransitTips: string;
  estimatedCosts: string;
  days: DayTransport[];
}

interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

async function geocode(place: string, city: string): Promise<GeocodeResult | null> {
  try {
    const query = encodeURIComponent(`${place}, ${city}`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { 'User-Agent': 'flight-deal-dashboard/1.0 (transport agent)' } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any[];
    if (!data || data.length === 0) return null;
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch {
    return null;
  }
}

async function getOSRMRoute(
  from: GeocodeResult,
  to: GeocodeResult,
  profile: 'walking' | 'driving'
): Promise<{ durationMin: number; distanceKm: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${from.lon},${from.lat};${to.lon},${from.lat}?overview=false`;
    const res = await fetch(url, { headers: { 'User-Agent': 'flight-deal-dashboard/1.0' } });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (!data.routes || data.routes.length === 0) return null;
    const route = data.routes[0];
    return {
      durationMin: Math.round(route.duration / 60),
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
    };
  } catch {
    return null;
  }
}

function recommendMode(walkMin: number | null, driveMin: number | null, distanceKm: number | null): { mode: string; note: string } {
  if (!walkMin && !driveMin) {
    return { mode: 'Transit/Taxi', note: 'Check local transit or ride-share options.' };
  }
  if (walkMin !== null && walkMin <= 15) {
    return { mode: 'Walk', note: `Short ${walkMin}-min walk (${distanceKm}km).` };
  }
  if (walkMin !== null && walkMin <= 25 && (!driveMin || driveMin >= 8)) {
    return { mode: 'Walk', note: `${walkMin}-min walk (${distanceKm}km) — pleasant and faster than traffic.` };
  }
  if (driveMin !== null && driveMin <= 10 && walkMin && walkMin > 25) {
    return { mode: 'Transit/Ride-share', note: `${driveMin}-min drive (${distanceKm}km). Use local transit or ride-share.` };
  }
  if (distanceKm !== null && distanceKm > 5) {
    return { mode: 'Transit/Ride-share', note: `${distanceKm}km — recommend local transit or ride-share.` };
  }
  return {
    mode: 'Transit',
    note: `${walkMin ? `${walkMin}-min walk` : 'Unknown walk'} or ${driveMin ? `${driveMin}-min drive` : 'unknown drive'} — choose based on weather and luggage.`,
  };
}

async function buildDayTransport(
  routeLink: RouteLink,
  destination: string
): Promise<DayTransport> {
  // Extract stops from the Google Maps URL (they're encoded as "place, destination" segments).
  const segments = routeLink.url
    .replace('https://www.google.com/maps/dir/', '')
    .split('/')
    .map((s) => decodeURIComponent(s).replace(`, ${destination}`, '').trim())
    .filter(Boolean);

  const legs: LegInfo[] = [];

  // Geocode all stops in parallel (with a small concurrency limit).
  const geocoded = await Promise.all(
    segments.map((s) => geocode(s, destination))
  );

  // Get OSRM routes between consecutive stops.
  for (let i = 0; i < geocoded.length - 1; i++) {
    const from = geocoded[i];
    const to = geocoded[i + 1];
    const fromName = segments[i];
    const toName = segments[i + 1];

    if (!from || !to) {
      legs.push({
        from: fromName,
        to: toName,
        walkMinutes: null,
        driveMinutes: null,
        distanceKm: null,
        recommendedMode: 'Transit',
        note: 'Route data unavailable — check local transit.',
      });
      continue;
    }

    const [walk, drive] = await Promise.all([
      getOSRMRoute(from, to, 'walking').catch(() => null),
      getOSRMRoute(from, to, 'driving').catch(() => null),
    ]);

    const { mode, note } = recommendMode(
      walk?.durationMin ?? null,
      drive?.durationMin ?? null,
      walk?.distanceKm ?? drive?.distanceKm ?? null
    );

    legs.push({
      from: fromName,
      to: toName,
      walkMinutes: walk?.durationMin ?? null,
      driveMinutes: drive?.durationMin ?? null,
      distanceKm: walk?.distanceKm ?? drive?.distanceKm ?? null,
      recommendedMode: mode,
      note,
    });
  }

  // Build a brief summary.
  const modes = legs.map((l) => l.recommendedMode);
  const walkCount = modes.filter((m) => m === 'Walk').length;
  const transitCount = modes.length - walkCount;
  const summary = legs.length > 0
    ? `${legs.length} legs: ${walkCount} walkable, ${transitCount} need transit/ride-share`
    : 'No route data available';

  return {
    day: routeLink.day,
    title: routeLink.title || '',
    legs,
    summary,
  };
}

async function generateCityTransitTips(
  destination: string,
  dayTransports: DayTransport[]
): Promise<{ tips: string; costs: string }> {
  const llm = getChatModel(0.3);
  if (!llm) return { tips: '', costs: '' };

  const legSummary = dayTransports
    .map((d) => `Day ${d.day}: ${d.summary}`)
    .join('\n');

  const prompt = `You are a local transport expert for ${destination}. Based on the itinerary below, provide practical transport advice.

Daily route summary:
${legSummary}

Provide TWO sections:

1. "Getting Around" — 3-4 short bullet points with the most practical transit tips for ${destination}:
   - What transit pass/card to get and approximate cost
   - Best app for navigation or ride-share
   - Any cultural tips (e.g. don't eat on transit, tap in/out, etc.)
   - When to walk vs. take transit based on the route data

2. "Estimated Transport Costs" — a short table with rough per-person costs:
   | Option | Estimated Cost |
   |--------|---------------|
   Include: day transit pass, single ride, taxi base fare, ride-share typical, and weekly total estimate if relevant.

Keep it concise and practical. Use markdown. Only include real, well-known options for ${destination}.`;

  try {
    const res = await llm.invoke(prompt);
    const content = (res.content as string).trim();
    // Split into the two sections.
    const costIdx = content.search(/#{1,3}\s*Estimated Transport/i);
    if (costIdx > 0) {
      return {
        tips: content.slice(0, costIdx).trim(),
        costs: content.slice(costIdx).trim(),
      };
    }
    return { tips: content, costs: '' };
  } catch {
    return { tips: '', costs: '' };
  }
}

export async function buildTransportPlan(
  routeLinks: RouteLink[],
  destination: string
): Promise<TransportPlan | null> {
  if (!routeLinks || routeLinks.length === 0 || !destination) return null;

  // Build per-day transport info (limit to first 5 days for API rate limits).
  const daysToProcess = routeLinks.slice(0, 5);
  const dayTransports = await Promise.all(
    daysToProcess.map((rl) => buildDayTransport(rl, destination))
  );

  // Generate city-level transit tips and cost estimates.
  const { tips, costs } = await generateCityTransitTips(destination, dayTransports);

  return {
    cityTransitTips: tips,
    estimatedCosts: costs,
    days: dayTransports,
  };
}

function formatLegNote(leg: LegInfo): string {
  const parts: string[] = [];
  if (leg.walkMinutes) parts.push(`${leg.walkMinutes}min walk`);
  if (leg.driveMinutes && leg.walkMinutes && leg.walkMinutes > 25) parts.push(`${leg.driveMinutes}min drive`);
  if (leg.distanceKm) parts.push(`${leg.distanceKm}km`);
  const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `- **${leg.recommendedMode}**: ${leg.from} → ${leg.to}${detail}`;
}

function formatDayNote(day: DayTransport): string {
  if (!day.legs || day.legs.length === 0) return '';
  const lines = day.legs.map(formatLegNote);
  return `\n\n**🚶 Transport (real times via routing):**\n${lines.join('\n')}`;
}

/**
 * Injects real transport notes from the transport agent into each day's
 * section of the itinerary markdown. Finds day headings at any level
 * (## Day 1, ### Day 1, etc.) and appends the transport note at the end
 * of that day's block (before the next day heading).
 */
export function injectTransportNotes(itinerary: string, plan: TransportPlan | null): string {
  if (!plan || !plan.days || plan.days.length === 0) return itinerary;

  // Build a map of day number → formatted note
  const notesByDay = new Map<string, string>();
  for (const day of plan.days) {
    const note = formatDayNote(day);
    if (note) notesByDay.set(day.day, note);
  }

  if (notesByDay.size === 0) return itinerary;

  // Split by day headings at any level, keeping delimiters
  const blocks = itinerary.split(/(?=#+\s+Day\s+\d+)/i);

  const result = blocks.map((block) => {
    const match = block.match(/#+\s+Day\s+(\d+)/i);
    if (!match) return block;
    const dayNum = match[1];
    const note = notesByDay.get(dayNum);
    if (!note) return block;
    // Append the transport note at the end of this day's block
    return block.trimEnd() + note + '\n';
  });

  return result.join('');
}
