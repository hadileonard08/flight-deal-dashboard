import { getChatModel, hasAIProvider } from '../lib/ai-provider';

export interface LogisticsInput {
  originCode: string;
  destinationCode: string;
  airline: string;
  cabin: string;
  duration: number | null;
  stops: number | null;
  layoverAirport: string | null;
  layoverDuration: number | null;
  aircraftType: string | null;
  segments: string | null; // JSON string of Segment[]
  departureDate: string;
}

interface Segment {
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  airline: string;
  aircraft?: string | null;
  flightNumber?: string | null;
  durationMinutes: number;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export async function getLogisticsCheck(input: LogisticsInput): Promise<string> {
  if (!hasAIProvider) {
    return 'AI provider is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY to generate a logistics check.';
  }

  const model = getChatModel(0.4);
  if (!model) {
    return 'Unable to load an AI model for the logistics check.';
  }

  let parsedSegments: Segment[] = [];
  try {
    if (input.segments) parsedSegments = JSON.parse(input.segments);
  } catch {
    parsedSegments = [];
  }

  const segmentLines = parsedSegments.length
    ? parsedSegments
        .map(
          (s, i) =>
            `  - Leg ${i + 1}: ${s.origin} → ${s.destination} on ${s.airline}${
              s.flightNumber ? ` flight ${s.flightNumber}` : ''
            } (aircraft: ${s.aircraft || 'unknown'}, departs ${s.departureAt}, arrives ${s.arrivalAt}, ${formatDuration(
              s.durationMinutes
            )})`
        )
        .join('\n')
    : '  - Detailed segment data is not available for this deal.';

  const prompt = `You are a travel-suitability critic. Review the following flight routing and produce a concise Markdown assessment. Flag real problems; do not invent premium perks or partner airlines that are not in the data.

Flight summary:
- Route: ${input.originCode} → ${input.destinationCode}
- Airline: ${input.airline}
- Cabin: ${input.cabin}
- Total duration: ${input.duration ? formatDuration(input.duration) : 'unknown'}
- Stops: ${input.stops ?? 'unknown'}
- Layover airport: ${input.layoverAirport ?? 'none'}
- Layover duration: ${input.layoverDuration ? formatDuration(input.layoverDuration) : 'none'}
- Representative aircraft type: ${input.aircraftType ?? 'unknown (based on cash search)'}
- Departure date: ${input.departureDate}

Detailed segments:
${segmentLines}

Write three short sections:

1. **Connection Analysis** — Evaluate each layover. Flag if a connection is tight (under ~75 minutes for domestic, ~90 for international), very long (6+ hours), overnight, or risky for checked baggage. Mention terminal changes only if you can infer them from the airports.
2. **Product Quality Check** — Evaluate the cabin and aircraft. If business or first, warn if the aircraft is known to have an outdated premium product (e.g., angle-flat vs lie-flat) for this airline/route. If you do not know the aircraft type, say so and give general guidance.
3. **Overall Verdict** — One sentence: who this routing is good for and who should avoid it.

Be honest, concise, and do not hallucinate specific flight numbers, terminals, or amenities that are not in the data. Under 250 words.`;

  try {
    const res = await model.invoke(prompt);
    return typeof res.content === 'string' ? res.content : 'No logistics check generated.';
  } catch (error) {
    console.log('Logistics check generation failed:', (error as Error).message);
    return 'We could not generate a logistics check right now. Try again in a moment.';
  }
}
