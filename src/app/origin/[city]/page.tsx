'use client';

import useSWRInfinite from 'swr/infinite';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Plane, Loader2 } from 'lucide-react';
import { DealCard } from '@/components/DealCard';
import { DealModal } from '@/components/DealModal';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const PAGE_SIZE = 20;
const BATCH_SIZE = 200;

interface DealPage {
  deals: any[];
  hasMore: boolean;
}

export default function OriginCityPage() {
  const params = useParams();
  const city = decodeURIComponent(params.city as string);
  const [targetPage, setTargetPage] = useState(0);
  const [selectedDeal, setSelectedDeal] = useState<any | null>(null);

  const getKey = (batchIndex: number, previousPageData: DealPage | null) => {
    if (previousPageData && !previousPageData.hasMore) return null;
    const page = batchIndex + 1;
    return `/api/deals?originCity=${encodeURIComponent(city)}&category=GOOD_DEAL&limit=${BATCH_SIZE}&page=${page}&sortBy=price`;
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

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Plane className="text-blue-600" /> {city} Flight Deals
        </h1>
        <p className="text-gray-600">
          {pages ? `${allDeals.length.toLocaleString()} deal${allDeals.length === 1 ? '' : 's'} loaded` : 'Loading deals...'}
          {hasMore && ' — more available'}
        </p>
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
          <p>No deals found for {city}.</p>
        </div>
      )}

      {loadedPageCount > 1 && (
        <div className="flex flex-col items-center gap-4 mt-10">
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              disabled={!canGoPrev}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex items-center gap-1">
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

      {selectedDeal && <DealModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} />}
    </div>
  );
}
