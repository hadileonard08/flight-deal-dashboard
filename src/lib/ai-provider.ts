import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

const geminiKey = process.env.GEMINI_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

export const hasGemini = !!geminiKey && !geminiKey.includes('your_gemini_api_key');
export const hasOpenAI = !!openaiKey && !openaiKey.includes('your_openai_api_key');

export const hasAIProvider = hasGemini || hasOpenAI;
export const activeProvider: 'gemini' | 'openai' | 'none' = hasGemini ? 'gemini' : hasOpenAI ? 'openai' : 'none';

const DEFAULT_GEMINI_MODEL = process.env.CHAT_MODEL || 'gemini-3.5-flash-lite';
const QUALITY_GEMINI_MODEL = process.env.QUALITY_MODEL || 'gemini-3.5-flash';
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

/**
 * Returns a higher-quality model for tasks where output quality matters more
 * than latency (itinerary generation, critic evaluation). Falls back to the
 * default chat model if the quality model isn't available.
 */
export function getQualityModel(temperature = 0.4, modelName?: string) {
  if (hasGemini) {
    return new ChatGoogleGenerativeAI({
      model: modelName || QUALITY_GEMINI_MODEL,
      apiKey: geminiKey,
      temperature,
      maxRetries: 3,
    });
  }

  if (hasOpenAI) {
    return new ChatOpenAI({
      model: modelName || 'gpt-4o',
      apiKey: openaiKey,
      temperature,
      maxRetries: 3,
    });
  }

  return getChatModel(temperature);
}

export function getReasoningModel(temperature = 0.2) {
  if (hasGemini) {
    return new ChatGoogleGenerativeAI({
      model: QUALITY_GEMINI_MODEL,
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
