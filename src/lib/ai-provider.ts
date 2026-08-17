import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

const geminiKey = process.env.GEMINI_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

const hasGemini = !!geminiKey && !geminiKey.includes('your_gemini_api_key');
const hasOpenAI = !!openaiKey && !openaiKey.includes('your_openai_api_key');

export const hasAIProvider = hasGemini || hasOpenAI;
export const activeProvider: 'gemini' | 'openai' | 'none' = hasGemini ? 'gemini' : hasOpenAI ? 'openai' : 'none';

export function getChatModel(temperature = 0.4) {
  if (hasGemini) {
    return new ChatGoogleGenerativeAI({
      model: 'gemini-flash-lite-latest',
      apiKey: geminiKey,
      temperature,
      maxRetries: 3,
    });
  }

  if (hasOpenAI) {
    return new ChatOpenAI({
      model: 'gpt-4o-mini',
      apiKey: openaiKey,
      temperature,
      maxRetries: 3,
    });
  }

  return null;
}
