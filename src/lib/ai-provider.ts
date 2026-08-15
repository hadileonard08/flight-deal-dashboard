import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const geminiKey = process.env.GEMINI_API_KEY;

const hasGemini = !!geminiKey && !geminiKey.includes('your_gemini_api_key');

// Gemini is the only AI provider used for reasoning + itinerary generation, as well as
// the live web search grounding in news-search.ts.
export const hasAIProvider = hasGemini;
export const activeProvider: 'gemini' | 'none' = hasGemini ? 'gemini' : 'none';

export function getChatModel(temperature = 0.4) {
  if (hasGemini) {
    return new ChatGoogleGenerativeAI({
      model: 'gemini-flash-lite-latest',
      apiKey: geminiKey,
      temperature,
      maxRetries: 3,
    });
  }
  return null;
}
