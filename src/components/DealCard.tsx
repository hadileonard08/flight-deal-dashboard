'use client';

import { Calendar, Sparkles } from 'lucide-react';
import { formatDate, formatNumber, getDisplayPrice } from '@/lib/format';
import { getAirlineInfo } from '@/lib/airlines';

function formatCash(cash: any): string {
  const n = Number(cash || 0);
  if (!n || n <= 0) return '';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

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

interface DealCardProps {
  deal: any;
  onClick: () => void;
}

export function DealCard({ deal, onClick }: DealCardProps) {
  const dp = getDisplayPrice(deal);
  const airlineInfo = getAirlineInfo(deal.airlineCode || deal.airline);

  return (
    <button
      onClick={onClick}
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
          <p className="text-gray-700 text-sm font-medium">{airlineInfo.name}</p>
          {airlineInfo.description && (
            <p className="text-gray-400 text-xs">{airlineInfo.description}</p>
          )}
          <p className="text-gray-400 text-xs mt-1">{deal.cabin.replace('_', ' ')} • {deal.tripType?.replace('_', ' ') || 'ONE WAY'}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-blue-600">{formatNumber(dp.value)} pts</p>
          {dp.suffix && <p className="text-xs text-gray-500">{dp.suffix}</p>}
          {deal.cashPrice && (deal.cabin === 'BUSINESS' || deal.cabin === 'FIRST') && (
            <p className="text-sm font-semibold text-green-700 mt-1">
              Est. {deal.cabin.replace('_', ' ')}: ${formatCash(deal.cashPrice)}
            </p>
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

      {deal.category === 'GOOD_DEAL' && (
        <div className="flex items-center gap-1 text-sm font-medium text-blue-600 group-hover:text-blue-700">
          <Sparkles size={14} />
          <span>{deal.itinerary ? 'Click to view full itinerary' : 'Click to generate personalized itinerary'}</span>
        </div>
      )}
    </button>
  );
}
