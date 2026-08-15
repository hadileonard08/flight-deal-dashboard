import type { Metadata } from 'next'
import './globals.css'

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
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
