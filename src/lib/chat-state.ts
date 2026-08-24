export interface ExtractedEntities {
  destination?: string;
  destinationCode?: string;
  origin?: string;
  originCode?: string;
  startDate?: string;
  endDate?: string;
  datesGeneral?: string;
  cabin?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  travelers?: number;
  budget?: string;
  intent?: 'plan_trip' | 'ask_question' | 'refine' | 'greeting';
}

export interface ClarifyingQuestion {
  question: string;
  examples: string[];
}

export interface ChatPayload {
  entities?: ExtractedEntities;
  weather?: any;
  news?: string;
  deals?: any[];
  images?: Record<string, string>;
  itinerary?: string;
  packingTips?: string;
  feedback?: string[];
}

export interface PersistedMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  payload?: ChatPayload;
}

export interface ConversationState {
  userMessage: string;
  history: PersistedMessage[];
  entities: ExtractedEntities;
  missingFields: string[];
  questions: ClarifyingQuestion[];
  weather: any | null;
  news: string | null;
  deals: any[];
  images: Record<string, string>;
  itinerary: string;
  packingTips: string;
  criticFeedback: string[];
  isApproved: boolean;
  revisionCount: number;
  finalResponse: string;
}
