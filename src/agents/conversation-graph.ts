import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { getChatModel } from '../lib/ai-provider';
import { getWeatherForecast } from './weather';
import { searchDestinationNews } from './news-search';
import { getDestinationImageUrl } from './destination-images';
import { db } from '../db';
import { flights, deals } from '../db/schema';
import { eq, gte, lte, inArray, and } from 'drizzle-orm';
import type {
  ExtractedEntities,
  ClarifyingQuestion,
  PersistedMessage,
} from '../lib/chat-state';

const llm = getChatModel(0.4);

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

  const prompt = `
You are a travel assistant. Extract trip details from the user's latest message.

Required fields: destination, startDate (or a general date like "November").
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
    "datesGeneral": "e.g. November 2025 or null",
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

  // If only a general date was provided, treat startDate as satisfied
  if (entities.datesGeneral && !entities.startDate) {
    entities.startDate = generalDateToDate(entities.datesGeneral);
  }

  const stillMissing = REQUIRED_FIELDS.filter(
    (f) => !entities[f as keyof ExtractedEntities]
  );

  return { entities, missingFields: stillMissing.length ? stillMissing : missingFields };
}

function generalDateToDate(general: string): string | undefined {
  const now = new Date();
  const match = general.match(/(\w+)\s*(\d{4})?/i);
  if (!match) return undefined;
  const monthNames = [
    'january','february','march','april','may','june',
    'july','august','september','october','november','december'
  ];
  const month = monthNames.findIndex((m) => m === match[1].toLowerCase());
  if (month === -1) return undefined;
  const year = parseInt(match[2] || String(now.getFullYear()), 10);
  const d = new Date(year, month, 15);
  return d.toISOString().split('T')[0];
}

async function clarifyNode(state: typeof ConversationStateAnnotation.State) {
  if (!llm) throw new Error('AI provider not configured');

  const missing = state.missingFields.slice(0, 3);
  const prompt = `
The user is planning a trip but we are missing: ${missing.join(', ')}.
Generate up to 3 short clarifying questions. For each question, provide 2-3 short example answers.
Respond ONLY in JSON:
[
  { "question": "...", "examples": ["...", "..."] }
]
`;

  const res = await llm.invoke(prompt);
  const parsed = await parseJsonResponse(res.content as string);
  const questions: ClarifyingQuestion[] = Array.isArray(parsed) ? parsed : [];
  return { questions };
}

function routeAfterExtract(state: typeof ConversationStateAnnotation.State) {
  if (state.entities.intent === 'greeting') return 'respond';
  if (state.missingFields.length > 0) return 'clarify';
  return 'gather';
}

async function gatherNode(state: typeof ConversationStateAnnotation.State) {
  if (!llm) throw new Error('AI provider not configured');

  const destination = state.entities.destination || '';
  const destinationCode = state.entities.destinationCode || destination;
  const originCode = state.entities.originCode || '';
  const startDate = state.entities.startDate ? new Date(state.entities.startDate) : undefined;
  const endDate = state.entities.endDate ? new Date(state.entities.endDate) : undefined;
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

  const dateContext = startDate
    ? `Trip dates: ${startDate}${endDate ? ` to ${endDate}` : ''}`
    : `Trip window: ${state.entities.datesGeneral || 'upcoming'}`;

  const prompt = `
You are a travel architect. Draft a practical, realistic ${
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
- Start with a Weather Outlook section.
- Include a day-by-day plan. For each day, after the heading include exactly one image placeholder: ![IMAGE: specific English landmark name]. No URLs. Pick iconic, specific places (e.g. "Senso-ji Temple", not "Tokyo").
- Include a short Packing Suggestions section.
- Do not claim upgrades, partner airlines, or premium in-flight services unless cabin is BUSINESS/FIRST.
- Do not invent traveler names.

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
  const prompt = `
Write a concise packing list for a trip to ${destination} from ${startDate || ''} to ${
    endDate || startDate || ''
  }.
Weather/context: ${typeof weather === 'string' ? weather : JSON.stringify(weather) || 'unknown'}.
Output only a markdown bullet list.
`;
  const res = await llm!.invoke(prompt);
  return res.content as string;
}

async function criticNode(state: typeof ConversationStateAnnotation.State) {
  if (!llm) throw new Error('AI provider not configured');

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

  const res = await llm.invoke(prompt);
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

## Packing Tips
${state.packingTips}${dealSection}

${state.criticFeedback.length > 0 && !state.isApproved ? '\n_Note: Some details were adjusted after review._' : ''}
`;

  return { finalResponse };
}

export const conversationGraph = new StateGraph(ConversationStateAnnotation)
  .addNode('extract', extractNode)
  .addNode('clarify', clarifyNode)
  .addNode('gather', gatherNode)
  .addNode('critic', criticNode)
  .addNode('respond', respondNode)
  .addEdge(START, 'extract')
  .addConditionalEdges('extract', routeAfterExtract)
  .addEdge('clarify', END)
  .addEdge('gather', 'critic')
  .addConditionalEdges('critic', criticRouter)
  .addEdge('respond', END)
  .compile();
