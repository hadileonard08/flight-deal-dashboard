import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { getChatModel, getReasoningModel } from '../lib/ai-provider';
import { getWeatherForecast } from './weather';
import { searchDestinationNews } from './news-search';
import { getDestinationImageUrl } from './destination-images';
import { db } from '../db';
import { flights, deals } from '../db/schema';
import { eq, gte, lte, inArray, and } from 'drizzle-orm';
import * as chrono from 'chrono-node';
import type {
  ExtractedEntities,
  ClarifyingQuestion,
  PersistedMessage,
} from '../lib/chat-state';

const llm = getChatModel(0.4);

const COMPANION_PERSONA = `You are Trip AI, a friendly travel companion. You are warm, curious, and helpful — like a friend who loves planning trips. Use a conversational tone, ask one or two follow-up questions when needed, and avoid sounding robotic or overly formal. Keep responses concise but useful.`;

const DEFAULT_TRIP_DAYS = 5;

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
  - plan_trip: user wants an itinerary or help planning a trip
  - ask_question: user is asking a specific question (e.g. about deals, weather, best time to visit)
  - refine: user wants to change something about an earlier plan
  - greeting: user just said hi or similar

Optional fields: origin, endDate, cabin (ECONOMY | PREMIUM_ECONOMY | BUSINESS | FIRST), travelers, budget.

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

  // If we still have no start date but destination is known, default to a flexible date soon
  if (entities.destination && !entities.startDate) {
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

  const missing = state.missingFields.slice(0, 3);
  const prompt = `${COMPANION_PERSONA}

The user is planning a trip but we are missing: ${missing.join(', ')}.
Ask ONE short, conversational clarifying question to get the missing info. Suggest a few example answers inline. Keep it friendly and brief. Do not list numbered questions.

Respond ONLY in plain text (no JSON, no markdown headers).`;

  const res = await llm.invoke(prompt);
  const finalResponse = (res.content as string).trim() || 'I need a bit more info to plan your trip.';
  return { questions: [], finalResponse };
}

function routeAfterExtract(state: typeof ConversationStateAnnotation.State) {
  if (state.entities.intent === 'greeting') return 'respond';
  if (state.entities.intent === 'ask_question') return 'answer';
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
    endDate = new Date(startDate.getTime() + DEFAULT_TRIP_DAYS * 24 * 60 * 60 * 1000);
    state.entities.endDate = endDate.toISOString().split('T')[0];
  }
  const cabin = state.entities.cabin || 'ECONOMY';
  const travelers = state.entities.travelers || 1;

  const [weatherResult, newsResult, imageResult, dealsResult] = await Promise.all([
    getWeatherData(destinationCode, startDate, endDate),
    startDate
      ? searchDestinationNews(destinationCode, startDate, endDate || startDate).catch(() => null)
      : Promise.resolve(null),
    getDestinationImageUrl(destinationCode).catch(() => null),
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

  return {
    weather: weatherResult,
    news: newsResult,
    deals: dealsResult,
    images: { destination: imageResult || '' },
    itinerary,
    packingTips,
  };
}

async function getWeatherData(
  destinationCode: string,
  startDate?: Date,
  endDate?: Date
): Promise<any> {
  if (!startDate) return null;
  const end = endDate || new Date(startDate.getTime() + 4 * 24 * 60 * 60 * 1000);
  try {
    return await getWeatherForecast(destinationCode, startDate, end);
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
    .orderBy(deals.category)
    .limit(5);

  return rows;
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
  }

  const dateContext = startDate
    ? `Trip dates: ${startDate}${endDate ? ` to ${endDate}` : ''} (${numDays} days)`
    : `Trip window: ${state.entities.datesGeneral || 'upcoming'}`;

  const prompt = `${COMPANION_PERSONA}

You are helping plan a trip. Write an enthusiastic, practical ${
    cabin === 'BUSINESS' || cabin === 'FIRST' ? 'luxury' : 'budget-friendly'
  } itinerary for ${travelers} traveler(s) going to ${destination}.
${dateContext}
Flight cabin: ${cabin}

Weather forecast or climate note:
${typeof weather === 'string' ? weather : JSON.stringify(weather)}

Recent destination news/happenings:
${news}

Critic feedback to address:
${feedback}

Requirements:
- Start with a brief, friendly intro sentence (1-2 lines) before the itinerary.
- Plan EXACTLY ${numDays} days. Do not add or skip days.
- Include a day-by-day plan. For each day, after the heading include exactly one image placeholder: ![IMAGE: specific English landmark name]. No URLs. Pick iconic, specific places (e.g. "Senso-ji Temple", not "Tokyo").
- Do not claim upgrades, partner airlines, or premium in-flight services unless cabin is BUSINESS/FIRST.
- Do not invent traveler names.
- Keep the tone warm, like a friend sharing recommendations.

Output the response as markdown.
`;

  const res = await llm!.invoke(prompt);
  return res.content as string;
}

async function generatePackingTips(state: typeof ConversationStateAnnotation.State) {
  const destination = state.entities.destination || '';
  const weather = state.weather;
  const startDate = state.entities.startDate;
  const endDate = state.entities.endDate;
  const prompt = `${COMPANION_PERSONA}

Write a concise, friendly packing list for a trip to ${destination} from ${startDate || ''} to ${
    endDate || startDate || ''
  }.
Weather/context: ${typeof weather === 'string' ? weather : JSON.stringify(weather) || 'unknown'}.
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
    getWeatherData(destinationCode, startDate, endDate).catch(() => null),
    searchDestinationNews(destinationCode, startDate, endDate || startDate).catch(() => null),
  ]);

  const dealsText = dealsResult.length
    ? dealsResult
        .map(
          (d) =>
            `- ${d.originCode || 'Any'} → ${d.destinationCode} · ${d.airline} · ${d.cabin} · ${d.pointsRequired?.toLocaleString() || '?'} pts + $${d.taxesAndFees || '0'} taxes · ${d.category}`
        )
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

async function criticNode(state: typeof ConversationStateAnnotation.State) {
  const reasoningModel = getReasoningModel(0.2);
  if (!reasoningModel) throw new Error('AI provider not configured');

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

Check for:
1. Hallucinated flights, upgrades, or premium services inconsistent with the cabin.
2. Missing or vague image placeholders (must be specific landmarks, not city/country names).
3. Missing weather section.
4. Unsafe or impossible logistics.
5. False statements about visas or entry.

Respond ONLY in JSON:
{
  "isApproved": boolean,
  "feedback": "specific issues, or 'Looks good' if approved"
}
`;

  const res = await reasoningModel.invoke(prompt);
  const parsed = await parseJsonResponse(res.content as string);
  const isApproved = !!parsed?.isApproved;
  const feedback: string = parsed?.feedback || '';

  return {
    isApproved,
    criticFeedback: isApproved ? [] : [feedback],
    revisionCount: state.revisionCount + 1,
  };
}

function criticRouter(state: typeof ConversationStateAnnotation.State) {
  if (state.isApproved) return 'respond';
  if (state.revisionCount >= 2) return 'respond';
  return 'gather';
}

async function respondNode(state: typeof ConversationStateAnnotation.State) {
  if (state.entities.intent === 'greeting') {
    return {
      finalResponse: `Hi! I'm Trip AI, your travel planning buddy. Tell me where you want to go and when — for example, "I want to plan a trip to Tokyo in October" — and I'll build a day-by-day itinerary, check the weather, find points flight deals, and suggest what to pack.`,
    };
  }

  const destination = state.entities.destination || '';
  const startDate = state.entities.startDate;
  const endDate = state.entities.endDate;
  const dateStr = startDate
    ? `${startDate}${endDate ? ` - ${endDate}` : ''}`
    : state.entities.datesGeneral || 'upcoming dates';

  let dealSection = '';
  if (state.deals.length > 0) {
    dealSection =
      '\n\n## Points Flight Deals\n' +
      state.deals
        .map(
          (d) =>
            `- **${d.originCode} → ${d.destinationCode}** · ${d.airline} · ${d.cabin} · ${d.pointsRequired?.toLocaleString() || '?'} pts + $${d.taxesAndFees || '0'} taxes · ${d.category}`
        )
        .join('\n') +
      '\n(Prices shown in points only. Cash values are hidden.)';
  } else {
    dealSection = '\n\n## Points Flight Deals\nNo matching points deals right now, but I can still help you plan the trip.';
  }

  const finalResponse = `# ${destination} Itinerary — ${dateStr}

${state.itinerary}

${state.packingTips}${dealSection}

${state.criticFeedback.length > 0 && !state.isApproved ? '\n_Note: Some details were adjusted after review._' : ''}

---

Want to tweak anything? Just say the word — shorter trip, different budget, business class, you name it. 🎒✈️
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
  .addNode('critic', criticNode)
  .addNode('respond', respondNode)
  .addEdge(START, 'extract')
  .addConditionalEdges('extract', routeAfterExtract)
  .addEdge('clarify', END)
  .addEdge('answer', END)
  .addEdge('gather', 'critic')
  .addConditionalEdges('critic', criticRouter)
  .addEdge('respond', END)
  .compile();
