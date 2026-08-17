import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { getChatModel } from "../lib/ai-provider";
import { ensureVisaSection } from "../lib/visa-advisory";

const llm = getChatModel(0.4);

const ItineraryStateAnnotation = Annotation.Root({
  flightDeal: Annotation<any>(),
  destinationNews: Annotation<string | null>({
    reducer: (curr, update) => update,
    default: () => null
  }),
  weatherForecast: Annotation<string | null>({
    reducer: (curr, update) => update,
    default: () => null
  }),
  draftItinerary: Annotation<string>(),
  criticFeedback: Annotation<string[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => []
  }),
  isApproved: Annotation<boolean>({
    reducer: (curr, update) => update,
    default: () => false
  }),
  revisionCount: Annotation<number>({
    reducer: (curr, update) => curr + update,
    default: () => 0
  })
});

async function architectNode(state: typeof ItineraryStateAnnotation.State) {
  if (!llm) {
    throw new Error('AI provider is not configured. Add GEMINI_API_KEY to generate itineraries.');
  }

  const actualCabin = state.flightDeal?.cabin || 'ECONOMY';
  const isLuxuryCabin = actualCabin === 'BUSINESS' || actualCabin === 'FIRST';
  const budgetCabin = actualCabin === 'ECONOMY';

  const tone = isLuxuryCabin
    ? 'a luxury, high-end trip'
    : budgetCabin
    ? 'a budget-conscious but enriching trip'
    : 'a comfortable, mid-tier trip';

  const prompt = `
    You are a travel architect planning ${tone} for a couple.
    The actual booked flight cabin is **${actualCabin}**. You must NEVER claim the travelers have been upgraded, re-routed to a premium cabin, or flying on a different airline than booked. Do not invent lie-flat seats, business-class lounges, or first-class services unless the booked cabin is actually BUSINESS or FIRST.
    Flight Deal: ${JSON.stringify(state.flightDeal)}
    Real current news/happenings found via live web search for the destination during this trip window (weather, festivals, holidays, advisories - use if relevant, do not invent anything beyond this): ${state.destinationNews || 'None found.'}
    Weather forecast for the trip window: ${state.weatherForecast || 'Not available.'}
    Previous Critic Feedback (Must address!): ${state.criticFeedback.join("\n")}

    Draft a 5-day itinerary based around this arrival flight, with the following cabin-aware tone:
    - If the booked cabin is ECONOMY: focus on smart, budget-friendly experiences (free/cheap sights, public transport, local food, hostels or 3-star hotels). You can still sprinkle in one or two affordable "splurges" like a nice dinner, but be honest that the flight is in Economy.
    - If the booked cabin is PREMIUM_ECONOMY: balance comfort and value (3-4 star hotels, a mix of public transport and occasional taxis, one or two nicer experiences).
    - If the booked cabin is BUSINESS or FIRST: go fully luxury (5-star hotels, private transfers, fine dining, spa/lounge experiences, premium small-group tours).

    Required sections:
    - A **Weather Outlook** section at the top using the provided weather forecast (or noting it's unavailable). Include a brief practical note on what to pack or how it may affect plans.
    - A **Flight & Arrival Reality** section that truthfully reflects the actual airline, route, and cabin. No upgrades, no re-routing to partners unless explicitly in the booking.
    - A standalone **## Visa & Immigration Advisory** section. It must be a US passport holder advisory and include: whether a visa is required (or visa-free/ETA/VWP entry), the typical length allowed, and any key passport validity or blank-page requirements. Keep it specific to the destination country.
    - Daily markdown itinerary with practical activities that match the cabin tier. For each day, on the line immediately after the day heading, include exactly one image placeholder for a specific landmark or activity planned that day, formatted as ![IMAGE: English landmark or activity name]. Choose a specific, well-known place written in English (e.g. "Gyeongbokgung Palace", "Tokyo Skytree", "Senso-ji Temple", "Shibuya Crossing", "Victoria Peak", "Tian Tan Buddha"). Do not use the destination city name, country name, "flag", "skyline", or generic words as the image term. Do not add any URL inside the placeholder and do not include an IMAGE line for the Flight & Arrival Reality or Weather sections.
    - If real current news/happenings were provided, factor them into the plan or a practical note.
    - Do not use or invent traveler names - refer to them generically (e.g. "you" or "the couple").

    Output a structured markdown itinerary.
  `;
  
  const response = await llm!.invoke(prompt);
  return { draftItinerary: response.content as string, revisionCount: state.revisionCount + 1 };
}

async function criticNode(state: typeof ItineraryStateAnnotation.State) {
  if (!llm) {
    throw new Error('AI provider is not configured. Add GEMINI_API_KEY to generate itineraries.');
  }

  const actualCabin = state.flightDeal?.cabin || 'ECONOMY';

  const prompt = `
    You are a strict travel quality controller evaluating an itinerary.
    Actual booked flight cabin: ${actualCabin}
    Itinerary: ${state.draftItinerary}

    Evaluate the following. If any fail, respond with isApproved: false and explain all issues.
    1. **Cabin Consistency**: Does the itinerary claim the travelers are flying BUSINESS, FIRST, a partner airline, or an upgraded cabin when the actual booked cabin is ECONOMY or PREMIUM_ECONOMY? It must NOT say "re-routed", "upgraded", "premier", "lie-flat", "business class", or "first class" unless the actual cabin is BUSINESS or FIRST. Reject if it invents premium in-flight service.
    2. **No Fabricated Upgrades**: The itinerary must not state or imply the travelers were upgraded to a premium cabin or moved to a partner airline. It must reflect the actual cabin.
    3. **Cabin-Appropriate Tone**: If ECONOMY, the accommodation and activity recommendations should be budget/mid-tier, not 5-star luxury. If BUSINESS/FIRST, luxury is appropriate. If PREMIUM_ECONOMY, mid-range is fine.
    4. **Weather Section**: There must be a dedicated Weather Outlook or Weather section at the top of the itinerary.
    5. **Daily Images**: Each of the 5 days must include exactly one ![IMAGE: ...] placeholder immediately after the day heading, naming a specific English landmark or activity planned that day. The placeholder must not contain a URL. Reject if any image term is the destination city name, country name, "flag", "skyline", or a similarly generic word (e.g. "Hong Kong", "Hong Kong city", "Hong Kong flag", "flag of Hong Kong").
    6. **Visa & Immigration Section**: There must be a dedicated markdown heading containing "Visa" or "Immigration" (e.g. "## Visa & Immigration Advisory") with specific, correct US passport holder entry guidance for the destination country.
    7. **Realism & Logic**: Check pacing, layovers, and feasibility. Flag anything physically impossible or overly packed.
    8. **No Invented Names**: It must not include specific traveler names.

    Respond strictly in JSON: { "isApproved": boolean, "feedback": "Explanation of flaws or praise. Be specific about any false upgrade claims." }
  `;
  
  const response = await llm!.invoke(prompt);
  try {
    const rawText = (response.content as string).trim().replace(/^```(?:json)?\n?/, '').replace(/```$/, '');
    const evaluation = JSON.parse(rawText);
    return {
      isApproved: evaluation.isApproved,
      criticFeedback: evaluation.isApproved ? [] : [evaluation.feedback]
    };
  } catch (e) {
    return { isApproved: false, criticFeedback: ["Failed to parse critic feedback. Please refine the schedule."] };
  }
}

function criticRouter(state: typeof ItineraryStateAnnotation.State) {
  if (state.isApproved) return END;
  if (state.revisionCount >= 3) return END; // Prevent infinite loops
  return "architect";
}

export const itineraryGraph = new StateGraph(ItineraryStateAnnotation)
  .addNode("architect", architectNode)
  .addNode("critic", criticNode)
  .addEdge(START, "architect")
  .addEdge("architect", "critic")
  .addConditionalEdges("critic", criticRouter)
  .compile();

export async function generateHoneymoonItinerary(flightDeal: any, destinationNews: string | null = null, weatherForecast: string | null = null) {
  const result = await itineraryGraph.invoke({
    flightDeal,
    destinationNews,
    weatherForecast,
    draftItinerary: "",
    criticFeedback: [],
    isApproved: false,
    revisionCount: 0
  });
  return ensureVisaSection(result.draftItinerary, flightDeal.destinationCode);
}
