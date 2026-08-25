'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Plane, Loader2, History, Plus, LogIn, MapPin, Calendar, Sun, Wind, Droplets, Briefcase, Trash2, Bookmark, Map } from 'lucide-react';
import { useUser, SignInButtonWrapper, UserButtonWrapper } from '@/components/AuthProvider';
import { getAirlineBookingUrl } from '@/lib/airline-booking';
import useSWR, { mutate } from 'swr';
import type { ChatMessageUI, ChatPayload, SavedTrip, RouteLink } from '@/lib/chat-state';
import OneStopPanel from './OneStopPanel';
import WalkersIcon from '@/components/WalkersIcon';

interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function WeatherCard({ weather }: { weather?: any }) {
  if (!weather) return null;
  const summary = typeof weather === 'string' ? weather : JSON.stringify(weather, null, 2);
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 my-3">
      <div className="flex items-center gap-2 text-blue-700 font-semibold mb-2">
        <Sun size={18} /> Weather Outlook
      </div>
      <div className="text-sm text-blue-900 whitespace-pre-wrap">{summary}</div>
    </div>
  );
}

function PackingCard({ packingTips }: { packingTips?: string }) {
  if (!packingTips) return null;
  return (
    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 my-3">
      <div className="flex items-center gap-2 text-amber-700 font-semibold mb-2">
        <Briefcase size={18} /> Packing Suggestions
      </div>
      <div className="text-sm text-amber-900">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{packingTips}</ReactMarkdown>
      </div>
    </div>
  );
}

function formatDuration(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatStops(stops?: number | null): string {
  if (stops === null || stops === undefined) return '';
  if (stops === 0) return 'Nonstop';
  if (stops === 1) return '1 stop';
  return `${stops} stops`;
}

function DealsList({ deals }: { deals?: any[] }) {
  if (!deals || deals.length === 0) return null;

  // Show the top 5 lowest-mileage deals, including duration and stops.
  const topDeals = [...deals]
    .sort((a, b) => (a.pointsRequired || Infinity) - (b.pointsRequired || Infinity))
    .slice(0, 5);

  return (
    <div className="my-3">
      <div className="flex items-center gap-2 text-gray-700 font-semibold mb-2">
        <Plane size={18} /> Points Flight Deals
      </div>
      <div className="grid gap-2">
        {topDeals.map((deal, i) => {
          const bookingUrl = getAirlineBookingUrl(
            deal.airline || '',
            deal.originCode || '',
            deal.destinationCode || '',
            deal.departureDate
          );
          return (
            <a
              key={i}
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shadow-sm hover:border-blue-300 hover:shadow-md transition-all no-underline"
            >
              <div>
                <div className="font-semibold text-gray-900">
                  {deal.originCode} → {deal.destinationCode}
                </div>
                <div className="text-sm text-gray-500">
                  {deal.airline} · {deal.cabin} · {formatDate(deal.departureDate)}
                  {deal.returnDate ? ` - ${formatDate(deal.returnDate)}` : ''}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {formatDuration(deal.duration)}
                  {deal.duration && deal.stops !== null && deal.stops !== undefined ? ' · ' : ''}
                  {formatStops(deal.stops)}
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <div className="text-lg font-bold text-blue-600">
                  {Number(deal.pointsRequired).toLocaleString()} pts
                </div>
                {deal.taxesAndFees ? (
                  <div className="text-xs text-gray-500">+ ${Number(deal.taxesAndFees).toFixed(2)} taxes</div>
                ) : null}
                <div className="text-xs text-blue-600">Book on airline site →</div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function RouteLinks({ routeLinks }: { routeLinks?: RouteLink[] }) {
  if (!routeLinks || routeLinks.length === 0) return null;
  return (
    <div className="my-3">
      <div className="flex items-center gap-2 text-gray-700 font-semibold mb-2">
        <Map size={18} /> Daily Routes
      </div>
      <div className="grid gap-2">
        {routeLinks.map((link, i) => (
          <a
            key={i}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-3 hover:border-blue-300 hover:shadow-sm transition-all no-underline"
          >
            <div className="font-medium text-gray-900">
              Day {link.day}: {link.title || 'Route'}
            </div>
            <div className="text-xs text-blue-600 font-medium">Open in Google Maps →</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function MessageContent({ message, onSaveTrip, isSignedIn }: { message: ChatMessageUI; onSaveTrip?: (payload: ChatPayload) => void; isSignedIn: boolean }) {
  if (message.role === 'user') {
    return <div className="whitespace-pre-wrap">{message.content}</div>;
  }

  return (
    <div className="space-y-1">
      {message.status ? (
        <div className="flex items-center gap-2 text-sm text-blue-600 animate-pulse">
          <Loader2 size={14} className="animate-spin" />
          {message.status}
        </div>
      ) : null}
      <div className="prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
      {message.payload ? <RichPayload payload={message.payload} onSaveTrip={onSaveTrip} isSignedIn={isSignedIn} /> : null}
    </div>
  );
}

function RichPayload({ payload, onSaveTrip, isSignedIn }: { payload: ChatPayload; onSaveTrip?: (payload: ChatPayload) => void; isSignedIn: boolean }) {
  const hasSavableContent = payload.deals?.length || payload.itinerary || payload.packingTips;
  const saveButton = (
    <button
      onClick={() => onSaveTrip?.(payload)}
      className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
    >
      <Bookmark size={14} /> Save to One Stop
    </button>
  );

  return (
    <div className="space-y-3">
      {hasSavableContent ? (
        <div className="flex justify-end">
          {isSignedIn ? saveButton : (
            <SignInButtonWrapper mode="modal">
              {saveButton}
            </SignInButtonWrapper>
          )}
        </div>
      ) : null}
      <WeatherCard weather={payload.weather} />
      <PackingCard packingTips={payload.packingTips} />
      <DealsList deals={payload.deals} />
      <RouteLinks routeLinks={payload.routeLinks} />
    </div>
  );
}

export default function ChatPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [input, setInput] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [oneStopOpen, setOneStopOpen] = useState(false);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load saved trips from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('trip-ai-onestop');
      if (raw) setSavedTrips(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // Persist saved trips to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem('trip-ai-onestop', JSON.stringify(savedTrips));
    } catch {
      // ignore
    }
  }, [savedTrips]);

  const saveTrip = (payload: ChatPayload, conversationId: string) => {
    const destination = payload.entities?.destination || 'Trip';
    const startDate = payload.entities?.startDate;
    const endDate = payload.entities?.endDate;
    const dates = startDate
      ? `${startDate}${endDate ? ` - ${endDate}` : ''}`
      : payload.entities?.datesGeneral || 'Dates TBD';

    const newTrip: SavedTrip = {
      id: crypto.randomUUID(),
      conversationId,
      destination,
      dates,
      payload,
      todos: [],
      notes: '',
      savedAt: new Date().toISOString(),
    };

    setSavedTrips((prev) => [newTrip, ...prev]);
    setOneStopOpen(true);
  };

  const { data: conversationsData } = useSWR<{ conversations: Conversation[] }>(
    '/api/chat/conversations',
    fetcher
  );
  const conversations = conversationsData?.conversations || [];

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversation = useCallback(async (id: string) => {
    setActiveConversationId(id);
    setIsLoading(true);
    const res = await fetch(`/api/chat/history?conversationId=${id}`);
    const data = await res.json();
    if (data.messages) {
      setMessages(
        data.messages.map((m: any) => ({
          id: crypto.randomUUID(),
          role: m.role,
          content: m.content,
          payload: m.payload,
        }))
      );
    }
    setIsLoading(false);
  }, []);

  const startNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
  };

  const sendMessage = async (textOverride?: string) => {
    const raw = textOverride ?? input;
    if (!raw.trim() || isLoading) return;
    const userText = raw.trim();
    if (!textOverride) setInput('');

    const userMessage: ChatMessageUI = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userText,
    };
    const assistantMessage: ChatMessageUI = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      status: 'Planning your trip...',
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, conversationId: activeConversationId }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'status') {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.isStreaming) {
                  return [...prev.slice(0, -1), { ...last, status: data.message }];
                }
                return prev;
              });
            } else if (data.type === 'content') {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.isStreaming) {
                  return [...prev.slice(0, -1), { ...last, content: last.content + data.chunk, status: undefined }];
                }
                return prev;
              });
            } else if (data.type === 'done') {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, payload: data.payload, isStreaming: false, status: undefined },
                  ];
                }
                return prev;
              });
              if (!activeConversationId && data.conversationId) {
                setActiveConversationId(data.conversationId);
              }
            } else if (data.type === 'error') {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: data.message, isStreaming: false, status: undefined },
                  ];
                }
                return prev;
              });
            }
          } catch {
            // ignore malformed lines
          }
        }
      }

      mutate('/api/chat/conversations');
    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, content: 'Sorry, something went wrong.', isStreaming: false, status: undefined }];
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const mergeSession = async () => {
    await fetch('/api/chat/merge-session', { method: 'POST' });
    mutate('/api/chat/conversations');
  };

  useEffect(() => {
    if (isSignedIn) {
      mergeSession();
    }
  }, [isSignedIn]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex">
        <div className="p-4 border-b border-gray-200 flex items-center gap-2">
          <WalkersIcon className="text-blue-600" size={24} />
          <span className="font-bold text-lg">Jalan</span>
        </div>
        <div className="p-3">
          <button
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} /> New trip
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => loadConversation(c.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                activeConversationId === c.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="truncate flex items-center">
                <History size={14} className="inline mr-2 opacity-50 flex-shrink-0" />
                {c.title || 'Trip'}
              </span>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm('Delete this conversation?')) return;
                  await fetch(`/api/chat/conversations/${c.id}`, { method: 'DELETE' });
                  mutate('/api/chat/conversations');
                  if (activeConversationId === c.id) startNewChat();
                }}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                title="Delete conversation"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-gray-200">
          {!isSignedIn ? (
            <SignInButtonWrapper mode="modal">
              <button className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-2 px-4 rounded-lg hover:bg-gray-800 transition-colors">
                <LogIn size={18} /> Sign in
              </button>
            </SignInButtonWrapper>
          ) : (
            <div className="flex items-center justify-center">
              <UserButtonWrapper afterSignOutUrl="/" />
            </div>
          )}
        </div>
      </aside>

      {/* Main chat */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="md:hidden bg-white border-b border-gray-200 p-3 flex items-center justify-end">
          <div className="flex items-center gap-2">
            {isSignedIn ? (
              <button
                onClick={() => setOneStopOpen(true)}
                className="flex items-center gap-1 text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg"
              >
                <Bookmark size={14} /> One Stop
              </button>
            ) : (
              <SignInButtonWrapper mode="modal">
                <button className="flex items-center gap-1 text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
                  <Bookmark size={14} /> One Stop
                </button>
              </SignInButtonWrapper>
            )}
            {!isSignedIn ? (
              <SignInButtonWrapper mode="modal">
                <button className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-lg">Sign in</button>
              </SignInButtonWrapper>
            ) : (
              <UserButtonWrapper afterSignOutUrl="/" />
            )}
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden md:flex items-center justify-end bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-3">
            {isSignedIn ? (
              <button
                onClick={() => setOneStopOpen(true)}
                className="flex items-center gap-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors"
              >
                <Bookmark size={16} /> One Stop
              </button>
            ) : (
              <SignInButtonWrapper mode="modal">
                <button className="flex items-center gap-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors">
                  <Bookmark size={16} /> One Stop
                </button>
              </SignInButtonWrapper>
            )}
            {!isSignedIn ? (
              <SignInButtonWrapper mode="modal">
                <button className="text-sm bg-gray-900 text-white px-3 py-2 rounded-lg hover:bg-gray-800">Sign in</button>
              </SignInButtonWrapper>
            ) : (
              <UserButtonWrapper afterSignOutUrl="/" />
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="bg-blue-100 text-blue-600 p-4 rounded-full mb-4">
                <MapPin size={32} />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Plan your next trip</h1>
              <p className="text-gray-500 max-w-md">
                Tell me where you want to go and when. I&apos;ll build a day-by-day itinerary, check the weather, find points deals, and suggest what to pack.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {['Tokyo in October', 'Honeymoon in Thailand', 'Budget trip to Seoul'].map((s) => (
                  <button
                    key={s}
                    onClick={() => { sendMessage(s); }}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-3xl px-5 py-3 rounded-2xl shadow-sm ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                  }`}
                >
                  <MessageContent
                    message={m}
                    onSaveTrip={m.role === 'assistant' ? (payload) => saveTrip(payload, activeConversationId || 'new') : undefined}
                    isSignedIn={isSignedIn}
                  />
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <OneStopPanel
          isOpen={oneStopOpen}
          onClose={() => setOneStopOpen(false)}
          savedTrips={savedTrips}
          setSavedTrips={setSavedTrips}
        />

        {/* Input area */}
        <div className="bg-white border-t border-gray-200 p-4">
          {!isSignedIn && messages.length > 0 ? (
            <div className="max-w-3xl mx-auto mb-3 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between">
              <span className="text-sm text-amber-800">Sign in to save this itinerary across devices.</span>
              <SignInButtonWrapper mode="modal">
                <button className="text-sm bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700">Sign in</button>
              </SignInButtonWrapper>
            </div>
          ) : null}
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="I want to go to Tokyo in October..."
              rows={1}
              className="flex-1 resize-none max-h-32 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
