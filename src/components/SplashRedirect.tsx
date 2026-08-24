'use client';

import { useEffect, useState } from 'react';
import { Plane, ArrowRight } from 'lucide-react';

const SPLASH_COOKIE = 'roam-ai-welcomed';
const REDIRECT_SECONDS = 5;

export default function SplashRedirect({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(false);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    // Check if the user has already seen the splash.
    const seen = document.cookie
      .split('; ')
      .some((c) => c.startsWith(`${SPLASH_COOKIE}=true`));

    if (!seen) {
      setShowSplash(true);
      // Set cookie so it doesn't show again (1 year).
      document.cookie = `${SPLASH_COOKIE}=true; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
    }
  }, []);

  useEffect(() => {
    if (!showSplash) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setShowSplash(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showSplash]);

  if (!showSplash) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex flex-col items-center justify-center text-white px-6">
      {/* Old name fading out */}
      <div className="mb-8 text-center opacity-60">
        <div className="flex items-center justify-center gap-2 text-lg font-medium">
          <Plane size={20} />
          Flight Deal Dashboard
        </div>
        <div className="text-sm mt-1 text-blue-200">has evolved</div>
      </div>

      {/* Arrow */}
      <div className="mb-6">
        <ArrowRight size={32} className="text-blue-300 animate-pulse" />
      </div>

      {/* New name */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="bg-white/20 backdrop-blur-sm p-3 rounded-2xl">
            <Plane size={32} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Roam AI</h1>
        </div>
        <p className="text-blue-100 text-lg max-w-md mx-auto">
          Your AI travel companion. Chat naturally, get full itineraries, live flight deals, and daily route maps — all in one place.
        </p>
      </div>

      {/* Countdown */}
      <div className="mt-12 text-center">
        <div className="text-blue-200 text-sm mb-2">
          Taking you to the new experience in {countdown}...
        </div>
        <button
          onClick={() => setShowSplash(false)}
          className="text-sm bg-white/20 hover:bg-white/30 backdrop-blur-sm px-6 py-2 rounded-full transition-colors"
        >
          Enter now →
        </button>
      </div>
    </div>
  );
}
