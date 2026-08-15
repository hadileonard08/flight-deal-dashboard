"use client";
import useSWR from 'swr';
import { Plane, Sparkles, Filter, DollarSign, Search, Calendar, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';

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

const AIRLINE_BOOKING_URLS: Record<string, string> = {
  'Alaska Airlines': 'https://www.alaskaair.com',
  'American': 'https://www.aa.com',
  'American Airlines': 'https://www.aa.com',
  'Cathay Pacific': 'https://www.cathaypacific.com',
  'Delta': 'https://www.delta.com',
  'Delta Air Lines': 'https://www.delta.com',
  'United': 'https://www.united.com',
  'United Airlines': 'https://www.united.com',
  'AC': 'https://www.aircanada.com',
  'Air Canada': 'https://www.aircanada.com',
  'Korean Air': 'https://www.koreanair.com',
  'Korean Airlines': 'https://www.koreanair.com',
  'Asiana Airlines': 'https://www.flyasiana.com',
  'JAL': 'https://www.jal.co.jp',
  'Japan Airlines': 'https://www.jal.co.jp',
  'ANA': 'https://www.ana.co.jp',
  'All Nippon Airways': 'https://www.ana.co.jp',
  'Lufthansa': 'https://www.lufthansa.com',
  'Singapore Airlines': 'https://www.singaporeair.com',
  'EVA Air': 'https://www.evaair.com',
  'Qatar Airways': 'https://www.qatarairways.com',
  'Emirates': 'https://www.emirates.com',
  'Etihad Airways': 'https://www.etihad.com',
  'Turkish Airlines': 'https://www.turkishairlines.com',
  'Hawaiian Airlines': 'https://www.hawaiianairlines.com',
  'Air France': 'https://www.airfrance.com',
  'KLM': 'https://www.klm.com',
  'British Airways': 'https://www.britishairways.com',
};

function getBookingUrl(deal: any): string {
  const airline = (deal.airline || '').trim();
  const mapped = AIRLINE_BOOKING_URLS[airline];
  if (mapped && (!deal.bookingUrl || deal.bookingUrl.includes('seats.aero'))) {
    return mapped;
  }
  return deal.bookingUrl || `https://www.google.com/travel/flights?q=flights%20from%20${deal.originCode}%20to%20${deal.destinationCode}`;
}

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

  if (error) return <div className="p-10">Failed to load deals</div>;
  if (!deals) return <div className="p-10">Loading deals...</div>;

  // Get unique filter options
  const origins = Array.from(new Set<string>(deals.map((d: any) => d.originCode)));
  const destinations = Array.from(new Set<string>(deals.map((d: any) => d.destinationCode)));
  const cabins = Array.from(new Set<string>(deals.map((d: any) => d.cabin)));
  const categories = Array.from(new Set<string>(deals.map((d: any) => d.category)));
  const tripTypes = Array.from(new Set<string>(deals.map((d: any) => d.tripType)));
  const months = Array.from(new Set<number>(deals.map((d: any) => new Date(d.departureDate).getMonth()))).sort((a, b) => a - b);
  const years = Array.from(new Set<number>(deals.map((d: any) => new Date(d.departureDate).getFullYear()))).sort((a, b) => a - b);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const simulatedCount = deals.filter((d: any) => d.isSimulated).length;

  // Filter deals
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

  // Sort deals - good deals always come first, then by the chosen sort within each category
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
          <div key={deal.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative">
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

            {deal.itinerary && (
              <div className="mb-4 bg-slate-50 p-4 rounded-lg text-sm max-h-96 overflow-y-auto">
                <h4 className="font-bold flex items-center gap-1 mb-2 text-indigo-700">
                  <Sparkles size={14}/> AI Itinerary
                </h4>
                <div className="prose prose-sm prose-indigo max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {deal.itinerary}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            
            <p className="text-gray-700 text-sm mb-4 border-l-2 border-blue-200 pl-3">
              "{deal.reasoning}"
            </p>

            <a 
              href={getBookingUrl(deal)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors mb-4"
            >
              <ExternalLink size={14} />
              Book This Flight
            </a>
          </div>
        ))}
      </div>

      {sortedDeals.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Plane size={48} className="mx-auto mb-4 text-gray-300"/>
          <p>No deals match your current filters</p>
        </div>
      )}
    </div>
  );
}
