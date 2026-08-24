'use client';

import { useState } from 'react';
import { X, Plus, Trash2, CheckSquare, Square, Plane, Clipboard, StickyNote, MapPin, Calendar } from 'lucide-react';
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

function SavedTripCard({ trip, onUpdate }: { trip: SavedTrip; onUpdate: (trip: SavedTrip) => void }) {
  const [activeTab, setActiveTab] = useState<'deals' | 'itinerary' | 'packing' | 'todos' | 'notes'>('deals');
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
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            <MapPin size={16} className="text-blue-600" />
            {trip.destination || 'Trip'}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <Calendar size={14} />
            {trip.dates || 'Dates TBD'}
          </div>
        </div>
        <button
          onClick={copyToClipboard}
          className="text-gray-400 hover:text-blue-600 p-1"
          title="Copy trip summary"
        >
          <Clipboard size={16} />
        </button>
      </div>

      <div className="flex overflow-x-auto border-b border-gray-200">
        {(['deals', 'itinerary', 'packing', 'todos', 'notes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 text-xs font-medium capitalize whitespace-nowrap ${
              activeTab === tab ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-50'
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
                    className="block border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors no-underline"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900">
                        {deal.originCode} → {deal.destinationCode}
                      </div>
                      <div className="text-blue-600 font-semibold">
                        {Number(deal.pointsRequired).toLocaleString()} pts
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {deal.airline} · {deal.cabin} · {formatDate(deal.departureDate)}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {formatDuration(deal.duration)}
                      {deal.duration && deal.stops !== null && deal.stops !== undefined ? ' · ' : ''}
                      {formatStops(deal.stops)}
                    </div>
                    {deal.taxesAndFees ? (
                      <div className="text-xs text-gray-500 mt-1">+ ${Number(deal.taxesAndFees).toFixed(2)} taxes</div>
                    ) : null}
                  </a>
                );
              })
            ) : (
              <div className="text-sm text-gray-500">No deals saved.</div>
            )}
          </div>
        )}

        {activeTab === 'itinerary' && (
          <div className="prose prose-sm max-w-none text-gray-700">
            {payload.itinerary ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{payload.itinerary}</ReactMarkdown>
            ) : (
              <div className="text-sm text-gray-500">No itinerary saved.</div>
            )}
          </div>
        )}

        {activeTab === 'packing' && (
          <div className="prose prose-sm max-w-none text-gray-700">
            {payload.packingTips ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{payload.packingTips}</ReactMarkdown>
            ) : (
              <div className="text-sm text-gray-500">No packing list saved.</div>
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
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
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
                <div className="text-sm text-gray-400">No to-dos yet.</div>
              ) : (
                trip.todos.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 group">
                    <button onClick={() => toggleTodo(t.id)} className="text-blue-600">
                      {t.done ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                    <span className={`flex-1 text-sm ${t.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {t.text}
                    </span>
                    <button
                      onClick={() => deleteTodo(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 p-1"
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
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <StickyNote size={16} /> Notes
            </div>
            <textarea
              value={trip.notes}
              onChange={(e) => updateNotes(e.target.value)}
              placeholder="Write your notes here..."
              className="w-full h-32 text-sm border border-gray-200 rounded-lg p-3 focus:outline-none focus:border-blue-400 resize-none"
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
  if (p.packingTips) summary += `Packing:\n${p.packingTips}\n\n`;
  if (trip.notes) summary += `Notes:\n${trip.notes}\n\n`;
  if (trip.todos.length > 0) summary += `To-dos:\n${trip.todos.map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`).join('\n')}\n`;
  return summary;
}

export default function OneStopPanel({ isOpen, onClose, savedTrips, setSavedTrips }: OneStopPanelProps) {
  const updateTrip = (updated: SavedTrip) => {
    setSavedTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const deleteTrip = (id: string) => {
    setSavedTrips((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <>
      {isOpen ? (
        <div className="fixed inset-0 z-40" onClick={onClose}>
          <div className="absolute inset-0 bg-black/20" />
        </div>
      ) : null}

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-xl z-50 transform transition-transform duration-300 flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            <Plane size={20} className="text-blue-600" /> One Stop
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-900">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {savedTrips.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="bg-blue-100 text-blue-600 p-4 rounded-full inline-flex mb-4">
                <Clipboard size={24} />
              </div>
              <p className="text-sm">No saved trips yet.</p>
              <p className="text-xs mt-1">Save a deal, itinerary, or packing list from any assistant message.</p>
            </div>
          ) : (
            savedTrips.map((trip) => (
              <div key={trip.id} className="relative">
                <button
                  onClick={() => deleteTrip(trip.id)}
                  className="absolute top-2 right-2 z-10 p-1 text-gray-400 hover:text-red-600"
                  title="Delete trip"
                >
                  <Trash2 size={14} />
                </button>
                <SavedTripCard trip={trip} onUpdate={updateTrip} />
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
