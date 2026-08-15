"use client";
import useSWR from 'swr';
import { Plane, Sparkles, Filter, DollarSign, Search, Calendar, ExternalLink, X, MapPin, Mail } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, useEffect } from 'react';
import { getBookingUrl } from '@/lib/booking-url';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const CATEGORY_STYLES: Record<string, string> = {
  GOOD_DEAL: 'bg-green-100 text-green-700',
  MAYBE_GOOD_DEAL: 'bg-yellow-100 text-yellow-700',
  OKAY_DEAL: 'bg-blue-100 text-blue-700',
  BAD_DEAL: 'bg-red-100 text-red-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  GOOD_DEAL: 'GOOD DEAL',
  MAYBE_GOOD_DEAL: 'MAYBE GOOD DEAL',
  OKAY_DEAL: 'OKAY DEAL',
  BAD_DEAL: 'OTHER DEAL',
};

const CATEGORY_ORDER: Record<string, number> = {
  GOOD_DEAL: 0,
  MAYBE_GOOD_DEAL: 1,
  OKAY_DEAL: 2,
  BAD_DEAL: 3,
};

export default function Dashboard() {
  const { data: deals, error } = useSWR('/api/deals', fetcher, { refreshInterval: 30000 });
  const [selectedOrigin, setSelectedOrigin] = useState<string>('all');
  const [selectedDestination, setSelectedDestination] = useState<string>('all');
  const [selectedCabin, setSelectedCabin] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedTripType, setSelectedTripType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('price');
  const [selectedDeal, setSelectedDeal] = useState<any | null>(null);
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [emailMessage, setEmailMessage] = useState('');

  useEffect(() => {
    if (!selectedDeal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedDeal(null);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = 'unset';
    };
  }, [selectedDeal]);

  if (error) return <div className="p-10">Failed to load deals</div>;
  if (!deals) return <div className="p-10">Loading deals...</div>;

  const origins = Array.from(new Set<string>(deals.map((d: any) => d.originCode)));
  const destinations = Array.from(new Set<string>(deals.map((d: any) => d.destinationCode)));
  const cabins = Array.from(new Set<string>(deals.map((d: any) => d.cabin)));
  const categories = Array.from(new Set<string>(deals.map((d: any) => d.category)));
  const tripTypes = Array.from(new Set<string>(deals.map((d: any) => d.tripType)));
  const months = Array.from(new Set<number>(deals.map((d: any) => new Date(d.departureDate).getMonth()))).sort((a, b) => a - b);
  const years = Array.from(new Set<number>(deals.map((d: any) => new Date(d.departureDate).getFullYear()))).sort((a, b) => a - b);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const simulatedCount = deals.filter((d: any) => d.isSimulated).length;

  const filteredDeals = deals.filter((deal: any) => {
    if (selectedOrigin !== 'all' && deal.originCode !== selectedOrigin) return false;
    if (selectedDestination !== 'all' && deal.destinationCode !== selectedDestination) return false;
    if (selectedCabin !== 'all' && deal.cabin !== selectedCabin) return false;
    if (selectedCategory !== 'all' && deal.category !== selectedCategory) return false;
    if (selectedMonth !== 'all' && new Date(deal.departureDate).getMonth() !== parseInt(selectedMonth)) return false;
    if (selectedYear !== 'all' && new Date(deal.departureDate).getFullYear() !== parseInt(selectedYear)) return false;
    if (selectedTripType !== 'all' && deal.tripType !== selectedTripType) return false;
    return true;
  });

  const sortedDeals = [...filteredDeals].sort((a: any, b: any) => {
    const categoryDiff = (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99);
    if (categoryDiff !== 0) return categoryDiff;

    const aValue = a.fareType === 'POINTS' ? a.pointsRequired : a.cashPrice;
    const bValue = b.fareType === 'POINTS' ? b.pointsRequired : b.cashPrice;
    if (sortBy === 'price') return aValue - bValue;
    if (sortBy === 'date') return new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime();
    return 0;
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${(price / 1000).toFixed(1)}k`;
    return `$${price}`;
  };

  const handleSendEmail = async () => {
    if (!email || !selectedDeal) return;
    setEmailStatus('sending');
    setEmailMessage('');

    try {
      const res = await fetch('/api/email-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, dealId: selectedDeal.id })
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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mb-8">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Plane className="text-blue-600"/> Flight Deal Dashboard
            </h1>
            <p className="text-gray-600">
              Showing {sortedDeals.length} of {deals.length} total deals
            </p>
          </div>
          <p className="text-sm text-gray-500">by: hadileonard</p>
        </div>
        {simulatedCount > 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4 text-sm text-yellow-800">
            <strong>⚠️ {simulatedCount === deals.length ? 'Simulated Data:' : `${simulatedCount} of ${deals.length} deals are simulated:`}</strong> Some flight prices, airlines, and dates shown are generated for demonstration purposes (marked with a badge on each card).
            Add a <a href="https://duffel.com/" target="_blank" rel="noopener noreferrer" className="underline font-medium">free Duffel API token</a> (no affiliate program required) to get real cash-fare data, or a <a href="https://seats.aero/settings" target="_blank" rel="noopener noreferrer" className="underline font-medium">Seats.aero key</a> for real award data.
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4 text-sm text-green-800">
            <strong>✅ Real Data:</strong> All deals shown are from live flight data sources.
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500"/>
            <span className="font-medium text-gray-700">Filters:</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Origin:</label>
            <select
              value={selectedOrigin}
              onChange={(e) => setSelectedOrigin(e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="all">All Origins</option>
              {origins.map(origin => (
                <option key={origin} value={origin}>{origin}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Destination:</label>
            <select
              value={selectedDestination}
              onChange={(e) => setSelectedDestination(e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="all">All Destinations</option>
              {destinations.map(dest => (
                <option key={dest} value={dest}>{dest}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Cabin:</label>
            <select
              value={selectedCabin}
              onChange={(e) => setSelectedCabin(e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="all">All Cabins</option>
              {cabins.map(cabin => (
                <option key={cabin} value={cabin}>{cabin.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Trip Type:</label>
            <select
              value={selectedTripType}
              onChange={(e) => setSelectedTripType(e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="all">All Trip Types</option>
              {tripTypes.map(tripType => (
                <option key={tripType} value={tripType}>{tripType.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Month:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="all">All Months</option>
              {months.map(month => (
                <option key={month} value={month}>{monthNames[month]}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Year:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="all">All Years</option>
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Category:</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="price">Price</option>
              <option value="date">Date</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {sortedDeals.map((deal: any) => (
          <button
            key={deal.id}
            onClick={() => setSelectedDeal(deal)}
            className="text-left bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer w-full group"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className={`text-xs font-bold px-2 py-1 rounded ${CATEGORY_STYLES[deal.category] || 'bg-gray-100 text-gray-700'}`}>
                  {CATEGORY_LABELS[deal.category] || deal.category.replace('_', ' ')}
                </span>
                {deal.isSimulated && (
                  <span className="text-xs font-bold px-2 py-1 rounded bg-orange-100 text-orange-700 ml-1">
                    SIMULATED
                  </span>
                )}
                <h2 className="text-xl font-black mt-2">{deal.originCode} ➔ {deal.destinationCode}</h2>
                <p className="text-gray-500 text-sm">{deal.airline}</p>
                <p className="text-gray-400 text-xs mt-1">{deal.cabin.replace('_', ' ')} • {deal.tripType?.replace('_', ' ') || 'ONE WAY'}</p>
              </div>
              <div className="text-right">
                {deal.fareType === 'POINTS' ? (
                  <>
                    <p className="text-2xl font-bold text-blue-600">{Number(deal.pointsRequired).toLocaleString()} pts</p>
                    {deal.taxesAndFees > 0 && (
                      <p className="text-xs text-gray-500">+${Number(deal.taxesAndFees).toLocaleString()} taxes</p>
                    )}
                  </>
                ) : (
                  <p className="text-2xl font-bold text-blue-600">${Number(deal.cashPrice).toLocaleString()}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
              <Calendar size={14} />
              <span>{formatDate(deal.departureDate)}</span>
              {deal.returnDate && (
                <>
                  <span> → </span>
                  <span>{formatDate(deal.returnDate)}</span>
                </>
              )}
            </div>

            <p className="text-gray-700 text-sm mb-4 border-l-2 border-blue-200 pl-3 line-clamp-3">
              &ldquo;{deal.reasoning}&rdquo;
            </p>

            {deal.itinerary && (
              <div className="flex items-center gap-1 text-sm font-medium text-blue-600 group-hover:text-blue-700">
                <Sparkles size={14} />
                <span>Click to view full itinerary</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {sortedDeals.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Plane size={48} className="mx-auto mb-4 text-gray-300"/>
          <p>No deals match your current filters</p>
        </div>
      )}

      {/* Modal */}
      {selectedDeal && (
        <div
          className="fixed inset-0 z-50 flex md:items-center justify-center bg-black/60 md:p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedDeal(null);
          }}
        >
          <div className="bg-white md:rounded-2xl shadow-2xl w-full h-[95dvh] md:h-auto md:max-w-6xl md:max-h-[90vh] overflow-hidden flex flex-col md:flex-row relative">
            <button
              onClick={() => setSelectedDeal(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-white/90 hover:bg-gray-100 rounded-full border border-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>

            {/* Left: flight details & booking */}
            <div className="w-full md:w-2/5 bg-gray-50 p-4 md:p-8 border-b md:border-b-0 md:border-r border-gray-200 flex flex-col justify-center items-center text-center shrink-0 overflow-y-auto max-h-[42%] md:max-h-full">
              <div className="w-full max-w-sm">
                <span className={`inline-block text-xs font-bold px-2 py-1 rounded mb-3 md:mb-4 ${CATEGORY_STYLES[selectedDeal.category] || 'bg-gray-100 text-gray-700'}`}>
                  {CATEGORY_LABELS[selectedDeal.category] || selectedDeal.category.replace('_', ' ')}
                </span>

                <h2 className="text-2xl md:text-3xl font-black mb-1">{selectedDeal.originCode} ➔ {selectedDeal.destinationCode}</h2>
                <p className="text-gray-500 mb-4 md:mb-6">{selectedDeal.airline} • {selectedDeal.cabin.replace('_', ' ')}</p>

                <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-gray-200 mb-4 md:mb-6 text-left">
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <Calendar size={14} />
                    <span>{formatDate(selectedDeal.departureDate)}</span>
                  </div>
                  {selectedDeal.returnDate && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <Calendar size={14} />
                      <span>Return: {formatDate(selectedDeal.returnDate)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <MapPin size={14} />
                    <span className="capitalize">{(selectedDeal.tripType || 'ONE_WAY').replace('_', ' ').toLowerCase()}</span>
                  </div>
                  <div className="border-t border-gray-100 my-3" />
                  {selectedDeal.fareType === 'POINTS' ? (
                    <div>
                      <p className="text-3xl font-bold text-blue-600">{Number(selectedDeal.pointsRequired).toLocaleString()} pts</p>
                      {selectedDeal.taxesAndFees > 0 && (
                        <p className="text-sm text-gray-500">+ ${Number(selectedDeal.taxesAndFees).toLocaleString()} taxes/fees per traveler</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-3xl font-bold text-blue-600">${Number(selectedDeal.cashPrice).toLocaleString()}</p>
                  )}
                </div>

                <p className="text-gray-700 text-sm mb-6 italic">
                  &ldquo;{selectedDeal.reasoning}&rdquo;
                </p>

                <a
                  href={getBookingUrl(selectedDeal)}
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

            {/* Right: itinerary */}
            <div className="w-full md:w-3/5 p-4 md:p-8 overflow-y-auto bg-white flex-1 min-h-0">
              {selectedDeal.itinerary ? (
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
                    {selectedDeal.itinerary}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  <p>No detailed itinerary for this deal.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
