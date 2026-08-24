import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

const geminiKey = process.env.GEMINI_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

export const hasGemini = !!geminiKey && !geminiKey.includes('your_gemini_api_key');
export const hasOpenAI = !!openaiKey && !openaiKey.includes('your_openai_api_key');

export const hasAIProvider = hasGemini || hasOpenAI;
export const activeProvider: 'gemini' | 'openai' | 'none' = hasGemini ? 'gemini' : hasOpenAI ? 'openai' : 'none';

const DEFAULT_GEMINI_MODEL = process.env.CHAT_MODEL || 'gemini-flash-lite-latest';
const DEFAULT_OPENAI_MODEL = process.env.CHAT_MODEL || 'gpt-4o-mini';

export function getChatModel(temperature = 0.4, modelName?: string) {
  if (hasGemini) {
    return new ChatGoogleGenerativeAI({
      model: modelName || DEFAULT_GEMINI_MODEL,
      apiKey: geminiKey,
      temperature,
      maxRetries: 3,
    });
  }

  if (hasOpenAI) {
    return new ChatOpenAI({
      model: modelName || DEFAULT_OPENAI_MODEL,
      apiKey: openaiKey,
      temperature,
      maxRetries: 3,
    });
  }

  return null;
}

export function getReasoningModel(temperature = 0.2) {
  if (hasGemini) {
    return new ChatGoogleGenerativeAI({
      model: 'gemini-1.5-pro-latest',
      apiKey: geminiKey,
      temperature,
      maxRetries: 3,
    });
  }

  if (hasOpenAI) {
    return new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: openaiKey,
      temperature,
      maxRetries: 3,
    });
  }

  return getChatModel(temperature);
}
