'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useState } from 'react';
import { Plane, MapPin, ArrowRight } from 'lucide-react';
import { formatNumber } from '@/lib/format';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface BrowseCity {
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

function CityCard({ city, href, icon: Icon }: { city: BrowseCity; href: string; icon: typeof Plane }) {
  return (
    <Link
      key={city.name}
      href={href}
      className="group bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between h-full"
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-blue-600">
            <Icon size={20} />
            <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{city.name}</h2>
          </div>
          <ArrowRight size={18} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
        </div>
        <p className="text-sm text-gray-500 mb-1">{city.count.toLocaleString()} deal{city.count === 1 ? '' : 's'}</p>
        <p className="text-sm text-gray-500 font-medium mb-3">
          {city.minPoints !== null
            ? `From ${formatNumber(city.minPoints)} pts`
            : city.minCash !== null
              ? `From $${Number(city.minCash).toLocaleString()} cash`
              : 'Explore deals'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(city.categories)
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
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-32 animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-1/2 mb-3"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<'origins' | 'destinations'>('origins');

  const { data: origins, error: originsError } = useSWR<BrowseCity[]>('/api/origins', fetcher, { refreshInterval: 60000 });
  const { data: destinations, error: destinationsError } = useSWR<BrowseCity[]>('/api/destinations', fetcher, { refreshInterval: 60000 });

  const isLoading = view === 'origins' ? !origins : !destinations;
  const error = view === 'origins' ? originsError : destinationsError;

  const cities = view === 'origins' ? origins : destinations;
  const totalDeals = cities ? cities.reduce((sum, o) => sum + o.count, 0) : 0;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-red-600">Failed to load cities. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Plane className="text-blue-600" /> Flight Deal Dashboard
          </h1>
          <p className="text-gray-600">
            {cities ? `Choose a ${view === 'origins' ? 'departure' : 'destination'} city to explore ${totalDeals.toLocaleString()} deals.` : 'Loading cities...'}
          </p>
        </div>
        <p className="text-sm text-gray-500">by: hadileonard</p>
      </div>

      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setView('origins')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === 'origins'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Browse by Origin
        </button>
        <button
          onClick={() => setView('destinations')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === 'destinations'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Browse by Destination
        </button>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {cities?.map(city => (
            <CityCard
              key={city.name}
              city={city}
              href={view === 'origins' ? `/origin/${encodeURIComponent(city.name)}` : `/destination/${encodeURIComponent(city.name)}`}
              icon={view === 'origins' ? MapPin : Plane}
            />
          ))}
        </div>
      )}
    </div>
  );
}
