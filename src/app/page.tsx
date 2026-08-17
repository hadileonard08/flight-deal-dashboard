'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { Plane, MapPin, ArrowRight } from 'lucide-react';
import { formatNumber } from '@/lib/format';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface OriginCity {
  name: string;
  codes: string[];
  count: number;
  categories: Record<string, number>;
  minPoints: number | null;
  minCash: number | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  GOOD_DEAL: 'GOOD',
  MAYBE_GOOD_DEAL: 'MAYBE',
  OKAY_DEAL: 'OKAY',
  BAD_DEAL: 'OTHER',
};

const CATEGORY_ORDER: Record<string, number> = {
  GOOD_DEAL: 0,
  MAYBE_GOOD_DEAL: 1,
  OKAY_DEAL: 2,
  BAD_DEAL: 3,
};

const CATEGORY_STYLES: Record<string, string> = {
  GOOD_DEAL: 'bg-green-100 text-green-700',
  MAYBE_GOOD_DEAL: 'bg-yellow-100 text-yellow-700',
  OKAY_DEAL: 'bg-blue-100 text-blue-700',
  BAD_DEAL: 'bg-gray-100 text-gray-700',
};

export default function Home() {
  const { data: origins, error } = useSWR<OriginCity[]>('/api/origins', fetcher, { refreshInterval: 60000 });

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-red-600">Failed to load cities. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Plane className="text-blue-600" /> Flight Deal Dashboard
        </h1>
        <p className="text-gray-600">
          {origins ? `Choose a departure city to explore ${origins.reduce((sum, o) => sum + o.count, 0).toLocaleString()} deals.` : 'Loading cities...'}
        </p>
      </div>

      {!origins ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-32 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/2 mb-3"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {origins.map(origin => (
            <Link
              key={origin.name}
              href={`/origin/${encodeURIComponent(origin.name)}`}
              className="group bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between h-full"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-blue-600">
                    <MapPin size={20} />
                    <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{origin.name}</h2>
                  </div>
                  <ArrowRight size={18} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
                </div>
                <p className="text-sm text-gray-500 mb-1">{origin.count.toLocaleString()} deal{origin.count === 1 ? '' : 's'}</p>
                <p className="text-sm text-gray-500 font-medium mb-3">
                  {origin.minPoints !== null
                    ? `From ${formatNumber(origin.minPoints)} pts`
                    : origin.minCash !== null
                      ? `From $${Number(origin.minCash).toLocaleString()} cash`
                      : 'Explore deals'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(origin.categories)
                    .sort(([a], [b]) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99))
                    .map(([cat, count]) => (
                      <span
                        key={cat}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_STYLES[cat] || 'bg-gray-100 text-gray-600'}`}
                        title={`${CATEGORY_LABELS[cat] || cat.replace('_', ' ')} deals`}
                      >
                        {CATEGORY_LABELS[cat] || cat.replace('_', ' ')} {count.toLocaleString()}
                      </span>
                    ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
