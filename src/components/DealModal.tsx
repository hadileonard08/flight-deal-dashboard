'use client';

import { useState, useEffect } from 'react';
import { Calendar, ExternalLink, X, MapPin, Mail, ArrowUp, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getBookingUrl } from '@/lib/booking-url';
import { formatDate, formatNumber, getDisplayPrice } from '@/lib/format';

const CATEGORY_STYLES: Record<string, string> = {
  GOOD_DEAL: 'bg-green-100 text-green-700',
  MAYBE_GOOD_DEAL: 'bg-yellow-100 text-yellow-700',
  OKAY_DEAL: 'bg-blue-100 text-blue-700',
  BAD_DEAL: 'bg-gray-100 text-gray-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  GOOD_DEAL: 'GOOD DEAL',
  MAYBE_GOOD_DEAL: 'MAYBE GOOD DEAL',
  OKAY_DEAL: 'OKAY DEAL',
  BAD_DEAL: 'OTHER DEAL',
};

interface DealModalProps {
  deal: any;
  onClose: () => void;
}

export function DealModal({ deal, onClose }: DealModalProps) {
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [emailMessage, setEmailMessage] = useState('');
  const [itinerary, setItinerary] = useState<string | null>(deal.itinerary || null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (deal.category !== 'GOOD_DEAL' || itinerary || isGenerating) return;

    setIsGenerating(true);
    fetch('/api/itinerary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId: deal.id })
    })
      .then(res => res.json())
      .then(data => {
        if (data.itinerary) {
          setItinerary(data.itinerary);
        }
      })
      .catch(err => console.error('Failed to generate itinerary:', err))
      .finally(() => setIsGenerating(false));
  }, [deal, itinerary, isGenerating]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  const dp = getDisplayPrice(deal);

  const handleSendEmail = async () => {
    if (!email) return;
    setEmailStatus('sending');
    setEmailMessage('');

    try {
      const res = await fetch('/api/email-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, dealId: deal.id })
      });

      const data = await res.json();

      if (res.ok) {
        setEmailStatus('sent');
        setEmailMessage('Itinerary sent! Check your inbox.');
        setEmail('');
      } else {
        setEmailStatus('error');
        setEmailMessage(data.error || 'Failed to send email.');
      }
    } catch (error) {
      setEmailStatus('error');
      setEmailMessage('Network error. Please try again.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex md:items-center justify-center bg-black/60 md:p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div id="deal-modal" className="bg-white md:rounded-2xl shadow-2xl w-full h-[95dvh] md:h-auto md:max-w-6xl md:max-h-[90vh] overflow-y-auto md:overflow-hidden flex flex-col md:flex-row relative">
        <button
          onClick={onClose}
          className="fixed md:absolute top-4 right-4 z-50 p-2 bg-white/90 hover:bg-gray-100 rounded-full border border-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Left: flight details & booking */}
        <div className={`w-full bg-gray-50 p-4 pt-12 md:p-8 border-b md:border-b-0 border-gray-200 flex flex-col justify-start items-center text-center shrink-0 md:max-h-full md:overflow-y-auto ${deal.category === 'GOOD_DEAL' ? 'md:w-2/5 md:border-r' : 'md:max-w-2xl md:mx-auto'}`}>
          <div className="w-full max-w-sm">
            <span className={`inline-block text-xs font-bold px-2 py-1 rounded mb-3 md:mb-4 ${CATEGORY_STYLES[deal.category] || 'bg-gray-100 text-gray-700'}`}>
              {CATEGORY_LABELS[deal.category] || deal.category.replace('_', ' ')}
            </span>

            <h2 className="text-2xl md:text-3xl font-black mb-1">{deal.originCode} ➔ {deal.destinationCode}</h2>
            <p className="text-gray-500 mb-4 md:mb-6">{deal.airline} • {deal.cabin.replace('_', ' ')}</p>

            <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-gray-200 mb-4 md:mb-6 text-left">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <Calendar size={14} />
                <span>{formatDate(deal.departureDate)}</span>
              </div>
              {deal.returnDate && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <Calendar size={14} />
                  <span>Return: {formatDate(deal.returnDate)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <MapPin size={14} />
                <span className="capitalize">{(deal.tripType || 'ONE_WAY').replace('_', ' ').toLowerCase()}</span>
              </div>
              <div className="border-t border-gray-100 my-3" />
              <div>
                <p className="text-3xl font-bold text-blue-600">{formatNumber(dp.value)} pts</p>
                {dp.suffix && <p className="text-sm text-gray-500">{dp.suffix}</p>}
              </div>
            </div>

            <div className="text-left w-full bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                Why this is a {CATEGORY_LABELS[deal.category].toLowerCase()}
              </h3>
              <p className="text-gray-800 text-sm italic leading-relaxed">
                &ldquo;{deal.reasoning}&rdquo;
              </p>
              {deal.fareType === 'POINTS' && deal.cashPrice && deal.pointsRequired ? (
                <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                  Cash price is the cheapest one-way cash fare found for this airline on Duffel/Google Flights, or a static route estimate when no matching live offer exists.<br />
                  CPP = (Cash Price − Taxes & Fees) ÷ Points Required × 100<br />
                  CPP = (${formatNumber(Number(deal.cashPrice))} − ${formatNumber(Number(deal.taxesAndFees || 0))}) ÷ {formatNumber(Number(deal.pointsRequired))} × 100 = {((Math.max(0, Number(deal.cashPrice) - Number(deal.taxesAndFees || 0)) / Number(deal.pointsRequired)) * 100).toFixed(1)}¢ per point.
                </p>
              ) : null}
            </div>

            <div className="text-left w-full bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Representative cash flight details</h3>
              <p className="text-xs text-gray-500 mb-2 italic">
                Based on the cheapest one-way cash option found for this route and cabin. Your actual award flight may differ in airline, timing, stops, or layover.
              </p>
              {deal.duration !== null && deal.duration !== undefined ? (
                <ul className="text-sm text-gray-700 space-y-1">
                  {deal.cashAirline && (
                    <li><span className="font-medium">Airline:</span> {deal.cashAirline}</li>
                  )}
                  <li><span className="font-medium">Duration:</span> {Math.floor(Number(deal.duration) / 60)}h {Number(deal.duration) % 60}m</li>
                  <li><span className="font-medium">Stops:</span> {Number(deal.stops)}</li>
                  {deal.layoverAirport && (
                    <li>
                      <span className="font-medium">Layover:</span>{' '}
                      First stop in {deal.layoverAirport}
                      {deal.layoverDuration ? ` for ${Math.floor(Number(deal.layoverDuration) / 60)}h ${Number(deal.layoverDuration) % 60}m` : ''}
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No representative cash flight details available for this route/cabin.</p>
              )}
            </div>

            <a
              href={getBookingUrl(deal)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg text-base font-semibold hover:bg-blue-700 transition-colors w-full"
            >
              <ExternalLink size={16} />
              Book This Flight
            </a>

            <div className="mt-6 text-left w-full">
              <label className="block text-sm font-medium text-gray-700 mb-2">Subscribe and email me this itinerary</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <button
                  onClick={handleSendEmail}
                  disabled={emailStatus === 'sending'}
                  className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail size={14} />
                  {emailStatus === 'sending' ? 'Sending...' : 'Send'}
                </button>
              </div>
              {emailMessage && (
                <p className={`text-xs mt-2 ${emailStatus === 'sent' ? 'text-green-600' : 'text-red-600'}`}>
                  {emailMessage}
                </p>
              )}
            </div>
          </div>
        </div>

        {deal.category === 'GOOD_DEAL' && (
          <>
            {/* Right: itinerary */}
            <div className="w-full md:w-3/5 p-4 pt-12 md:p-8 md:overflow-y-auto bg-white md:min-h-0">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-600">
                  <Loader2 size={40} className="animate-spin mb-5 text-blue-600" />
                  <p className="text-lg font-medium tracking-wide">Loading</p>
                </div>
              ) : itinerary ? (
                <div className="prose prose-sm prose-indigo max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      img: (props: any) => (
                        <img
                          {...props}
                          className="w-full h-auto max-h-56 md:max-h-96 object-cover rounded-xl my-4 shadow-sm"
                          alt={props.alt || 'Destination'}
                        />
                      )
                    }}
                  >
                    {itinerary}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  <p>No detailed itinerary for this deal.</p>
                </div>
              )}
            </div>

            {/* Mobile Go to top */}
            <div className="md:hidden w-full p-6 text-center">
              <button
                onClick={() => document.getElementById('deal-modal')?.scrollTo({ top: 0, behavior: 'smooth' })}
                className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                <ArrowUp size={16} />
                Go to top
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
