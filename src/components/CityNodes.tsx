'use client';

import useSWR from 'swr';
import { MapPin } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface City {
  name: string;
  codes: string[];
  count: number;
}

interface CityNodesProps {
  endpoint: '/api/cities' | '/api/origins';
  label: string;
  selectedCity: string;
  onSelectCity: (city: string) => void;
}

export function CityNodes({ endpoint, label, selectedCity, onSelectCity }: CityNodesProps) {
  const { data: cities, error } = useSWR<City[]>(endpoint, fetcher, { refreshInterval: 60000 });

  if (error || !cities) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <MapPin size={16} className="text-blue-600" />
        <span className="font-semibold text-sm text-gray-700">{label}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button
          onClick={() => onSelectCity('all')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            selectedCity === 'all'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
          }`}
        >
          All
        </button>
        {cities.map(city => (
          <button
            key={city.name}
            onClick={() => onSelectCity(city.name)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-2 ${
              selectedCity === city.name
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
            }`}
          >
            <span>{city.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${selectedCity === city.name ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {city.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
