import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { getChatModel, getQualityModel, getReasoningModel } from '../lib/ai-provider';
import { getWeatherForecast } from './weather';
import { searchDestinationNews } from './news-search';
import { getDestinationImageUrl, hydrateItineraryImages } from './destination-images';
import { verifyItineraryLandmarks, buildRouteLinks } from './itinerary-guardrails';
import { buildTransportPlan, injectTransportNotes } from './transport';
import { db } from '../db';
import { flights, deals } from '../db/schema';
import { eq, gte, lte, inArray, and } from 'drizzle-orm';
import * as chrono from 'chrono-node';
import { searchSeatsAeroLive } from '../lib/seatsaero';
import { getAirlineBookingUrl } from '../lib/airline-booking';
import type {
  ExtractedEntities,
  ClarifyingQuestion,
  PersistedMessage,
  RouteLink,
} from '../lib/chat-state';

const llm = getChatModel(0.4);
const qualityLlm = getQualityModel(0.4);

const COMPANION_PERSONA = `You are Jalan, a friendly travel companion. You are warm, curious, and helpful — like a friend who loves planning trips. Use a conversational tone, ask one or two follow-up questions when needed, and avoid sounding robotic or overly formal. Keep responses concise but useful.`;

const DEFAULT_TRIP_DAYS = 5;
const MAX_TRIP_DAYS = 30; // Guardrail: cap itineraries at 30 days

const ConversationStateAnnotation = Annotation.Root({
  userMessage: Annotation<string>({ reducer: (_curr, next) => next, default: () => '' }),
  history: Annotation<PersistedMessage[]>({ reducer: (_curr, next) => next, default: () => [] }),
  entities: Annotation<ExtractedEntities>({ reducer: (_curr, next) => next, default: () => ({}) }),
  missingFields: Annotation<string[]>({ reducer: (_curr, next) => next, default: () => [] }),
  questions: Annotation<ClarifyingQuestion[]>({ reducer: (_curr, next) => next, default: () => [] }),
  weather: Annotation<any | null>({ reducer: (_curr, next) => next, default: () => null }),
  news: Annotation<string | null>({ reducer: (_curr, next) => next, default: () => null }),
  deals: Annotation<any[]>({ reducer: (_curr, next) => next, default: () => [] }),
  images: Annotation<Record<string, string>>({ reducer: (_curr, next) => next, default: () => ({}) }),
  itinerary: Annotation<string>({ reducer: (_curr, next) => next, default: () => '' }),
  routeLinks: Annotation<RouteLink[]>({ reducer: (_curr, next) => next, default: () => [] }),
  transportPlan: Annotation<any | null>({ reducer: (_curr, next) => next, default: () => null }),
  packingTips: Annotation<string>({ reducer: (_curr, next) => next, default: () => '' }),
  criticFeedback: Annotation<string[]>({ reducer: (_curr, next) => next, default: () => [] }),
  isApproved: Annotation<boolean>({ reducer: (_curr, next) => next, default: () => false }),
  revisionCount: Annotation<number>({ reducer: (_curr, next) => next, default: () => 0 }),
  finalResponse: Annotation<string>({ reducer: (_curr, next) => next, default: () => '' }),
});

const REQUIRED_FIELDS = ['destination', 'startDate'];

async function parseJsonResponse(raw: string) {
  const text = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/```$/, '');
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(text.replace(/\n/g, ' '));
    } catch {
      return null;
    }
  }
}

async function extractNode(state: typeof ConversationStateAnnotation.State) {
  if (!llm) throw new Error('AI provider not configured');

  const historyText = state.history
    .slice(-10)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const prompt = `${COMPANION_PERSONA}

You are also a detail extractor. Read the conversation and figure out the user's intent and trip details.

Instructions:
- Use the conversation history for context. If the user is answering a previous clarifying question, combine it with earlier messages.
- Required: destination, and either a specific startDate OR a general/relative date expression (e.g. "October", "in two weeks", "flexible", "2 week trip").
- If the user only gives a duration ("2 week trip") or a rough window without an exact date, set durationDays and datesGeneral, and leave startDate null.
- If the user says "flexible" or similar, set datesGeneral to "flexible" and leave startDate null.
- Do not mark startDate as missing if datesGeneral or durationDays is provided.
- intent values:
  - plan_trip: user wants an itinerary or help planning a trip (e.g. "Plan a trip to Tokyo", "I want to go to Seoul for 2 weeks")
  - ask_question: user is asking a specific question OR looking for deals without a full itinerary (e.g. "When is the best time to visit Japan?", "find any deal to Tokyo in December", "show me cheap flights to Bangkok", "what's the weather like?")
  - refine: user wants to change something about an earlier plan
  - greeting: user just said hi or similar
  - vague: user's message is too vague to act on — no destination, no dates, no clear question (e.g. "I want to travel", "help me", "trips", "something fun")

Optional fields: origin, endDate, cabin (ECONOMY | PREMIUM_ECONOMY | BUSINESS | FIRST), travelers, budget, interests.

The "interests" field should capture any specific themes, activities, or preferences the user mentioned — e.g. "football", "food and nightlife", "art museums", "hiking and nature", "anime and gaming", "history and architecture", "shopping". This is free-form text, not an enum. If the user didn't mention any specific interests, leave it null.

Respond ONLY in JSON:
{
  "entities": {
    "destination": "city or country",
    "destinationCode": "IATA city code if known",
    "origin": "home city",
    "originCode": "IATA city code if known",
    "startDate": "YYYY-MM-DD or null",
    "endDate": "YYYY-MM-DD or null",
    "datesGeneral": "e.g. November 2025, in two weeks, flexible, or null",
    "durationDays": 14,
    "cabin": "ECONOMY or null",
    "travelers": 2,
    "budget": "string or null",
    "interests": "football, stadium tours" or null,
    "intent": "plan_trip | ask_question | refine | greeting"
  },
  "missingFields": ["field1", "field2"]
}

History:
${historyText}

User: ${state.userMessage}
`;

  const res = await llm.invoke(prompt);
  const parsed = await parseJsonResponse(res.content as string);
  const entities: ExtractedEntities = parsed?.entities || {};
  const missingFields: string[] = (parsed?.missingFields || []).filter((f: string) =>
    REQUIRED_FIELDS.includes(f)
  );

  // If only a general/relative date was provided, try to resolve it
  if (entities.datesGeneral && !entities.startDate) {
    const parsed = parseGeneralDate(entities.datesGeneral, entities.durationDays);
    if (parsed.startDate) entities.startDate = parsed.startDate;
    if (parsed.endDate) entities.endDate = parsed.endDate;
    if (parsed.durationDays) entities.durationDays = parsed.durationDays;
  }

  // Try parsing the raw user message for dates/duration as a fallback
  if (!entities.startDate) {
    const parsed = parseGeneralDate(state.userMessage, entities.durationDays);
    if (parsed.startDate) entities.startDate = parsed.startDate;
    if (parsed.endDate) entities.endDate = parsed.endDate;
    if (parsed.durationDays && !entities.durationDays) entities.durationDays = parsed.durationDays;
  }

  // If user mentioned duration (e.g. "2 week trip") but no endDate, compute it
  if (entities.durationDays && entities.startDate && !entities.endDate) {
    const start = new Date(entities.startDate);
    const end = new Date(start.getTime() + entities.durationDays * 24 * 60 * 60 * 1000);
    entities.endDate = end.toISOString().split('T')[0];
  }

  // Guardrail: cap trip duration at MAX_TRIP_DAYS (30 days).
  // Prevents absurd requests like "2 years" from generating 730 days.
  if (entities.durationDays && entities.durationDays > MAX_TRIP_DAYS) {
    entities.durationDays = MAX_TRIP_DAYS;
    if (entities.startDate) {
      const start = new Date(entities.startDate);
      const end = new Date(start.getTime() + (MAX_TRIP_DAYS - 1) * 24 * 60 * 60 * 1000);
      entities.endDate = end.toISOString().split('T')[0];
    }
  }
  // Also cap if startDate + endDate span more than MAX_TRIP_DAYS
  if (entities.startDate && entities.endDate) {
    const start = new Date(entities.startDate);
    const end = new Date(entities.endDate);
    const spanDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (spanDays > MAX_TRIP_DAYS) {
      const cappedEnd = new Date(start.getTime() + (MAX_TRIP_DAYS - 1) * 24 * 60 * 60 * 1000);
      entities.endDate = cappedEnd.toISOString().split('T')[0];
      if (!entities.durationDays) entities.durationDays = MAX_TRIP_DAYS;
    }
  }

  // For trip planning requests, default to a flexible date soon if the user didn't specify one.
  // For question/deal lookups, leave the date missing so the agent asks for it.
  if (
    entities.destination &&
    !entities.startDate &&
    (entities.intent === 'plan_trip' || entities.intent === 'refine')
  ) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 60);
    entities.startDate = fallback.toISOString().split('T')[0];
    entities.datesGeneral = entities.datesGeneral || 'flexible';
    if (entities.durationDays) {
      const end = new Date(fallback.getTime() + entities.durationDays * 24 * 60 * 60 * 1000);
      entities.endDate = end.toISOString().split('T')[0];
    }
  }

  const stillMissing = REQUIRED_FIELDS.filter(
    (f) => !entities[f as keyof ExtractedEntities]
  );

  return { entities, missingFields: stillMissing.length ? stillMissing : missingFields };
}

function parseGeneralDate(general: string, durationDays?: number): { startDate?: string; endDate?: string; durationDays?: number } {
  const results = chrono.parse(general, new Date(), { forwardDate: true });
  if (results && results.length > 0) {
    const start = results[0].start.date();
    const duration = durationDays || inferDurationDays(general);
    const end = duration
      ? new Date(start.getTime() + duration * 24 * 60 * 60 * 1000)
      : undefined;
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end ? end.toISOString().split('T')[0] : undefined,
      durationDays: duration,
    };
  }

  // Fallback for month/year like "October 2026"
  const now = new Date();
  const match = general.match(/(\w+)\s*(\d{4})?/i);
  if (match) {
    const monthNames = [
      'january','february','march','april','may','june',
      'july','august','september','october','november','december'
    ];
    const month = monthNames.findIndex((m) => m === match[1].toLowerCase());
    if (month !== -1) {
      const year = parseInt(match[2] || String(now.getFullYear()), 10);
      const start = new Date(year, month, 15);
      const duration = durationDays || inferDurationDays(general) || 7;
      const end = new Date(start.getTime() + duration * 24 * 60 * 60 * 1000);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        durationDays: duration,
      };
    }
  }

  return {};
}

function inferDurationDays(text: string): number | undefined {
  const match = text.match(/(\d+)\s*(week|day|month)s?\s*(trip|long|duration)?/i);
  if (!match) return undefined;
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === 'week') return amount * 7;
  if (unit === 'day') return amount;
  if (unit === 'month') return amount * 30;
  return undefined;
}

async function clarifyNode(state: typeof ConversationStateAnnotation.State) {
  if (!llm) throw new Error('AI provider not configured');

  const isVague = state.entities.intent === 'vague';
  const missing = state.missingFields.slice(0, 3);

  let prompt: string;
  if (isVague) {
    prompt = `${COMPANION_PERSONA}

The user said something vague — no clear destination, dates, or question. Be warm and curious. Ask a friendly follow-up to learn what kind of trip they're dreaming about. Give a few concrete examples to spark ideas (e.g. a beach weekend, a foodie city break, an adventure trip). Keep it short, conversational, and enthusiastic — like a friend who loves planning trips.

User's message: "${state.userMessage}"

Respond ONLY in plain text (no JSON, no markdown headers).`;
  } else {
    prompt = `${COMPANION_PERSONA}

The user is planning a trip but we are missing: ${missing.join(', ')}.
Ask ONE short, conversational clarifying question to get the missing info. Suggest a few example answers inline. Keep it friendly and brief. Do not list numbered questions.

Respond ONLY in plain text (no JSON, no markdown headers).`;
  }

  const res = await llm.invoke(prompt);
  const finalResponse = (res.content as string).trim() || 'I need a bit more info to plan your trip.';
  return { questions: [], finalResponse };
}

function routeAfterExtract(state: typeof ConversationStateAnnotation.State) {
  if (state.entities.intent === 'greeting') return 'respond';
  if (state.entities.intent === 'vague') return 'clarify';
  if (state.entities.intent === 'ask_question') {
    if (state.missingFields.length > 0) return 'clarify';
    return 'answer';
  }
  if (state.entities.intent === 'refine' && state.entities.destination) return 'gather';
  if (state.missingFields.length > 0) return 'clarify';
  return 'gather';
}

async function gatherNode(state: typeof ConversationStateAnnotation.State) {
  if (!llm) throw new Error('AI provider not configured');

  const destination = state.entities.destination || '';
  const destinationCode = state.entities.destinationCode || destination;
  const originCode = state.entities.originCode || '';
  let startDate = state.entities.startDate ? new Date(state.entities.startDate) : undefined;
  let endDate = state.entities.endDate ? new Date(state.entities.endDate) : undefined;
  if (startDate && !endDate) {
    // Use durationDays if provided, otherwise default to 5 days
    const tripDays = state.entities.durationDays && state.entities.durationDays > 0
      ? state.entities.durationDays
      : DEFAULT_TRIP_DAYS;
    endDate = new Date(startDate.getTime() + (tripDays - 1) * 24 * 60 * 60 * 1000);
    state.entities.endDate = endDate.toISOString().split('T')[0];
  }
  const cabin = state.entities.cabin || 'ECONOMY';
  const travelers = state.entities.travelers || 1;

  const [weatherResult, newsResult, imageResult, dealsResult] = await Promise.all([
    getWeatherData(destinationCode, startDate, endDate, destination),
    startDate
      ? searchDestinationNews(destinationCode, startDate, endDate || startDate, destination, state.entities.interests || undefined).catch(() => null)
      : Promise.resolve(null),
    getDestinationImageUrl(destinationCode, destination).catch(() => null),
    getRelevantDeals(state.entities),
  ]);

  const subState = {
    ...state,
    weather: weatherResult,
    news: newsResult,
    deals: dealsResult,
    images: { destination: imageResult || '' },
  };

  const [itinerary, packingTips] = await Promise.all([
    generateItinerary(subState),
    generatePackingTips(subState),
  ]);

  const routeLinks = destination ? buildRouteLinks(itinerary, destination) : [];

  // Build the transport plan from the extracted route links.
  const transportPlan = routeLinks.length > 0
    ? await buildTransportPlan(routeLinks, destination).catch(() => null)
    : null;

  // Inject real transport times into each day's itinerary section.
  const itineraryWithTransport = transportPlan
    ? injectTransportNotes(itinerary, transportPlan)
    : itinerary;

  return {
    weather: weatherResult,
    news: newsResult,
    deals: dealsResult,
    images: { destination: imageResult || '' },
    itinerary: itineraryWithTransport,
    routeLinks,
    transportPlan,
    packingTips,
  };
}

async function getWeatherData(
  destinationCode: string,
  startDate?: Date,
  endDate?: Date,
  destinationName?: string
): Promise<any> {
  if (!startDate) return null;
  const end = endDate || new Date(startDate.getTime() + 4 * 24 * 60 * 60 * 1000);
  try {
    return await getWeatherForecast(destinationCode, startDate, end, destinationName);
  } catch {
    return null;
  }
}

async function getRelevantDeals(entities: ExtractedEntities) {
  const originCode = entities.originCode;
  const destinationCode = entities.destinationCode;
  const startDate = entities.startDate;
  const endDate = entities.endDate || entities.startDate;
  const cabin = entities.cabin;

  if (!destinationCode) return [];

  const conditions = [
    eq(flights.destinationCode, destinationCode),
    inArray(deals.category, ['GOOD_DEAL', 'MAYBE_GOOD_DEAL', 'OKAY_DEAL']),
  ];

  if (originCode) conditions.push(eq(flights.originCode, originCode));
  if (startDate) conditions.push(gte(flights.departureDate, new Date(startDate)));
  if (endDate) conditions.push(lte(flights.departureDate, new Date(endDate)));
  if (cabin) conditions.push(eq(flights.cabin, cabin));

  const rows = await db
    .select({
      id: flights.id,
      originCode: flights.originCode,
      destinationCode: flights.destinationCode,
      departureDate: flights.departureDate,
      returnDate: flights.returnDate,
      cabin: flights.cabin,
      tripType: flights.tripType,
      pointsRequired: flights.pointsRequired,
      taxesAndFees: flights.taxesAndFees,
      bookingUrl: flights.bookingUrl,
      airline: flights.airline,
      duration: flights.duration,
      stops: flights.stops,
      layoverAirport: flights.layoverAirport,
      layoverDuration: flights.layoverDuration,
      aircraftType: flights.aircraftType,
      category: deals.category,
      reasoning: deals.reasoning,
    })
    .from(flights)
    .innerJoin(deals, eq(deals.flightId, flights.id))
    .where(and(...conditions))
    .orderBy(deals.category, flights.pointsRequired)
    .limit(50);

  if (rows.length > 0) {
    if (originCode) {
      // User specified origin — just return top 5 cheapest
      return rows.slice(0, 5);
    }
    // No origin specified — diversify by origin city: pick cheapest from each
    const byOrigin = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byOrigin.get(r.originCode) || [];
      arr.push(r);
      byOrigin.set(r.originCode, arr);
    }
    const diversified: typeof rows = [];
    const pools = Array.from(byOrigin.values());
    let idx = 0;
    while (diversified.length < 5 && pools.some((p) => p.length > 0)) {
      const pool = pools[idx % pools.length];
      if (pool.length > 0) diversified.push(pool.shift()!);
      idx++;
    }
    return diversified;
  }

  // Fallback to live Seats.aero search if no cached deals match.
  return searchSeatsAeroLive({
    originCode,
    destinationCode,
    startDate,
    endDate,
    cabin,
  });
}

async function generateItinerary(state: typeof ConversationStateAnnotation.State) {
  const destination = state.entities.destination || '';
  const startDate = state.entities.startDate;
  const endDate = state.entities.endDate;
  const cabin = state.entities.cabin || 'ECONOMY';
  const travelers = state.entities.travelers || 1;
  const weather = state.weather || 'Not available';
  const news = state.news || 'No recent news found.';
  const feedback = state.criticFeedback.join('\n') || 'None';

  let numDays = DEFAULT_TRIP_DAYS;
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    numDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  } else if (state.entities.durationDays && state.entities.durationDays > 0) {
    numDays = state.entities.durationDays;
  }

  // Final safety cap: never generate more than MAX_TRIP_DAYS days
  if (numDays > MAX_TRIP_DAYS) numDays = MAX_TRIP_DAYS;

  const dateContext = startDate
    ? `Trip dates: ${startDate}${endDate ? ` to ${endDate}` : ''} (${numDays} days)`
    : `Trip window: ${state.entities.datesGeneral || 'upcoming'} (${numDays} days)`;

  const prompt = `${COMPANION_PERSONA}

You are helping plan a trip. Write an enthusiastic, practical ${
    cabin === 'BUSINESS' || cabin === 'FIRST' ? 'luxury' : 'budget-friendly'
  } itinerary for ${travelers} traveler(s) going to ${destination}.
${dateContext}
Flight cabin: ${cabin}

${state.entities.interests ? `The user is specifically interested in: ${state.entities.interests}. Tailor the itinerary around these interests — prioritize relevant attractions, activities, and venues. Still include a few iconic must-sees, but make the interest-themed activities the centerpiece.` : ''}

${state.userMessage ? `User's original request: "${state.userMessage}"` : ''}

Weather forecast or climate note:
${typeof weather === 'string' ? weather : JSON.stringify(weather)}

Recent destination news/happenings:
${news}

Critic feedback to address:
${feedback}

${feedback.includes('image placeholder') ? '⚠️ CRITICAL: The previous version was missing image placeholders. You MUST include ![IMAGE: landmark name] after EVERY day heading. This is non-negotiable.' : ''}

Requirements:
- Start with a brief, friendly intro sentence (1-2 lines) before the itinerary.
- Plan EXACTLY ${numDays} days. Do not add or skip days.${numDays >= MAX_TRIP_DAYS ? ' (Note: the trip was capped at 30 days — mention this naturally in the intro if the user asked for longer.)' : ''}
- MANDATORY: For EACH day, you MUST include exactly one image placeholder immediately after the day heading, in this exact format: ![IMAGE: specific landmark name]. No URLs. This is required for every single day — do not skip any day. Pick iconic, specific places (e.g. "Notre-Dame Cathedral", "Sagrada Familia", "Senso-ji Temple"), not generic city names. Always use the ENGLISH name of the landmark (e.g. "Helsinki Cathedral" not "Helsingin Tuomiokirkko", "Church of the Rock" not "Temppeliaukio Kirkko").
- Bold every landmark, neighborhood, or major stop you mention in the day plan (e.g. **Louvre Museum**, **Montmartre**, **Eiffel Tower**). This is used to generate walking/transit maps.
- Do not claim upgrades, partner airlines, or premium in-flight services unless cabin is BUSINESS/FIRST.
- Do not invent traveler names.
- Keep the tone warm, like a friend sharing recommendations.
- CRITICAL: Only include real, well-known attractions, restaurants, and transit options. Do not invent names, places, closed venues, transit lines, schedules, or booking details. If you are unsure about a specific place, replace it with a clearly real alternative. For sports venues, use real stadium names (e.g. "Emirates Stadium", "Stamford Bridge", "Wembley Stadium", "Old Trafford", "Anfield", "Etihad Stadium", "Camp Nou", "Santiago Bernabéu", "Metropolitano Stadium", "Allianz Arena", "Signal Iduna Park", "San Siro", "Juventus Stadium", "Parc des Princes", "Stade Vélodrome", "Amsterdam Arena", "Maracanã Stadium", "Monumental Stadium", "Yankee Stadium", "Madison Square Garden", "Fenway Park", "Wrigley Field", "Tokyo Dome", "Sapporo Dome").
- When mentioning transit, use SPECIFIC station/stop names, not generic system names. For example: "Tsim Sha Tsui MTR Station" not "MTR"; "Shinjuku Station" not "JR Line"; "Châtelet Metro Station" not "Metro". This is needed for route planning.

Getting around / transport:
- Include a short "Getting Around" section near the top with general city transit tips (e.g. local metro, day pass, walking, local trains, ride-share).
- Do NOT write per-day transport notes — a dedicated transport agent will inject real walking/driving times and mode recommendations after the itinerary is generated.

Output the response as markdown.
`;

  const res = await qualityLlm!.invoke(prompt);
  return res.content as string;
}

async function generatePackingTips(state: typeof ConversationStateAnnotation.State) {
  const destination = state.entities.destination || '';
  const weather = state.weather;
  const startDate = state.entities.startDate;
  const endDate = state.entities.endDate;
  const interests = state.entities.interests;
  const prompt = `${COMPANION_PERSONA}

Write a concise, friendly packing list for a trip to ${destination} from ${startDate || ''} to ${
    endDate || startDate || ''
  }.
Weather/context: ${typeof weather === 'string' ? weather : JSON.stringify(weather) || 'unknown'}.
${interests ? `The traveler is interested in: ${interests}. Include interest-specific items if relevant (e.g. comfortable walking shoes for stadium tours, team scarf/jersey for football, swimwear for beach trips, camera for photography trips).` : ''}
Output only a markdown bullet list.
`;
  const res = await llm!.invoke(prompt);
  return res.content as string;
}

async function answerNode(state: typeof ConversationStateAnnotation.State) {
  if (!llm) throw new Error('AI provider not configured');

  const destination = state.entities.destination || '';
  const destinationCode = state.entities.destinationCode || destination;
  if (!destination) {
    return { finalResponse: 'I’d love to help, but where are you thinking of going? Just tell me a city or country and I’ll dig up the latest deals and tips.' };
  }

  let startDate = state.entities.startDate ? new Date(state.entities.startDate) : undefined;
  let endDate = state.entities.endDate ? new Date(state.entities.endDate) : undefined;
  if (!startDate) {
    startDate = new Date();
    endDate = new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);
  }

  const [dealsResult, weatherResult, newsResult] = await Promise.all([
    getRelevantDeals({ ...state.entities, startDate: startDate.toISOString().split('T')[0], endDate: endDate?.toISOString().split('T')[0] }),
    getWeatherData(destinationCode, startDate, endDate, destination).catch(() => null),
    searchDestinationNews(destinationCode, startDate, endDate || startDate, destination, state.entities.interests || undefined).catch(() => null),
  ]);

  const dealsText = dealsResult.length
    ? dealsResult
        .map((d) => {
          const bookingUrl = getAirlineBookingUrl(
            d.airline || '',
            d.originCode || '',
            d.destinationCode || '',
            d.departureDate
          );
          const durationText = d.duration ? `${Math.floor(d.duration / 60)}h ${d.duration % 60}m` : '';
          const stopsText = d.stops === 0 ? 'Nonstop' : d.stops === 1 ? '1 stop' : d.stops ? `${d.stops} stops` : '';
          const meta = [durationText, stopsText].filter(Boolean).join(' · ');
          return `- ${d.originCode || 'Any'} → ${d.destinationCode} · ${d.airline} · ${d.cabin} · ${d.pointsRequired?.toLocaleString() || '?'} pts + $${d.taxesAndFees || '0'} taxes${meta ? ` · ${meta}` : ''} · [book on airline site](${bookingUrl})`;
        })
        .join('\n')
    : 'No matching points deals found right now.';

  const prompt = `${COMPANION_PERSONA}

The user asked: "${state.userMessage}"

Destination: ${destination}
Trip window: ${startDate.toISOString().split('T')[0]} to ${endDate?.toISOString().split('T')[0]}

Weather outlook:
${typeof weatherResult === 'string' ? weatherResult : JSON.stringify(weatherResult) || 'Not available'}

Recent news/happenings:
${newsResult || 'No recent news found.'}

Points flight deals in this window:
${dealsText}

Give a friendly, conversational answer to the user's question. If there are good deals, highlight the best ones. If not, suggest a better time window or next step. Keep it to 3-5 short paragraphs and invite follow-up questions.

Output the response as markdown without a heading.`;

  const res = await llm.invoke(prompt);
  return { finalResponse: res.content as string, deals: dealsResult, weather: weatherResult, news: newsResult };
}

async function guardrailsNode(state: typeof ConversationStateAnnotation.State) {
  if (!state.itinerary) return { criticFeedback: [] };
  const feedback: string[] = [];

  // Check 1: Verify landmarks exist on Wikipedia.
  const unverified = await verifyItineraryLandmarks(state.itinerary, state.entities.destination);
  if (unverified.length > 0) {
    feedback.push(`The following places or landmarks could not be verified and may be hallucinated or closed: ${unverified.join(', ')}. Replace them with real, well-known attractions or transit options that are clearly documented.`);
  }

  // Check 2: Verify image placeholders are present for each day.
  const dayCount = (state.itinerary.match(/#{1,4}\s+Day\s+\d+/gi) || []).length;
  const placeholderCount = (state.itinerary.match(/!\[IMAGE:/gi) || []).length;
  if (dayCount > 0 && placeholderCount < dayCount) {
    feedback.push(`The itinerary has ${dayCount} day(s) but only ${placeholderCount} image placeholder(s). Every day MUST have exactly one image placeholder in the format ![IMAGE: landmark name] immediately after the day heading. Add the missing placeholders.`);
  }

  return { criticFeedback: feedback };
}

async function criticNode(state: typeof ConversationStateAnnotation.State) {
  const reasoningModel = getReasoningModel(0.2);
  if (!reasoningModel) throw new Error('AI provider not configured');

  const guardrailsFeedback = state.criticFeedback.join('\n') || 'None';

  const prompt = `
You are a strict travel QA reviewer. Evaluate the assembled itinerary and data before it is shown to the user.

Destination: ${state.entities.destination}
Itinerary:
${state.itinerary}

Packing tips:
${state.packingTips}

Weather data:
${typeof state.weather === 'string' ? state.weather : JSON.stringify(state.weather)}

Recent news:
${state.news || 'None'}

Flight deals count: ${state.deals.length}

Guardrails feedback (external verification checks, may include unverified landmarks):
${guardrailsFeedback}

Check for:
1. Hallucinated flights, upgrades, or premium services inconsistent with the cabin.
2. Missing or vague image placeholders (must be specific landmarks, not city/country names). CRITICAL: if the guardrails feedback says there are missing image placeholders, you MUST reject and ask for revision.
3. Missing weather section.
4. Unsafe or impossible logistics.
5. False statements about visas or entry.
6. Hallucinated or closed attractions, invented restaurants, fake transit lines, or made-up schedules.
7. Any landmark that cannot be verified as a real place (e.g., if it has no Wikipedia presence).
8. Inconsistent number of days with the requested trip length.
9. In the "Getting Around" or day transport notes, invented transit lines, exact schedules, or unverifiable station names. Prefer general advice over specific unverifiable details.

Respond ONLY in JSON:
{
  "isApproved": boolean,
  "feedback": "specific issues, or 'Looks good' if approved"
}
`;

  const res = await reasoningModel.invoke(prompt);
  const parsed = await parseJsonResponse(res.content as string);
  let isApproved = !!parsed?.isApproved;
  let feedback: string = parsed?.feedback || '';

  // Hard auto-reject if guardrails found missing image placeholders.
  // Don't rely on the LLM to catch this — force a revision.
  const placeholderFeedback = state.criticFeedback.find(f => f.includes('image placeholder'));
  if (placeholderFeedback) {
    isApproved = false;
    feedback = feedback || placeholderFeedback;
  }

  return {
    isApproved,
    criticFeedback: isApproved ? [] : [feedback],
    revisionCount: state.revisionCount + 1,
  };
}

function criticRouter(state: typeof ConversationStateAnnotation.State) {
  if (state.isApproved) return 'respond';
  // Allow up to 3 revisions for missing image placeholders (LLM compliance issue),
  // 2 for everything else.
  const hasPlaceholderIssue = state.criticFeedback.some(f => f.includes('image placeholder'));
  const maxRevisions = hasPlaceholderIssue ? 3 : 2;
  if (state.revisionCount >= maxRevisions) return 'respond';
  return 'gather';
}

async function respondNode(state: typeof ConversationStateAnnotation.State) {
  if (state.entities.intent === 'greeting') {
    return {
      finalResponse: `Hi! I'm Jalan, your travel planning buddy. Tell me where you want to go and when — for example, "I want to plan a trip to Tokyo in October" — and I'll build a day-by-day itinerary, check the weather, find points flight deals, and suggest what to pack.`,
    };
  }

  const destination = state.entities.destination || '';
  const startDate = state.entities.startDate;
  const endDate = state.entities.endDate;
  const dateStr = startDate
    ? `${startDate}${endDate ? ` - ${endDate}` : ''}`
    : state.entities.datesGeneral || 'upcoming dates';

  const itineraryWithImages = state.itinerary
    ? await hydrateItineraryImages(state.itinerary, destination)
    : state.itinerary;

  // Deals are rendered as rich cards in the payload, not in the markdown.
  const finalResponse = `# ${destination} Itinerary — ${dateStr}

${itineraryWithImages}

${state.packingTips}

${state.criticFeedback.length > 0 && !state.isApproved ? '\n_Note: Some details were adjusted after review._' : ''}
`;

  return { finalResponse };
}

export function heuristicTitle(message: string): string {
  const clean = message.trim().replace(/\s+/g, ' ');
  if (clean.length <= 40) return clean;
  return clean.slice(0, 37) + '...';
}

export async function generateTitle(message: string) {
  if (!llm) return heuristicTitle(message);
  const prompt = `${COMPANION_PERSONA}

Create a short, specific title (2-5 words) for a trip planning conversation that starts with this message. Use the destination and date if mentioned. Do NOT use generic titles like "New trip" or "Trip planning". Output only the title, no quotes, no extra punctuation.

Examples:
- Message: "I want to go to Tokyo in October" -> Title: Tokyo in October
- Message: "honeymoon in Thailand for 2 weeks" -> Title: Thailand Honeymoon
- Message: "budget trip to Seoul next month" -> Title: Budget Seoul Trip

Message: ${message}
Title:`;
  try {
    const res = await llm.invoke(prompt);
    let title = (res.content as string).trim().replace(/^["']|["']$/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ');
    if (!title || title.toLowerCase().includes('new trip') || title.toLowerCase().includes('trip planning')) {
      return heuristicTitle(message);
    }
    return title.length > 60 ? title.slice(0, 57) + '...' : title;
  } catch {
    return heuristicTitle(message);
  }
}

export const conversationGraph = new StateGraph(ConversationStateAnnotation)
  .addNode('extract', extractNode)
  .addNode('clarify', clarifyNode)
  .addNode('answer', answerNode)
  .addNode('gather', gatherNode)
  .addNode('guardrails', guardrailsNode)
  .addNode('critic', criticNode)
  .addNode('respond', respondNode)
  .addEdge(START, 'extract')
  .addConditionalEdges('extract', routeAfterExtract)
  .addEdge('clarify', END)
  .addEdge('answer', END)
  .addEdge('gather', 'guardrails')
  .addEdge('guardrails', 'critic')
  .addConditionalEdges('critic', criticRouter)
  .addEdge('respond', END)
  .compile();
