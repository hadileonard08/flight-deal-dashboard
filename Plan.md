Here is the complete, end-to-end Master Blueprint document. You can save this exact output as `PROMPT_FOR_DEVIN.md` and feed it directly into Devin.

It includes the complete tech stack, the PostgreSQL Drizzle schema, the multi-agent LangGraph feedback loop (customized for an aesthetic, luxury honeymoon experience in early 2027), the Next.js Dashboard UI, and the unified pipeline orchestrator.

---

```markdown
# 🚀 Master Task Prompt: Autonomous US-to-Asia Flight Deal & Itinerary Generator

You are an expert AI software engineer. You are tasked with building a full-stack, multi-agent flight tracking and itinerary generation system. The system continuously scrapes flight deals from major US gateways to Asia, evaluates them against regional baseline pricing, and triggers a **LangGraph multi-agent loop** to generate a highly customized luxury honeymoon itinerary when a top-tier deal is found. Finally, it sends real-time Discord alerts and displays the deals on a Next.js web dashboard.

---

## 🛠️ System Architecture & Technology Stack

*   **Frameworks:** Next.js 14+ (App Router), Node.js (TypeScript)
*   **Database:** PostgreSQL + Drizzle ORM
*   **AI & Multi-Agent:** OpenAI SDK (`gpt-4o`, `gpt-4o-mini`) + `@langchain/langgraph`
*   **Styling & UI:** Tailwind CSS, Lucide React, SWR
*   **External APIs:** Seats.aero API, Discord Webhooks

---

## 📁 Project Initialization & Dependencies

### 1. `package.json`
Create the Node project with the following dependencies:
```json
{
  "name": "autonomous-travel-agent",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "db:push": "drizzle-kit push",
    "run:pipeline": "npx tsx src/scripts/runner.ts"
  },
  "dependencies": {
    "@langchain/core": "^0.2.0",
    "@langchain/langgraph": "^0.0.30",
    "@langchain/openai": "^0.2.0",
    "discord.js": "^14.15.0",
    "drizzle-orm": "^0.30.10",
    "lucide-react": "^0.378.0",
    "next": "14.2.3",
    "openai": "^4.44.0",
    "postgres": "^3.4.4",
    "react": "^18",
    "react-dom": "^18",
    "swr": "^2.2.5"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "autoprefixer": "^10.4.19",
    "drizzle-kit": "^0.21.2",
    "postcss": "^8",
    "tailwindcss": "^3.4.3",
    "typescript": "^5"
  }
}

```

### 2. Environment Variables (`.env`)

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flight_tracker"
OPENAI_API_KEY="your_openai_api_key"
SEATS_AERO_API_KEY="your_seats_aero_api_key"
DISCORD_WEBHOOK_URL="[https://discord.com/api/webhooks/your_webhook_id/your_webhook_token](https://discord.com/api/webhooks/your_webhook_id/your_webhook_token)"

```

---

## 🗄️ Database Schema & Configuration

### `src/db/index.ts`

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const queryClient = postgres(process.env.DATABASE_URL!);
export const db = drizzle(queryClient, { schema });

```

### `src/db/schema.ts`

```typescript
import { pgTable, uuid, varchar, integer, decimal, timestamp, boolean, pgEnum, text } from 'drizzle-orm/pg-core';

export const dealCategoryEnum = pgEnum('deal_category', ['GOOD_DEAL', 'MAYBE_GOOD_DEAL', 'STANDARD']);
export const fareTypeEnum = pgEnum('fare_type', ['CASH', 'POINTS']);
export const cabinClassEnum = pgEnum('cabin_class', ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']);
export const regionEnum = pgEnum('origin_region', ['WEST_COAST', 'CENTRAL', 'EAST_COAST']);

export const flights = pgTable('flights', {
  id: uuid('id').primaryKey().defaultRandom(),
  originCode: varchar('origin_code', { length: 5 }).notNull(),
  originRegion: regionEnum('origin_region').notNull(),
  destinationCode: varchar('destination_code', { length: 5 }).notNull(),
  airline: varchar('airline', { length: 100 }).notNull(),
  departureDate: timestamp('departure_date').notNull(),
  cabin: cabinClassEnum('cabin').notNull().default('ECONOMY'),
  fareType: fareTypeEnum('fare_type').notNull().default('CASH'),
  cashPrice: decimal('cash_price', { precision: 10, scale: 2 }),
  pointsRequired: integer('points_required'),
  taxesAndFees: decimal('taxes_and_fees', { precision: 10, scale: 2 }),
  bookingUrl: varchar('booking_url', { length: 1000 }),
  scrapedAt: timestamp('scraped_at').defaultNow().notNull(),
});

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  flightId: uuid('flight_id').references(() => flights.id, { onDelete: 'cascade' }).notNull(),
  category: dealCategoryEnum('category').notNull(),
  reasoning: varchar('reasoning', { length: 1000 }).notNull(),
  itinerary: text('itinerary'), // Stores the LangGraph output
  isNotified: boolean('is_notified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

```

---

## 🤖 Core Agent Pipeline

### 1. Regional Config (`src/lib/config.ts`)

```typescript
export const REGIONS = {
  WEST_COAST: ['LAX', 'SFO', 'SEA', 'SAN'],
  CENTRAL: ['ORD', 'DFW', 'DEN', 'MSP', 'MDW'],
  EAST_COAST: ['JFK', 'EWR', 'IAD', 'ATL', 'MIA']
};

export function getRegion(airportCode: string) {
  if (REGIONS.WEST_COAST.includes(airportCode)) return 'WEST_COAST';
  if (REGIONS.CENTRAL.includes(airportCode)) return 'CENTRAL';
  return 'EAST_COAST';
}

export function evaluateThreshold(flight: any) {
  const isWest = getRegion(flight.originCode) === 'WEST_COAST';
  const pointsLimit = isWest ? 50000 : 60000;
  
  if (flight.fareType === 'POINTS' && flight.cabin === 'BUSINESS') {
    if (flight.pointsRequired <= pointsLimit) return 'GOOD_DEAL';
    if (flight.pointsRequired <= pointsLimit + 15000) return 'MAYBE_GOOD_DEAL';
  }
  return 'STANDARD';
}

```

### 2. Multi-Agent Itinerary Builder (`src/agents/graph.ts`)

This LangGraph system manages the Architect and Critic loop, specifically tailored for an early 2027 honeymoon focus.

```typescript
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

const llm = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0.4 });

export const ItineraryState = Annotation.Root({
  flightDeal: Annotation<any>(),
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

async function architectNode(state: typeof ItineraryState.State) {
  const prompt = `
    You are a luxury travel architect planning an early 2027 honeymoon for Hadi and his fiancée, Betty.
    Flight Deal: ${JSON.stringify(state.flightDeal)}
    Previous Critic Feedback (Must address!): ${state.criticFeedback.join("\n")}
    
    Draft a highly curated, aesthetic 5-day itinerary based around this arrival flight. Focus on:
    - Small-group luxury accommodations.
    - Opportunities for silent, aesthetic travel content for social media.
    - Note any specific immigration considerations for a Chinese passport holder with a US Green Card.
    
    Output a structured daily markdown itinerary.
  `;
  
  const response = await llm.invoke(prompt);
  return { draftItinerary: response.content as string, revisionCount: 1 };
}

async function criticNode(state: typeof ItineraryState.State) {
  const prompt = `
    You are a strict travel quality controller evaluating a luxury honeymoon itinerary.
    Itinerary: ${state.draftItinerary}
    
    Evaluate pacing, layovers, and logic. Are there harsh early morning transits? Is it sufficiently luxurious?
    Respond strictly in JSON: { "isApproved": boolean, "feedback": "Explanation of flaws or praise" }
  `;
  
  const response = await llm.invoke(prompt);
  try {
    const evaluation = JSON.parse(response.content as string);
    return {
      isApproved: evaluation.isApproved,
      criticFeedback: evaluation.isApproved ? [] : [evaluation.feedback]
    };
  } catch (e) {
    return { isApproved: false, criticFeedback: ["Failed to parse critic feedback. Please refine the schedule."] };
  }
}

function criticRouter(state: typeof ItineraryState.State) {
  if (state.isApproved) return END;
  if (state.revisionCount >= 3) return END; // Prevent infinite loops
  return "architect";
}

export const itineraryGraph = new StateGraph(ItineraryState)
  .addNode("architect", architectNode)
  .addNode("critic", criticNode)
  .addEdge(START, "architect")
  .addEdge("architect", "critic")
  .addConditionalEdges("critic", criticRouter)
  .compile();

export async function generateHoneymoonItinerary(flightDeal: any) {
  const result = await itineraryGraph.invoke({
    flightDeal,
    draftItinerary: "",
    criticFeedback: [],
    isApproved: false,
    revisionCount: 0
  });
  return result.draftItinerary;
}

```

### 3. Evaluator Agent (`src/agents/agent2-evaluator.ts`)

```typescript
import { db } from '../db';
import { flights, deals } from '../db/schema';
import { evaluateThreshold, getRegion } from '../lib/config';
import { generateHoneymoonItinerary } from './graph';
import OpenAI from 'openai';

const openai = new OpenAI();

export async function processFlights(rawFlights: any[]) {
  for (const flight of rawFlights) {
    const category = evaluateThreshold(flight);
    if (category === 'STANDARD') continue;

    // 1. Generate 2-sentence rationale with fast model
    const reasonRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Output JSON: {"reasoning": "2-sentence punchy rationale why this deal is good."}' },
        { role: 'user', content: JSON.stringify(flight) }
      ],
      response_format: { type: 'json_object' }
    });
    const reasoning = JSON.parse(reasonRes.choices[0].message.content!).reasoning;

    // 2. Generate Full Honeymoon Itinerary using LangGraph (Only for Good Deals)
    let itineraryText = null;
    if (category === 'GOOD_DEAL') {
      itineraryText = await generateHoneymoonItinerary(flight);
    }

    // 3. Save to DB
    const [insertedFlight] = await db.insert(flights).values({
      ...flight,
      originRegion: getRegion(flight.originCode)
    }).returning();

    await db.insert(deals).values({
      flightId: insertedFlight.id,
      category: category as any,
      reasoning,
      itinerary: itineraryText
    });
  }
}

```

### 4. Discord Notifier (`src/agents/agent3-notifier.ts`)

```typescript
import { db } from '../db';
import { deals, flights } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function notifyDiscord() {
  const unnotifiedDeals = await db.select({
    deal: deals,
    flight: flights
  }).from(deals)
    .innerJoin(flights, eq(deals.flightId, flights.id))
    .where(eq(deals.isNotified, false));

  for (const record of unnotifiedDeals) {
    const embed = {
      embeds: [{
        title: record.deal.category === 'GOOD_DEAL' ? '🚨 HONEYMOON DEAL DETECTED!' : '👀 MAYBE GOOD DEAL',
        color: record.deal.category === 'GOOD_DEAL' ? 0x00FF00 : 0xFFFF00,
        fields: [
          { name: '✈️ Route', value: `${record.flight.originCode} ➔ ${record.flight.destinationCode}`, inline: true },
          { name: '💺 Points', value: `${record.flight.pointsRequired} Miles`, inline: true },
          { name: '💡 AI Analysis', value: record.deal.reasoning }
        ],
        description: record.deal.itinerary ? `**Generated Itinerary Draft Attached in Dashboard**` : ''
      }]
    };

    await fetch(process.env.DISCORD_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed)
    });

    await db.update(deals).set({ isNotified: true }).where(eq(deals.id, record.deal.id));
  }
}

```

### 5. The Orchestrator (`src/scripts/runner.ts`)

```typescript
// Add basic Agent 1 scraper logic here or import it
import { processFlights } from '../agents/agent2-evaluator';
import { notifyDiscord } from '../agents/agent3-notifier';

async function runPipeline() {
  console.log('🚀 Starting Deal Pipeline...');
  
  // Mocking Agent 1 payload for Devin to test immediately
  const mockScrapedFlights = [{
    originCode: 'ORD',
    destinationCode: 'HND',
    airline: 'ANA',
    departureDate: new Date('2027-02-14'),
    cabin: 'BUSINESS',
    fareType: 'POINTS',
    pointsRequired: 55000,
    taxesAndFees: 120.00
  }];

  await processFlights(mockScrapedFlights);
  await notifyDiscord();
  console.log('✅ Pipeline finished.');
}

runPipeline().catch(console.error);

```

---

## 🌐 Next.js Web Dashboard

### `src/app/api/deals/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

export async function GET() {
  const allDeals = await db.select({
    id: deals.id,
    category: deals.category,
    reasoning: deals.reasoning,
    itinerary: deals.itinerary,
    originCode: flights.originCode,
    destinationCode: flights.destinationCode,
    pointsRequired: flights.pointsRequired,
    airline: flights.airline
  })
  .from(deals)
  .innerJoin(flights, eq(deals.flightId, flights.id))
  .orderBy(desc(deals.createdAt));

  return NextResponse.json(allDeals);
}

```

### `src/app/page.tsx`

```tsx
"use client";
import useSWR from 'swr';
import { Plane, Sparkles } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function Dashboard() {
  const { data: deals, error } = useSWR('/api/deals', fetcher, { refreshInterval: 30000 });

  if (error) return <div className="p-10">Failed to load deals</div>;
  if (!deals) return <div className="p-10">Loading deals...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-8 flex items-center gap-2">
        <Plane className="text-blue-600"/> Deal & Itinerary Dashboard
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {deals.map((deal: any) => (
          <div key={deal.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className={\`text-xs font-bold px-2 py-1 rounded \${deal.category === 'GOOD_DEAL' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}\`}>
                  {deal.category.replace('_', ' ')}
                </span>
                <h2 className="text-xl font-black mt-2">{deal.originCode} ➔ {deal.destinationCode}</h2>
                <p className="text-gray-500 text-sm">{deal.airline}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">{deal.pointsRequired?.toLocaleString()} pts</p>
              </div>
            </div>
            
            <p className="text-gray-700 text-sm mb-4 border-l-2 border-blue-200 pl-3">
              "{deal.reasoning}"
            </p>

            {deal.itinerary && (
              <div className="mt-4 bg-slate-50 p-4 rounded-lg text-sm max-h-48 overflow-y-auto">
                <h4 className="font-bold flex items-center gap-1 mb-2 text-indigo-700">
                  <Sparkles size="{14}"/> AI Honeymoon Itinerary Draft
                </h4>
                <div className="whitespace-pre-wrap text-gray-600">{deal.itinerary}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

```

```

***

{/* Reason: Path C - Closed form terminal deliverable. No follow-ups necessary. */}

```