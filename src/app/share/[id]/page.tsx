'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import WalkersIcon from '@/components/WalkersIcon';

interface SharedTripData {
  id: string;
  title: string;
  destination: string | null;
  itinerary: string;
  payload: any;
  createdAt: string;
}

function slug(text: any): string {
  const str = typeof text === 'string' ? text : Array.isArray(text) ? text.join('') : String(text || '');
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Reusable markdown renderer with consistent component overrides.
function ItineraryMarkdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 id={slug(children)} className="text-xl font-bold text-gray-900 mt-2 mb-1">{children}</h1>,
          h2: ({ children }) => {
            const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : String(children || '');
            const isDayHeading = /^Day\s+\d+/i.test(text);
            return (
              <h2
                id={slug(children)}
                className={`font-bold mt-0 mb-2 ${isDayHeading ? 'text-lg text-blue-700 flex items-center gap-2' : 'text-lg text-gray-900'}`}
              >
                {isDayHeading && <span className="inline-flex items-center justify-center w-7 h-7 bg-blue-600 text-white text-sm rounded-lg font-bold">{text.match(/Day\s+(\d+)/i)?.[1] || ''}</span>}
                {isDayHeading ? text.replace(/^Day\s+\d+\s*[:\-—]?\s*/i, '') : children}
              </h2>
            );
          },
          h3: ({ children }) => <h3 id={slug(children)} className="text-base font-semibold text-gray-800 mt-3 mb-1">{children}</h3>,
          p: ({ children }) => <p className="text-gray-700 leading-relaxed my-2">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc list-inside text-gray-700 my-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside text-gray-700 my-2 space-y-0.5">{children}</ol>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">{children}</a>,
          img: ({ src, alt }) => (
            <figure className="my-3">
              {src && <img src={src} alt={alt || ''} className="rounded-xl shadow-md w-full" loading="lazy" />}
              {alt && <figcaption className="text-xs text-gray-400 text-center mt-1">{alt}</figcaption>}
            </figure>
          ),
          blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-200 pl-3 text-gray-600 italic my-2">{children}</blockquote>,
          hr: () => <hr className="border-gray-100 my-4" />,
          table: ({ children }) => <table className="w-full text-sm border-collapse my-3">{children}</table>,
          th: ({ children }) => <th className="border border-gray-200 px-2 py-1 text-left font-semibold bg-gray-50">{children}</th>,
          td: ({ children }) => <td className="border border-gray-200 px-2 py-1">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

// Split itinerary markdown into sections by "Day X" headings so each day
// can be rendered as a visual card with a colored left border.
function renderItineraryMarkdown(markdown: string): React.ReactNode {
  const dayHeadingRegex = /^(#{2,3})\s+(Day\s+\d+.*)$/gm;
  const matches: { index: number; line: string; level: number; title: string }[] = [];
  let m;
  while ((m = dayHeadingRegex.exec(markdown)) !== null) {
    matches.push({ index: m.index, line: m[0], level: m[1].length, title: m[2] });
  }

  if (matches.length === 0) {
    return <ItineraryMarkdown>{markdown}</ItineraryMarkdown>;
  }

  const sections: React.ReactNode[] = [];

  const beforeFirst = markdown.substring(0, matches[0].index).trim();
  if (beforeFirst) {
    sections.push(<ItineraryMarkdown key="intro">{beforeFirst}</ItineraryMarkdown>);
  }

  matches.forEach((match, i) => {
    const start = match.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
    const sectionContent = markdown.substring(start, end).trim();

    sections.push(
      <div
        key={`day-${i}`}
        id={slug(match.title)}
        className="day-card bg-white border-l-4 border-blue-400 rounded-r-xl pl-4 pr-3 py-3 my-4 scroll-mt-20"
      >
        <ItineraryMarkdown>{sectionContent}</ItineraryMarkdown>
      </div>
    );
  });

  return <div className="space-y-1">{sections}</div>;
}

export default function SharedTripPage() {
  const params = useParams();
  const id = params.id as string;
  const [trip, setTrip] = useState<SharedTripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchTrip() {
      try {
        const res = await fetch(`/api/share/${id}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load trip');
        }
        const data = await res.json();
        setTrip(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load trip');
      } finally {
        setLoading(false);
      }
    }
    fetchTrip();
  }, [id]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading trip...</p>
        </div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <WalkersIcon className="text-gray-300 mx-auto mb-4" size={48} />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Trip not found</h1>
          <p className="text-gray-500 text-sm">{error || 'This shared trip may have been deleted or the link is invalid.'}</p>
          <a href="/" className="inline-block mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium">
            Plan your own trip →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WalkersIcon className="text-blue-600" size={24} />
            <span className="font-bold text-lg text-gray-900">Jalan</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-1.5"
            >
              {copied ? '✓ Copied!' : '🔗 Copy link'}
            </button>
            <a
              href="/"
              className="text-sm bg-blue-600 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Plan your own trip
            </a>
          </div>
        </div>
      </header>

      {/* Trip content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Trip header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{trip.title}</h1>
          {trip.destination && (
            <p className="text-gray-500 text-sm flex items-center gap-1">
              📍 {trip.destination}
            </p>
          )}
          <p className="text-gray-400 text-xs mt-2">
            Shared {new Date(trip.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Itinerary */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {renderItineraryMarkdown(trip.itinerary)}
        </div>

        {/* Destination image */}
        {trip.payload?.images?.destination && (
          <div className="mt-6 rounded-2xl overflow-hidden shadow-sm border border-gray-100">
            <img
              src={trip.payload.images.destination}
              alt={trip.destination || 'Destination'}
              className="w-full h-48 object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 mb-4">
          <p className="text-gray-400 text-sm mb-3">Want a trip like this?</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 bg-blue-600 text-white font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
          >
            <WalkersIcon className="text-white" size={20} />
            Plan your own trip with Jalan
          </a>
        </div>
      </main>
    </div>
  );
}
