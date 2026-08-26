'use client';

import { useState } from 'react';
import { X, Plus, Trash2, CheckSquare, Square, Plane, Clipboard, StickyNote, MapPin, Calendar, Map } from 'lucide-react';
import type { SavedTrip, ChatPayload } from '@/lib/chat-state';
import { getAirlineBookingUrl } from '@/lib/airline-booking';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface OneStopPanelProps {
  isOpen: boolean;
  onClose: () => void;
  savedTrips: SavedTrip[];
  setSavedTrips: React.Dispatch<React.SetStateAction<SavedTrip[]>>;
}

function formatDate(iso?: string | Date) {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

function SavedTripCard({ trip, onUpdate, onDelete }: { trip: SavedTrip; onUpdate: (trip: SavedTrip) => void; onDelete?: () => void }) {
  const [activeTab, setActiveTab] = useState<'deals' | 'itinerary' | 'routes' | 'packing' | 'todos' | 'notes'>('deals');
  const [todoText, setTodoText] = useState('');

  const addTodo = () => {
    if (!todoText.trim()) return;
    onUpdate({
      ...trip,
      todos: [...trip.todos, { id: crypto.randomUUID(), text: todoText.trim(), done: false }],
    });
    setTodoText('');
  };

  const toggleTodo = (id: string) => {
    onUpdate({
      ...trip,
      todos: trip.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    });
  };

  const deleteTodo = (id: string) => {
    onUpdate({
      ...trip,
      todos: trip.todos.filter((t) => t.id !== id),
    });
  };

  const updateNotes = (notes: string) => {
    onUpdate({ ...trip, notes });
  };

  const copyToClipboard = () => {
    const text = buildTripSummary(trip);
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const payload = trip.payload;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
            <MapPin size={16} className="text-blue-600" />
            {trip.destination || 'Trip'}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1">
            <Calendar size={14} />
            {trip.dates || 'Dates TBD'}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={copyToClipboard}
            className="text-gray-400 dark:text-gray-500 hover:text-blue-600 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Copy trip summary"
          >
            <Clipboard size={16} />
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-gray-400 dark:text-gray-500 hover:text-red-600 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Delete trip"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {(['deals', 'itinerary', 'routes', 'packing', 'todos', 'notes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 text-xs font-medium capitalize whitespace-nowrap ${
              activeTab === tab ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab === 'deals' && (
          <div className="space-y-2">
            {payload.deals && payload.deals.length > 0 ? (
              payload.deals.slice(0, 5).map((deal, i) => {
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
                    className="block border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-blue-300 transition-colors no-underline"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {deal.originCode} → {deal.destinationCode}
                      </div>
                      <div className="text-blue-600 dark:text-blue-400 font-semibold">
                        {Number(deal.pointsRequired).toLocaleString()} pts
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {deal.airline} · {deal.cabin} · {formatDate(deal.departureDate)}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {formatDuration(deal.duration)}
                      {deal.duration && deal.stops !== null && deal.stops !== undefined ? ' · ' : ''}
                      {formatStops(deal.stops)}
                    </div>
                    {deal.taxesAndFees ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">+ ${Number(deal.taxesAndFees).toFixed(2)} taxes</div>
                    ) : null}
                  </a>
                );
              })
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">No deals saved.</div>
            )}
          </div>
        )}

        {activeTab === 'itinerary' && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
            {payload.itinerary ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ src, alt }) => (
                    <figure className="my-3">
                      {src && <img src={src} alt={alt || ''} className="rounded-xl shadow-md w-full" loading="lazy" />}
                      {alt && <figcaption className="text-xs text-gray-400 dark:text-gray-500 text-center mt-1">{alt}</figcaption>}
                    </figure>
                  ),
                  h1: ({ children }) => <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-2 mb-1">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mt-3 mb-1">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-2 mb-1">{children}</h3>,
                  strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>,
                  ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-0.5">{children}</ol>,
                }}
              >
                {payload.itinerary}
              </ReactMarkdown>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">No itinerary saved.</div>
            )}
          </div>
        )}

        {activeTab === 'routes' && (
          <div className="space-y-2">
            {payload.routeLinks && payload.routeLinks.length > 0 ? (
              payload.routeLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-blue-300 transition-colors no-underline"
                >
                  <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                    <Map size={16} className="text-blue-600" />
                    Day {link.day}: {link.title || 'Route'}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Open in Google Maps →</div>
                </a>
              ))
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">No routes saved.</div>
            )}
          </div>
        )}

        {activeTab === 'packing' && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
            {payload.packingTips ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-0.5">{children}</ol>,
                  strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>,
                }}
              >
                {payload.packingTips}
              </ReactMarkdown>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">No packing list saved.</div>
            )}
          </div>
        )}

        {activeTab === 'todos' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={todoText}
                onChange={(e) => setTodoText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                placeholder="Add a to-do..."
                className="flex-1 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
              />
              <button
                onClick={addTodo}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="space-y-2">
              {trip.todos.length === 0 ? (
                <div className="text-sm text-gray-400 dark:text-gray-500">No to-dos yet.</div>
              ) : (
                trip.todos.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 group">
                    <button onClick={() => toggleTodo(t.id)} className="text-blue-600 dark:text-blue-400">
                      {t.done ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                    <span className={`flex-1 text-sm ${t.done ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>
                      {t.text}
                    </span>
                    <button
                      onClick={() => deleteTodo(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-red-600 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <StickyNote size={16} /> Notes
            </div>
            <textarea
              value={trip.notes}
              onChange={(e) => updateNotes(e.target.value)}
              placeholder="Write your notes here..."
              className="w-full h-32 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 rounded-lg p-3 focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function buildTripSummary(trip: SavedTrip): string {
  const p = trip.payload;
  let summary = `${trip.destination} — ${trip.dates}\n\n`;
  if (p.deals && p.deals.length > 0) {
    summary += 'Deals:\n';
    p.deals.forEach((d) => {
      summary += `- ${d.originCode} → ${d.destinationCode} · ${d.airline} · ${d.pointsRequired} pts\n`;
    });
    summary += '\n';
  }
  if (p.itinerary) summary += `Itinerary:\n${p.itinerary}\n\n`;
  if (p.routeLinks && p.routeLinks.length > 0) {
    summary += `Routes:\n${p.routeLinks.map((r) => `- Day ${r.day}: ${r.url}`).join('\n')}\n\n`;
  }
  if (p.packingTips) summary += `Packing:\n${p.packingTips}\n\n`;
  if (trip.notes) summary += `Notes:\n${trip.notes}\n\n`;
  if (trip.todos.length > 0) summary += `To-dos:\n${trip.todos.map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`).join('\n')}\n`;
  return summary;
}

export default function OneStopPanel({ isOpen, onClose, savedTrips, setSavedTrips }: OneStopPanelProps) {
  const [activeTripId, setActiveTripId] = useState<string | null>(null);

  const updateTrip = (updated: SavedTrip) => {
    setSavedTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const deleteTrip = (id: string) => {
    setSavedTrips((prev) => prev.filter((t) => t.id !== id));
    if (activeTripId === id) setActiveTripId(null);
  };

  // Auto-select the first trip if none is selected.
  const activeTrip = savedTrips.find((t) => t.id === activeTripId) || savedTrips[0] || null;

  return (
    <>
      {isOpen ? (
        <div className="fixed inset-0 z-40" onClick={onClose}>
          <div className="absolute inset-0 bg-black/40" />
        </div>
      ) : null}

      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className={`w-[95vw] h-[90vh] max-w-[1000px] max-h-[900px] bg-white dark:bg-gray-900 shadow-2xl rounded-2xl flex flex-col transform transition-all duration-300 ${
            isOpen ? 'scale-100' : 'scale-95'
          }`}
        >
          <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-t-2xl">
            <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
              <Plane size={22} className="text-blue-600" /> One Stop
            </div>
            <button onClick={onClose} className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
              <X size={22} />
            </button>
          </div>

          {savedTrips.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
              <div className="text-center">
                <div className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 p-5 rounded-full inline-flex mb-4">
                  <Clipboard size={28} />
                </div>
                <p className="text-base">No saved trips yet.</p>
                <p className="text-sm mt-1">Save a deal, itinerary, or packing list from any assistant message.</p>
              </div>
            </div>
          ) : savedTrips.length === 1 ? (
            <div className="flex-1 overflow-y-auto p-6">
              <SavedTripCard trip={savedTrips[0]} onUpdate={updateTrip} onDelete={() => deleteTrip(savedTrips[0].id)} />
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* Trip selector sidebar */}
              <div className="w-56 border-r border-gray-100 dark:border-gray-800 flex flex-col flex-shrink-0">
                <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-50 dark:border-gray-800">
                  Saved Trips ({savedTrips.length})
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {savedTrips.map((trip) => (
                    <button
                      key={trip.id}
                      onClick={() => setActiveTripId(trip.id)}
                      className={`w-full text-left rounded-lg p-3 transition-colors group ${
                        activeTrip?.id === trip.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className={activeTrip?.id === trip.id ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'} />
                        <span className={`text-sm font-medium truncate ${activeTrip?.id === trip.id ? 'text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                          {trip.destination || 'Trip'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-5 truncate">
                        {trip.dates || 'Dates TBD'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Active trip detail */}
              <div className="flex-1 overflow-y-auto p-6">
                {activeTrip ? (
                  <SavedTripCard trip={activeTrip} onUpdate={updateTrip} onDelete={() => deleteTrip(activeTrip.id)} />
                ) : (
                  <div className="text-center text-gray-400 dark:text-gray-500 py-16">Select a trip from the left.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
