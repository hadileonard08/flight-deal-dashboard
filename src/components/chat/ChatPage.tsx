'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Plane, Loader2, History, Plus, LogIn, MapPin, Calendar, Sun, Wind, Droplets, Briefcase, Trash2, Bookmark, Map, Menu, X, List, Navigation, Share2 } from 'lucide-react';
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

function slug(children: any): string {
  const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : String(children || '');
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function extractHeadings(markdown: string): { id: string; label: string; level: number }[] {
  const lines = markdown.split('\n');
  const headings: { id: string; label: string; level: number }[] = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (m) {
      const label = m[2].trim();
      headings.push({ id: slug(label), label, level: m[1].length });
    }
  }
  return headings;
}

function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function WeatherCard({ weather }: { weather?: any }) {
  if (!weather) return null;
  const summary = typeof weather === 'string' ? weather : JSON.stringify(weather, null, 2);
  return (
    <div id="section-weather" className="bg-blue-50 border border-blue-100 rounded-xl p-4 my-3 scroll-mt-24">
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
    <div id="section-packing" className="bg-amber-50 border border-amber-100 rounded-xl p-4 my-3 scroll-mt-24">
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
    <div id="section-deals" className="my-3 scroll-mt-24">
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
    <div id="section-routes" className="my-3 scroll-mt-24">
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
            <div className="min-w-0 flex-1">
              <div className="font-medium text-gray-900">
                Day {link.day}{link.title ? `: ${link.title}` : ''}
              </div>
              {link.highlights && (
                <div className="text-xs text-gray-500 mt-0.5 truncate">{link.highlights}</div>
              )}
            </div>
            <div className="text-xs text-blue-600 font-medium flex-shrink-0 ml-2">Open in Google Maps →</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function TransportCard({ transportPlan }: { transportPlan?: any }) {
  if (!transportPlan) return null;
  const { cityTransitTips, estimatedCosts } = transportPlan;
  if (!cityTransitTips && !estimatedCosts) return null;

  return (
    <div id="section-transport" className="my-3 bg-green-50 border border-green-100 rounded-xl p-4 scroll-mt-24">
      <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
        <Navigation size={18} /> Transport & Getting Around
      </div>

      {cityTransitTips && (
        <div className="text-sm text-green-900 mb-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{cityTransitTips}</ReactMarkdown>
        </div>
      )}

      {estimatedCosts && (
        <div className="text-sm text-green-900">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{estimatedCosts}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

// Loading step indicator — shows which pipeline steps have completed.
const PIPELINE_STEPS = [
  { status: 'Thinking...', label: 'Understanding your request', icon: '🧠' },
  { status: 'Asking a quick question...', label: 'Clarifying details', icon: '💬' },
  { status: 'Looking that up...', label: 'Finding deals', icon: '✈️' },
  { status: 'Planning your trip...', label: 'Building your itinerary', icon: '🗺️' },
  { status: 'Double-checking...', label: 'Verifying landmarks', icon: '✓' },
  { status: 'Putting it all together...', label: 'Finalizing', icon: '✨' },
];

function LoadingSteps({ currentStatus }: { currentStatus?: string }) {
  const currentIdx = PIPELINE_STEPS.findIndex(s => s.status === currentStatus);
  // If we don't recognize the status, show a generic spinner.
  if (currentIdx === -1) {
    return (
      <div className="flex items-center gap-2 text-sm text-blue-600 animate-pulse py-1">
        <Loader2 size={14} className="animate-spin" />
        {currentStatus || 'Working...'}
      </div>
    );
  }

  return (
    <div className="py-2 space-y-1.5">
      {PIPELINE_STEPS.map((step, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        return (
          <div
            key={i}
            className={`flex items-center gap-2.5 text-sm transition-all ${
              isDone ? 'text-gray-400' : isActive ? 'text-blue-600' : 'text-gray-300'
            }`}
          >
            <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs rounded-full ${
              isDone ? 'bg-green-100 text-green-600' : isActive ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-gray-100 text-gray-400'
            }`}>
              {isDone ? '✓' : step.icon}
            </span>
            <span className={isActive ? 'font-medium' : ''}>{step.label}</span>
            {isActive && <Loader2 size={12} className="animate-spin ml-auto" />}
          </div>
        );
      })}
    </div>
  );
}

// Split itinerary markdown into sections by "Day X" headings so each day
// can be rendered as a visual card with a colored left border.
function renderItineraryMarkdown(markdown: string): React.ReactNode {
  // Find all "## Day X" or "### Day X" heading positions.
  const dayHeadingRegex = /^(#{2,3})\s+(Day\s+\d+.*)$/gm;
  const matches: { index: number; line: string; level: number; title: string }[] = [];
  let m;
  while ((m = dayHeadingRegex.exec(markdown)) !== null) {
    matches.push({ index: m.index, line: m[0], level: m[1].length, title: m[2] });
  }

  // If no day headings, render as normal markdown.
  if (matches.length === 0) {
    return <ItineraryMarkdown>{markdown}</ItineraryMarkdown>;
  }

  const sections: React.ReactNode[] = [];

  // Content before the first day heading (intro, weather, getting around, etc.)
  const beforeFirst = markdown.substring(0, matches[0].index).trim();
  if (beforeFirst) {
    sections.push(<ItineraryMarkdown key="intro">{beforeFirst}</ItineraryMarkdown>);
  }

  // Each day section.
  matches.forEach((match, i) => {
    const start = match.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
    const sectionContent = markdown.substring(start, end).trim();
    const dayNum = i + 1;

    sections.push(
      <div
        key={`day-${i}`}
        id={slug(match.title)}
        className="day-card bg-white border-l-4 border-blue-400 rounded-r-xl pl-4 pr-3 py-3 my-4 scroll-mt-24"
      >
        <ItineraryMarkdown>{sectionContent}</ItineraryMarkdown>
      </div>
    );
  });

  return <div className="space-y-1">{sections}</div>;
}

// Reusable markdown renderer with consistent component overrides.
function ItineraryMarkdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 id={slug(children)} className="text-xl font-bold text-gray-900 mt-2 mb-1">{children}</h1>,
          h2: ({ children }) => {
            const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : String(children || '');
            const isDayHeading = /^Day\s+\d+/i.test(text);
            return (
              <h2
                id={slug(children)}
                className={`font-bold mt-0 mb-2 ${isDayHeading ? 'text-lg text-blue-700 flex items-center gap-2' : 'text-lg text-gray-900'}`}
              >
                {isDayHeading && <span className="inline-flex items-center justify-center w-7 h-7 bg-blue-600 text-white text-sm rounded-lg font-bold">{text.match(/Day\s+(\d+)/i)?.[1] || ''}</span>}
                {isDayHeading ? text.replace(/^Day\s+\d+\s*[:\-—]?\s*/i, '') : children}
              </h2>
            );
          },
          h3: ({ children }) => <h3 id={slug(children)} className="text-base font-semibold text-gray-800 mt-3 mb-1">{children}</h3>,
          img: ({ src, alt }) => (
            <figure className="my-3">
              <img src={src} alt={alt} className="max-w-full h-auto rounded-xl shadow-md" />
              {alt && alt !== 'IMAGE' && <figcaption className="text-xs text-gray-400 mt-1 text-center">{alt}</figcaption>}
            </figure>
          ),
          table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs">{children}</table></div>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 underline">{children}</a>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          ul: ({ children }) => <ul className="space-y-0.5 my-2">{children}</ul>,
          li: ({ children }) => <li className="text-gray-700">{children}</li>,
        }}
      >{children}</ReactMarkdown>
    </div>
  );
}

function MessageContent({ message, onSaveTrip, onShare, shareUrl, isSignedIn }: { message: ChatMessageUI; onSaveTrip?: (payload: ChatPayload) => void; onShare?: () => void; shareUrl?: string; isSignedIn: boolean }) {
  if (message.role === 'user') {
    return <div className="whitespace-pre-wrap">{message.content}</div>;
  }

  return (
    <div className="space-y-1">
      {message.status ? <LoadingSteps currentStatus={message.status} /> : null}
      {message.content ? renderItineraryMarkdown(message.content) : null}
      {message.payload ? <RichPayload payload={message.payload} onSaveTrip={onSaveTrip} onShare={onShare} shareUrl={shareUrl} isSignedIn={isSignedIn} /> : null}
    </div>
  );
}

function RichPayload({ payload, onSaveTrip, onShare, shareUrl, isSignedIn }: { payload: ChatPayload; onSaveTrip?: (payload: ChatPayload) => void; onShare?: () => void; shareUrl?: string; isSignedIn: boolean }) {
  const hasSavableContent = payload.deals?.length || payload.itinerary || payload.packingTips;
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const saveButton = (
    <button
      onClick={() => onSaveTrip?.(payload)}
      className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
    >
      <Bookmark size={14} /> Save to One Stop
    </button>
  );

  const handleShare = async () => {
    if (!onShare) return;
    setSharing(true);
    try {
      await onShare();
    } finally {
      setSharing(false);
    }
  };

  const handleCopyShareLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3">
      {hasSavableContent ? (
        <div className="flex justify-end gap-2 flex-wrap">
          {shareUrl ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                readOnly
                value={shareUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 w-48 truncate"
              />
              <button
                onClick={handleCopyShareLink}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                {shareCopied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
              {sharing ? 'Creating...' : 'Share'}
            </button>
          )}
          {isSignedIn ? saveButton : (
            <SignInButtonWrapper mode="modal">
              {saveButton}
            </SignInButtonWrapper>
          )}
        </div>
      ) : null}
      <WeatherCard weather={payload.weather} />
      <TransportCard transportPlan={payload.transportPlan} />
      <PackingCard packingTips={payload.packingTips} />
      <DealsList deals={payload.deals} />
      <RouteLinks routeLinks={payload.routeLinks} />
    </div>
  );
}

function SidebarContent({
  conversations,
  activeConversationId,
  onLoadConversation,
  onNewChat,
  onOpenOneStop,
  isSignedIn,
}: {
  conversations: Conversation[];
  activeConversationId: string | null;
  onLoadConversation: (id: string) => void;
  onNewChat: () => void;
  onOpenOneStop: () => void;
  isSignedIn: boolean;
}) {
  return (
    <>
      <div className="p-3 space-y-1">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-100 py-2.5 px-3 rounded-lg transition-colors"
        >
          <Plus size={18} className="text-gray-500" /> New trip
        </button>
        <button
          onClick={onOpenOneStop}
          className="w-full flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-100 py-2.5 px-3 rounded-lg transition-colors"
        >
          <Bookmark size={18} className="text-gray-500" /> One Stop
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        <div className="text-xs font-medium text-gray-400 px-3 pb-1">Recent</div>
        {conversations.map((c) => (
          <div
            key={c.id}
            onClick={() => onLoadConversation(c.id)}
            className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
              activeConversationId === c.id ? 'bg-gray-100 text-gray-900' : 'hover:bg-gray-50 text-gray-600'
            }`}
          >
            <span className="truncate flex items-center min-w-0">
              {c.title || 'Trip'}
            </span>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this conversation?')) return;
                await fetch(`/api/chat/conversations/${c.id}`, { method: 'DELETE' });
                mutate('/api/chat/conversations');
              }}
              className="p-1 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
              title="Delete conversation"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-gray-100">
        {!isSignedIn ? (
          <SignInButtonWrapper mode="modal">
            <button className="w-full flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-100 py-2.5 px-3 rounded-lg transition-colors">
              <LogIn size={18} className="text-gray-500" /> Sign in
            </button>
          </SignInButtonWrapper>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1">
            <UserButtonWrapper afterSignOutUrl="/" />
            <span className="text-sm text-gray-500">Account</span>
          </div>
        )}
      </div>
    </>
  );
}

export default function ChatPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [input, setInput] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [oneStopOpen, setOneStopOpen] = useState(false);
  const [shareUrls, setShareUrls] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

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

  const shareTrip = async (conversationId: string): Promise<string | null> => {
    if (!conversationId) return null;
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.url || null;
    } catch {
      return null;
    }
  };

  const { data: conversationsData } = useSWR<{ conversations: Conversation[] }>(
    '/api/chat/conversations',
    fetcher
  );
  const conversations = conversationsData?.conversations || [];

  const scrollToTop = () => {
    if (messagesRef.current) messagesRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // When loading starts, scroll to top so the user reads from the start.
  useEffect(() => {
    if (isLoading) scrollToTop();
  }, [isLoading]);

  // When streaming finishes, scroll to top so the user sees the itinerary
  // from the beginning, not the end.
  useEffect(() => {
    if (!isLoading && messages.length > 0) scrollToTop();
  }, [isLoading]);

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

    // Show the sign-in prompt when a guest sends their first message.
    if (!isSignedIn) setShowSignInPrompt(true);

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
      setShowSignInPrompt(false);
    }
  }, [isSignedIn]);

  return (
    <div className="flex h-screen bg-gray-50 overflow-x-hidden">
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-100 flex-col hidden md:flex">
        <div className="p-4 flex items-center gap-2 border-b border-gray-50">
          <WalkersIcon className="text-blue-600" size={22} />
          <span className="font-bold text-lg text-gray-900">Jalan</span>
        </div>
        <SidebarContent
          conversations={conversations}
          activeConversationId={activeConversationId}
          onLoadConversation={loadConversation}
          onNewChat={startNewChat}
          onOpenOneStop={() => setOneStopOpen(true)}
          isSignedIn={isSignedIn}
        />
      </aside>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-white border-r border-gray-200 flex-col flex h-full shadow-xl">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WalkersIcon className="text-blue-600" size={22} />
                <span className="font-bold text-lg">Jalan</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 text-gray-500 hover:text-gray-900">
                <X size={20} />
              </button>
            </div>
            <SidebarContent
              conversations={conversations}
              activeConversationId={activeConversationId}
              onLoadConversation={(id) => { loadConversation(id); setSidebarOpen(false); }}
              onNewChat={() => { startNewChat(); setSidebarOpen(false); }}
              onOpenOneStop={() => { setOneStopOpen(true); setSidebarOpen(false); }}
              isSignedIn={isSignedIn}
            />
          </aside>
        </div>
      )}

      {/* Main chat */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="md:hidden bg-white border-b border-gray-100 p-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
            title="Menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-gray-700 font-semibold">
              <WalkersIcon className="text-blue-600" size={18} />
              <span>Jalan</span>
            </div>
          </div>
          {!isSignedIn ? (
            <SignInButtonWrapper mode="modal">
              <button className="text-sm text-blue-600 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">Sign in</button>
            </SignInButtonWrapper>
          ) : (
            <UserButtonWrapper afterSignOutUrl="/" />
          )}
        </div>

        {/* Desktop header — minimal, just account on the right */}
        <div className="hidden md:flex items-center justify-end bg-white border-b border-gray-100 px-6 py-2.5">
          {!isSignedIn ? (
            <SignInButtonWrapper mode="modal">
              <button className="text-sm text-blue-600 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">Sign in</button>
            </SignInButtonWrapper>
          ) : (
            <UserButtonWrapper afterSignOutUrl="/" />
          )}
        </div>

        {/* Messages + section navigator */}
        <div className="flex-1 flex overflow-hidden">
          <div ref={messagesRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-44 space-y-6">
            {/* Closable sign-in prompt — appears when a guest sends a message */}
            {showSignInPrompt && !isSignedIn && (
              <div className="sticky top-0 z-20 -mx-4 md:-mx-6 -mt-4 md:-mt-6 mb-2 px-4 md:px-6 py-3 bg-gray-900 text-white flex items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2 min-w-0">
                  <LogIn size={18} className="flex-shrink-0" />
                  <span className="text-sm font-medium truncate">Sign in to save your trip and access it across devices.</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <SignInButtonWrapper mode="modal">
                    <button className="text-sm bg-white text-gray-900 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                      Sign in
                    </button>
                  </SignInButtonWrapper>
                  <button
                    onClick={() => setShowSignInPrompt(false)}
                    className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                    aria-label="Dismiss"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            )}
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 max-w-2xl mx-auto">
                <div className="mb-5">
                  <WalkersIcon className="text-blue-600" size={48} />
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-3">Where to next?</h1>
                <p className="text-gray-500 max-w-md mb-6">
                  Tell me where you want to go and when. I&apos;ll build a day-by-day itinerary with real weather, live flight deals, and transport routing.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mb-6">
                  {[
                    { label: '🗼 Tokyo in October', msg: 'Plan a 5-day trip to Tokyo in October 2025' },
                    { label: '🏖️ Beach week in Bali', msg: 'Plan a relaxing beach trip to Bali for 7 days in November' },
                    { label: '🍜 Food trip to Bangkok', msg: 'Plan a 4-day food trip to Bangkok in December 2025' },
                    { label: '⚽ Football in London', msg: 'Plan a 3-day football trip to London in October 2025. I want to visit stadiums.' },
                    { label: '💍 Honeymoon in Santorini', msg: 'Plan a romantic 5-day honeymoon in Santorini in June 2025' },
                    { label: '🎒 Budget Seoul weekend', msg: 'Plan a budget 3-day trip to Seoul in March 2025' },
                  ].map((s) => (
                    <button
                      key={s.label}
                      onClick={() => { sendMessage(s.msg); }}
                      className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:shadow-sm transition-all"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-400">
                  <span className="flex items-center gap-1">🌤️ Real weather</span>
                  <span className="flex items-center gap-1">✈️ Live flight deals</span>
                  <span className="flex items-center gap-1">🗺️ Transport routing</span>
                  <span className="flex items-center gap-1">🎒 Packing tips</span>
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'} message-fade-in`}>
                  {m.role === 'assistant' && (
                    <div className="flex-shrink-0 mt-1">
                      <WalkersIcon className="text-blue-600" size={26} />
                    </div>
                  )}
                  <div
                    className={`max-w-3xl w-full md:w-auto min-w-0 px-5 py-3 rounded-2xl ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm'
                    }`}
                  >
                    <MessageContent
                      message={m}
                      onSaveTrip={m.role === 'assistant' ? (payload) => saveTrip(payload, activeConversationId || 'new') : undefined}
                      onShare={m.role === 'assistant' && activeConversationId ? async () => {
                        const url = await shareTrip(activeConversationId);
                        if (url) {
                          setShareUrls((prev) => ({ ...prev, [m.id]: url }));
                        }
                      } : undefined}
                      shareUrl={shareUrls[m.id]}
                      isSignedIn={isSignedIn}
                    />
                  </div>
                </div>
              ))
            )}
            {/* Tweak prompt — at the bottom of the chat, after all messages */}
            {messages.length > 0 && !isLoading && messages[messages.length - 1]?.role === 'assistant' && (
              <div className="max-w-3xl mx-auto text-center text-sm text-gray-400 italic py-4 border-t border-gray-100 mt-2">
                Want to tweak anything? Just say the word — shorter trip, different budget, business class, you name it.
              </div>
            )}
          </div>

          {/* Section navigator — right side mini tab (desktop) + floating button (mobile) */}
          {(() => {
            const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
            if (!lastAssistant || !lastAssistant.content) return null;

            // Markdown headings from the itinerary text
            const mdHeadings = extractHeadings(lastAssistant.content);

            // Payload sections (weather, transport, packing, deals, routes) rendered as UI cards
            const payload = lastAssistant.payload;
            const payloadHeadings: { id: string; label: string; level: number }[] = [];
            if (payload?.weather) payloadHeadings.push({ id: 'section-weather', label: 'Weather Outlook', level: 2 });
            if (payload?.transportPlan) payloadHeadings.push({ id: 'section-transport', label: 'Transport & Getting Around', level: 2 });
            if (payload?.packingTips) payloadHeadings.push({ id: 'section-packing', label: 'Packing Suggestions', level: 2 });
            if (payload?.deals?.length) payloadHeadings.push({ id: 'section-deals', label: 'Points Flight Deals', level: 2 });
            if (payload?.routeLinks?.length) payloadHeadings.push({ id: 'section-routes', label: 'Daily Routes', level: 2 });

            const headings = [...mdHeadings, ...payloadHeadings];
            if (headings.length < 2) return null;

            const jumpTo = (id: string) => {
              const el = document.getElementById(id);
              if (el && messagesRef.current) {
                // Calculate the scroll position manually so the element appears
                // below the sticky header, not hidden behind the input area.
                const container = messagesRef.current;
                const containerRect = container.getBoundingClientRect();
                const elRect = el.getBoundingClientRect();
                const offset = elRect.top - containerRect.top + container.scrollTop - 80;
                container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
              }
              setSectionsOpen(false);
            };

            const sectionButtons = headings.map((h) => {
              const isDay = h.id.startsWith('day-') || /^day\s+\d+/i.test(h.label);
              const dayNumber = h.label.match(/Day\s+(\d+)/i)?.[1] || '';
              const cleanLabel = isDay ? h.label.replace(/^Day\s+\d+\s*[:\-—]?\s*/i, '') : h.label;
              return (
                <button
                  key={h.id}
                  onClick={() => jumpTo(h.id)}
                  className="w-full text-left text-xs text-gray-500 hover:text-blue-600 py-1.5 px-2 rounded-md hover:bg-blue-50 transition-colors truncate"
                  title={h.label}
                >
                  {isDay ? (
                    <span><span className="text-gray-400 mr-1.5">{dayNumber}.</span>{cleanLabel}</span>
                  ) : (
                    h.label
                  )}
                </button>
              );
            });

            return (
              <>
                {/* Desktop — section navigation rail */}
                <nav className="hidden lg:flex flex-col w-48 border-l border-gray-100 py-4 px-2 h-full overflow-hidden">
                  <div className="overflow-y-auto flex-1 space-y-0.5">
                    {sectionButtons}
                  </div>
                </nav>

                {/* Mobile floating button */}
                <button
                  onClick={() => setSectionsOpen(true)}
                  className="lg:hidden fixed right-3 bottom-20 z-30 bg-white border border-gray-200 text-gray-600 rounded-full shadow-md p-2.5 hover:bg-gray-50 transition-colors"
                  title="Jump to section"
                >
                  <List size={20} />
                </button>

                {/* Mobile drawer */}
                {sectionsOpen && (
                  <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/20" onClick={() => setSectionsOpen(false)} />
                    <nav className="relative w-56 bg-white shadow-xl h-full flex flex-col overflow-y-auto">
                      <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-600">Sections</span>
                        <button onClick={() => setSectionsOpen(false)} className="p-1 text-gray-400 hover:text-gray-900">
                          <X size={18} />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                        {sectionButtons}
                      </div>
                    </nav>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        <OneStopPanel
          isOpen={oneStopOpen}
          onClose={() => setOneStopOpen(false)}
          savedTrips={savedTrips}
          setSavedTrips={setSavedTrips}
        />

        {/* Input area */}
        <div className="bg-white border-t border-gray-100 px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all px-1 py-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Where do you want to go?"
                rows={1}
                className="flex-1 resize-none max-h-32 bg-transparent px-3 py-2.5 focus:outline-none text-gray-800 placeholder:text-gray-400"
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className="bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
                title="Send"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-1.5">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
