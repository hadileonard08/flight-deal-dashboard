import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { hasAIProvider, getChatModel } from "../lib/ai-provider";

const useRealAI = hasAIProvider;
const llm = getChatModel(0.4);

const ItineraryStateAnnotation = Annotation.Root({
  flightDeal: Annotation<any>(),
  localEvents: Annotation<any[]>({
    reducer: (curr, update) => update,
    default: () => []
  }),
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
  if (!useRealAI) {
    return { 
      draftItinerary: `# Luxury Honeymoon Itinerary for ${state.flightDeal.originCode} to ${state.flightDeal.destinationCode}

## Day 1: Arrival & Luxury Check-in
- Arrive at ${state.flightDeal.destinationCode} and transfer to 5-star hotel
- Evening sunset dinner at rooftop restaurant

## Day 2: Cultural Exploration
- Private guided tour of local attractions
- Afternoon spa treatment

## Day 3: Adventure & Romance
- Sunrise hot air balloon ride (weather permitting)
- Private beach picnic

## Day 4: Culinary Experience
- Cooking class with local chef
- Fine dining experience at Michelin-starred restaurant

## Day 5: Departure
- Morning yoga session
- Luxury shopping at premium boutiques
- Departure preparations

*Note: This is a placeholder itinerary. Add your GEMINI_API_KEY to generate AI-powered itineraries.*`,
      revisionCount: state.revisionCount + 1 
    };
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
    Real local events happening in the destination during this trip (from Ticketmaster, use these if relevant - do not invent fake events): ${JSON.stringify(state.localEvents)}
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
    - Daily markdown itinerary with practical activities that match the cabin tier.
    - A brief visa/immigration advisory ONLY for a US passport holder traveling to this destination.
    - If real local events were provided and their dates fall within the trip, work at least one into the relevant day.
    - If real current news/happenings were provided, factor them into the plan or a practical note.
    - Do not use or invent traveler names - refer to them generically (e.g. "you" or "the couple").

    Output a structured markdown itinerary.
  `;
  
  const response = await llm!.invoke(prompt);
  return { draftItinerary: response.content as string, revisionCount: state.revisionCount + 1 };
}

async function criticNode(state: typeof ItineraryStateAnnotation.State) {
  if (!useRealAI) {
    return {
      isApproved: true,
      criticFeedback: []
    };
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
    5. **Realism & Logic**: Check pacing, layovers, and feasibility. Flag anything physically impossible or overly packed.
    6. **No Invented Names**: It must not include specific traveler names.

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

export async function generateHoneymoonItinerary(flightDeal: any, localEvents: any[] = [], destinationNews: string | null = null, weatherForecast: string | null = null) {
  const result = await itineraryGraph.invoke({
    flightDeal,
    localEvents,
    destinationNews,
    weatherForecast,
    draftItinerary: "",
    criticFeedback: [],
    isApproved: false,
    revisionCount: 0
  });
  return result.draftItinerary;
}
