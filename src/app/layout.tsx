import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/components/AuthProvider'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://flight-deals-dashboard.vercel.app'),
  title: 'Roam AI — Your AI Travel Companion',
  description: 'Chat with Roam AI to plan your next trip. Get day-by-day itineraries, live flight deals, weather, packing lists, and daily route maps — all in one conversation.',
  openGraph: {
    title: 'Roam AI — Your AI Travel Companion',
    description: 'Chat with Roam AI to plan your next trip. Get day-by-day itineraries, live flight deals, weather, packing lists, and daily route maps — all in one conversation.',
    type: 'website',
    url: '/',
    siteName: 'Roam AI',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Roam AI — Your AI Travel Companion',
    description: 'Chat with Roam AI to plan your next trip. Get day-by-day itineraries, live flight deals, weather, packing lists, and daily route maps — all in one conversation.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="overflow-x-hidden">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
