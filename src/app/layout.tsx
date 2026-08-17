import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://flight-deals-dashboard.vercel.app'),
  title: 'Flight Deal Tracker',
  description: 'Autonomous flight deal tracking and AI trip planner for US–Asia award and cash deals',
  openGraph: {
    title: 'Flight Deal Tracker',
    description: 'Autonomous flight deal tracking and AI trip planner for US–Asia award and cash deals',
    type: 'website',
    url: '/',
    siteName: 'Flight Deal Tracker',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flight Deal Tracker',
    description: 'Autonomous flight deal tracking and AI trip planner for US–Asia award and cash deals',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="overflow-x-hidden">{children}</body>
    </html>
  )
}
