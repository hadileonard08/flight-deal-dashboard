import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Flight Deal Tracker',
  description: 'Autonomous flight deal tracking and AI itinerary generator for premium cabin award deals from the US to Asia',
  openGraph: {
    title: 'Flight Deal Tracker',
    description: 'Autonomous flight deal tracking and AI itinerary generator for premium cabin award deals from the US to Asia',
    type: 'website',
    url: 'https://flight-deals-dashboard.vercel.app',
    siteName: 'Flight Deal Tracker',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flight Deal Tracker',
    description: 'Autonomous flight deal tracking and AI itinerary generator for premium cabin award deals from the US to Asia',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
