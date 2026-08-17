'use client';

import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Plane, Loader2, Filter, MapPin, ArrowRight } from 'lucide-react';
import { DealCard } from '@/components/DealCard';
import { DealModal } from '@/components/DealModal';
import { formatNumber } from '@/lib/format';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const PAGE_SIZE = 20;
const BATCH_SIZE = 200;

const CATEGORY_ORDER: Record<string, number> = {
  GOOD_DEAL: 0,
  MAYBE_GOOD_DEAL: 1,
  OKAY_DEAL: 2,
  BAD_DEAL: 3,
};

const CATEGORY_LABELS: Record<string, string> = {
  GOOD_DEAL: 'GOOD DEAL',
  MAYBE_GOOD_DEAL: 'MAYBE GOOD DEAL',
  OKAY_DEAL: 'OKAY DEAL',
  BAD_DEAL: 'OTHER DEAL',
};

const PILL_LABELS: Record<string, string> = {
  GOOD_DEAL: 'GOOD',
  MAYBE_GOOD_DEAL: 'MAYBE',
  OKAY_DEAL: 'OKAY',
  BAD_DEAL: 'OTHER',
};

const PILL_STYLES: Record<string, string> = {
  GOOD_DEAL: 'bg-green-100 text-green-700',
  MAYBE_GOOD_DEAL: 'bg-yellow-100 text-yellow-700',
  OKAY_DEAL: 'bg-blue-100 text-blue-700',
  BAD_DEAL: 'bg-gray-100 text-gray-700',
};

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface DealPage {
  deals: any[];
  hasMore: boolean;
}

interface AirlineOption {
  code: string;
  name: string;
}

interface FilterOptions {
  categories: string[];
  cabins: string[];
  tripTypes: string[];
  airlines: AirlineOption[];
  months: string[];
  years: string[];
}

interface BrowseCity {
  name: string;
  codes: string[];
  count: number;
  categories: Record<string, number>;
  minPoints: number | null;
  minCash: number | null;
}

function OriginCard({
  city,
  isActive,
  onClick
}: {
  city: BrowseCity;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left w-full bg-white p-4 rounded-xl shadow-sm border transition-all hover:shadow-md hover:border-blue-200 ${
        isActive ? 'border-blue-600 ring-1 ring-blue-600' : 'border-gray-100'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-blue-600">
          <MapPin size={18} />
          <h2 className="text-lg font-bold text-gray-900">{city.name}</h2>
        </div>
        <ArrowRight size={16} className="text-gray-400" />
      </div>
      <p className="text-xs text-gray-500 mb-1">{city.count.toLocaleString()} deal{city.count === 1 ? '' : 's'}</p>
      <p className="text-xs text-gray-500 font-medium mb-2">
        {city.minPoints !== null
          ? `From ${formatNumber(city.minPoints)} pts`
          : city.minCash !== null
            ? `From $${Number(city.minCash).toLocaleString()} cash`
            : 'Explore deals'}
      </p>
      <div className="flex flex-wrap gap-1">
        {Object.entries(city.categories)
          .sort(([a], [b]) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99))
          .map(([cat, count]) => (
            <span
              key={cat}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PILL_STYLES[cat] || 'bg-gray-100 text-gray-600'}`}
            >
              {PILL_LABELS[cat] || cat.replace('_', ' ')} {count.toLocaleString()}
            </span>
          ))}
      </div>
    </button>
  );
}

export default function DestinationCityPage() {
  const params = useParams();
  const city = decodeURIComponent(params.city as string);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCabin, setSelectedCabin] = useState('all');
  const [selectedTripType, setSelectedTripType] = useState('all');
  const [selectedAirline, setSelectedAirline] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [isGridExpanded, setIsGridExpanded] = useState(false);
  const [sortBy, setSortBy] = useState('deal');

  const [targetPage, setTargetPage] = useState(0);
  const [selectedDeal, setSelectedDeal] = useState<any | null>(null);

  const filterOptionsUrl = selectedOrigin
    ? `/api/filter-options?destinationCity=${encodeURIComponent(city)}${selectedOrigin !== 'all' ? `&originCity=${encodeURIComponent(selectedOrigin)}` : ''}`
    : null;

  const { data: filterOptions } = useSWR<FilterOptions>(filterOptionsUrl, fetcher, { refreshInterval: 60000 });

  const { data: origins } = useSWR<BrowseCity[]>(
    `/api/origins?destinationCity=${encodeURIComponent(city)}`,
    fetcher,
    { refreshInterval: 60000 }
  );

  useEffect(() => {
    setTargetPage(0);
  }, [city, selectedCategory, selectedCabin, selectedTripType, selectedAirline, selectedMonth, selectedYear, selectedOrigin, sortBy]);

  const getKey = (batchIndex: number, previousPageData: DealPage | null) => {
    if (!selectedOrigin) return null;
    if (previousPageData && !previousPageData.hasMore) return null;
    const page = batchIndex + 1;

    const params = new URLSearchParams();
    params.set('destinationCity', city);
    params.set('limit', String(BATCH_SIZE));
    params.set('page', String(page));
    params.set('sortBy', sortBy);
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (selectedCabin !== 'all') params.set('cabin', selectedCabin);
    if (selectedTripType !== 'all') params.set('tripType', selectedTripType);
    if (selectedAirline !== 'all') params.set('airline', selectedAirline);
    if (selectedMonth !== 'all') params.set('month', selectedMonth);
    if (selectedYear !== 'all') params.set('year', selectedYear);
    if (selectedOrigin !== 'all') params.set('originCity', selectedOrigin);

    return `/api/deals?${params.toString()}`;
  };

  const { data: pages, error, size, setSize, isLoading } = useSWRInfinite<DealPage>(getKey, fetcher);

  useEffect(() => {
    if (!pages) return;
    const neededBatches = Math.floor(targetPage / 10) + 1;
    const lastPage = pages[pages.length - 1];
    if (neededBatches > size && lastPage?.hasMore) {
      setSize(neededBatches);
    }
  }, [targetPage, size, pages, setSize]);

  const allDeals = useMemo(() => (pages ? pages.flatMap(page => page.deals) : []), [pages]);
  const loadedPageCount = Math.max(1, Math.ceil(allDeals.length / PAGE_SIZE));
  const hasMore = pages ? pages[pages.length - 1]?.hasMore : true;

  const currentDeals = useMemo(() => {
    const start = targetPage * PAGE_SIZE;
    return allDeals.slice(start, start + PAGE_SIZE);
  }, [allDeals, targetPage]);

  const isLoadingPage = isLoading || (currentDeals.length === 0 && hasMore);

  const canGoPrev = targetPage > 0;
  const canGoNext = !isLoading && (targetPage < loadedPageCount - 1 || hasMore);

  const goToPage = (page: number) => {
    if (page < 0) return;
    setTargetPage(page);
  };

  const goNext = () => goToPage(targetPage + 1);
  const goPrev = () => goToPage(targetPage - 1);

  const categories = (filterOptions?.categories || []).sort((a: string, b: string) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99));
  const cabins = filterOptions?.cabins || [];
  const tripTypes = filterOptions?.tripTypes || [];
  const airlines = filterOptions?.airlines || [];
  const months = filterOptions?.months || [];
  const years = filterOptions?.years || [];

  const pageTitle = selectedOrigin
    ? selectedOrigin === 'all'
      ? `Deals to ${city}`
      : `${selectedOrigin} → ${city} Flight Deals`
    : `Deals to ${city}`;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft size={18} /> Back to cities
        </Link>
        <p className="text-red-600">Failed to load deals for {city}.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft size={18} /> Back to cities
      </Link>

      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Plane className="text-blue-600" /> {pageTitle}
          </h1>
          <p className="text-gray-600">
            {!selectedOrigin
              ? 'Choose an origin city below to explore deals.'
              : pages
                ? `${allDeals.length.toLocaleString()} deal${allDeals.length === 1 ? '' : 's'} loaded`
                : 'Loading deals...'}
            {selectedOrigin && hasMore && ' — more available'}
          </p>
          {selectedOrigin && (
            <button
              onClick={() => { setSelectedOrigin(null); setIsGridExpanded(false); }}
              className="text-sm text-blue-600 hover:text-blue-800 mt-1 underline"
            >
              Change origin
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500">by: hadileonard</p>
      </div>

      {/* Origin selector */}
      {!selectedOrigin && origins && origins.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Choose an origin</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <button
              onClick={() => setSelectedOrigin('all')}
              className="text-left w-full bg-white p-4 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md hover:border-blue-200"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-blue-600">
                  <Plane size={18} />
                  <h2 className="text-lg font-bold text-gray-900">All</h2>
                </div>
                <ArrowRight size={16} className="text-gray-400" />
              </div>
              <p className="text-xs text-gray-500">{origins.reduce((sum, o) => sum + o.count, 0).toLocaleString()} deals</p>
            </button>

            {(isGridExpanded ? origins : origins.slice(0, 3)).map(origin => (
              <OriginCard
                key={origin.name}
                city={origin}
                isActive={false}
                onClick={() => setSelectedOrigin(origin.name)}
              />
            ))}

            {!isGridExpanded && origins.length > 3 && (
              <button
                onClick={() => setIsGridExpanded(true)}
                className="text-left w-full bg-white p-4 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md hover:border-blue-200 flex flex-col justify-center h-full"
              >
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-bold text-gray-900">...</h2>
                  <ArrowRight size={16} className="text-gray-400" />
                </div>
                <p className="text-xs text-gray-500">{origins.length - 3} more origins</p>
              </button>
            )}
          </div>
        </div>
      )}

      {selectedOrigin && (
        <>
          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter size={18} className="text-gray-500" />
                <span className="font-medium text-gray-700">Filters:</span>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Category:</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="border rounded px-3 py-1 text-sm"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat: string) => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Airline:</label>
                <select
                  value={selectedAirline}
                  onChange={(e) => setSelectedAirline(e.target.value)}
                  className="border rounded px-3 py-1 text-sm"
                >
                  <option value="all">All Airlines</option>
                  {airlines.map((airline: AirlineOption) => (
                    <option key={airline.code} value={airline.code}>{airline.name}</option>
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
                  {cabins.map((cabin: string) => (
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
                  {tripTypes.map((trip: string) => (
                    <option key={trip} value={trip}>{trip.replace('_', ' ')}</option>
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
                  {months.map((month: string) => (
                    <option key={month} value={month}>{monthNames[parseInt(month, 10) - 1] || month}</option>
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
                  {years.map((year: string) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <label className="text-sm text-gray-600">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="border rounded px-3 py-1 text-sm"
                >
                  <option value="deal">Deals</option>
                  <option value="price">Points</option>
                  <option value="date">Date</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {currentDeals.map((deal: any) => (
              <DealCard key={deal.id} deal={deal} onClick={() => setSelectedDeal(deal)} />
            ))}

            {isLoadingPage && (
              <>
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-48 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                    <div className="h-8 bg-gray-200 rounded w-2/3 mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </div>
                ))}
              </>
            )}
          </div>

          {!isLoadingPage && currentDeals.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Plane size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No deals found for {city} with the selected filters.</p>
            </div>
          )}

          {loadedPageCount > 1 && (
            <div className="flex flex-col items-center gap-4 mt-10">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={goPrev}
                  disabled={!canGoPrev}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
              >
                  <ChevronLeft size={20} />
                </button>

                <div className="flex flex-wrap items-center justify-center gap-1">
                  {Array.from({ length: loadedPageCount }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => goToPage(i)}
                      className={`min-w-[2.25rem] h-9 px-2 rounded-lg text-sm font-medium border transition-colors ${
                        i === targetPage
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  {hasMore && (
                    <span className="text-gray-400 px-1">...</span>
                  )}
                </div>

                <button
                  onClick={goNext}
                  disabled={!canGoNext}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
              >
                  <ChevronRight size={20} />
                </button>
              </div>

              <p className="text-sm text-gray-500">
                Page {targetPage + 1} of {loadedPageCount}
                {isLoading && <span className="inline-flex items-center gap-1 ml-2"><Loader2 size={14} className="animate-spin" /> Loading more...</span>}
              </p>
            </div>
          )}
        </>
      )}

      {selectedDeal && <DealModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} />}
    </div>
  );
}
