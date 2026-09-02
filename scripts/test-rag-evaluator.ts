/**
 * Local test for the RAG evaluator.
 *
 * Runs the LLM-as-a-judge evaluation against a dummy itinerary + dummy
 * retrieved context to verify the schema parsing and scoring work
 * without crashing the dev server.
 *
 * Usage:
 *   npx tsx scripts/test-rag-evaluator.ts
 */

import 'dotenv/config';
import { evaluateRag, RagEvaluationSchema } from '../src/lib/ragEvaluator';

// ---------------------------------------------------------------------------
// Dummy data — simulates what the Gather node would produce
// ---------------------------------------------------------------------------

const dummyInput = {
  userIntent: {
    message: 'Plan a 5-day trip to Tokyo in October. I love anime and gaming.',
    destination: 'Tokyo',
    startDate: '2026-10-01',
    endDate: '2026-10-05',
    interests: 'anime and gaming',
    cabin: 'ECONOMY',
    travelers: 1,
    intent: 'plan_trip',
  },
  retrievedContext: {
    weather:
      'Tokyo in October: average high 22°C, low 15°C. Mostly sunny with occasional rain. Comfortable weather for walking.',
    news:
      'Tokyo Game Show 2026 scheduled for late September at Makuhari Messe. Comiket returns to Tokyo Big Sight in October.',
    deals: [
      {
        originCode: 'JFK',
        destinationCode: 'NRT',
        airline: 'ANA',
        cabin: 'ECONOMY',
        pointsRequired: 60000,
        taxesAndFees: 45,
        departureDate: '2026-10-01',
        category: 'GOOD_DEAL',
      },
    ],
    images: { destination: 'https://example.com/tokyo.jpg' },
  },
  itinerary: `# Tokyo Itinerary — October 1-5, 2026

![IMAGE: Senso-ji Temple](image-url)

## Getting Around
Tokyo has an excellent metro system. Get a Suica card for tap-and-go access to JR lines, Tokyo Metro, and Toei Subway. Most attractions are within walking distance of major stations.

## Day 1 — Asakusa & Akihabara
![IMAGE: Senso-ji Temple]

Start at **Senso-ji Temple**, Tokyo's oldest temple in Asakusa. Walk through the **Kaminarimon Gate** and explore **Nakamise Shopping Street**. In the afternoon, head to **Akihabara** for anime shops, arcades, and gaming centers. Visit **Super Potato** for retro games and **Yodobashi Camera** for electronics.

## Day 2 — Shibuya & Harajuku
![IMAGE: Shibuya Crossing]

Begin at **Shibuya Crossing**, the world's busiest intersection. Visit the **Hachiko Statue**. Walk up to **Harajuku** and explore **Takeshita Street** for quirky fashion. In the afternoon, visit **Meiji Shrine** in the forested park nearby.

## Day 3 — Odaiba & Tokyo Game Show
![IMAGE: Odaiba Gundam Statue]

Head to **Odaiba** to see the life-size **Gundam Statue** at **DiverCity Plaza**. Visit the **Miraikan National Museum of Emerging Science**. In the afternoon, take the train to **Makuhari Messe** for Tokyo Game Show 2026.

## Day 4 — Ikebukuro & Otaku Culture
![IMAGE: Sunshine City Ikebukuro]

Explore **Sunshine City** in Ikebukuro — visit the **Pokemon Center Mega Tokyo** and **Namjatown**. Browse **Animate Ikebukuro** (8 floors of anime merchandise). In the evening, check out the arcades in **Akihabara** or try a themed cafe.

## Day 5 — Shinjuku & Departure
![IMAGE: Shinjuku Gyoen National Garden]

Morning visit to **Shinjuku Gyoen National Garden** for autumn foliage. Explore **Kabukicho** and the **Godzilla Head** statue. Last-minute shopping at **Don Quijote Shinjuku**. Head to **Narita Airport** via the **Narita Express** from Tokyo Station.

## Packing Tips
- Comfortable walking shoes (you'll walk 15-20km/day)
- Light jacket for evenings (15°C)
- Suica card or IC card for transit
- Portable phone charger
- Umbrella for occasional rain`,
};

// ---------------------------------------------------------------------------
// Run the test
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🧪 RAG Evaluator Test — Starting...\n');
  console.log(`   Provider: ${process.env.OPENAI_API_KEY ? 'OpenAI (zodResponseFormat)' : 'Gemini (withStructuredOutput)'}\n`);

  // 1. Verify the schema is valid
  console.log('1. Validating zod schema...');
  const schemaCheck = RagEvaluationSchema.safeParse({
    contextRelevance: { score: 5, reasoning: 'test' },
    groundedness: { score: 4, reasoning: 'test' },
    answerRelevance: { score: 5, reasoning: 'test' },
    overallScore: 4.7,
    summary: 'test',
  });
  console.log(`   Schema validation: ${schemaCheck.success ? '✅ PASS' : '❌ FAIL'}\n`);

  // 2. Run the evaluation
  console.log('2. Running LLM evaluation with dummy data...\n');
  const userQuery = dummyInput.userIntent.message;
  const retrievedContext = JSON.stringify(dummyInput.retrievedContext);
  const result = await evaluateRag(userQuery, retrievedContext, dummyInput.itinerary);

  if (!result) {
    console.error('❌ Evaluation returned null — no AI provider configured or evaluation failed.');
    console.error('   Set GEMINI_API_KEY or OPENAI_API_KEY in .env to run this test.');
    process.exit(1);
  }

  // 3. Verify the result matches the schema type
  console.log('3. Verifying result type...\n');
  const parseResult = RagEvaluationSchema.safeParse(result);
  if (!parseResult.success) {
    console.error('❌ Result does not match RagEvaluationSchema:', parseResult.error.format());
    process.exit(1);
  }

  console.log('✅ RAG Evaluator test PASSED!\n');
  console.log('   Returned type: RagEvaluation (z.infer<typeof RagEvaluationSchema>)');
  console.log(`   Overall score: ${result.overallScore}/5`);
  console.log(`   Context Relevance: ${result.contextRelevance.score}/5`);
  console.log(`   Groundedness: ${result.groundedness.score}/5`);
  console.log(`   Answer Relevance: ${result.answerRelevance.score}/5`);
  console.log(`   Summary: ${result.summary}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Test crashed:', err);
  process.exit(1);
});
