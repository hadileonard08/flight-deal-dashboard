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

  const prompt = `
    You are a luxury travel architect planning a highly curated trip for a couple.
    Flight Deal: ${JSON.stringify(state.flightDeal)}
    Real local events happening in the destination during this trip (from Ticketmaster, use these if relevant - do not invent fake events): ${JSON.stringify(state.localEvents)}
    Real current news/happenings found via live web search for the destination during this trip window (weather, festivals, holidays, advisories - use if relevant, do not invent anything beyond this): ${state.destinationNews || 'None found.'}
    Previous Critic Feedback (Must address!): ${state.criticFeedback.join("\n")}
    
    Draft a highly curated, aesthetic 5-day itinerary based around this arrival flight. Focus on:
    - Small-group luxury accommodations.
    - Opportunities for silent, aesthetic travel content for social media.
    - Do not use or invent any traveler names - refer to them generically (e.g. "you" or "the couple").
    - Include a brief visa/immigration or entry-requirement advisory ONLY for a US passport holder traveling to this destination (e.g. visa-free entry, e-visa/ETA requirement, visa-on-arrival, etc.). Do not mention or assume any other nationality or residency status.
    - If real local events were provided above and their dates fall within the trip, work at least one of them into the relevant day. If no events were provided, do not mention any events and just build a great itinerary without them.
    - If real current news/happenings were provided above (e.g. a seasonal festival, weather advisory, or public holiday), factor it into the relevant day's plan or a brief practical note. If none were found, do not mention any news and just build a great itinerary without it.
    
    Output a structured daily markdown itinerary.
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

  const prompt = `
    You are a strict travel quality controller evaluating a luxury honeymoon itinerary.
    Itinerary: ${state.draftItinerary}
    
    Evaluate pacing, layovers, and logic. Are there harsh early morning transits? Is it sufficiently luxurious?
    Respond strictly in JSON: { "isApproved": boolean, "feedback": "Explanation of flaws or praise" }
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

export async function generateHoneymoonItinerary(flightDeal: any, localEvents: any[] = [], destinationNews: string | null = null) {
  const result = await itineraryGraph.invoke({
    flightDeal,
    localEvents,
    destinationNews,
    draftItinerary: "",
    criticFeedback: [],
    isApproved: false,
    revisionCount: 0
  });
  return result.draftItinerary;
}
