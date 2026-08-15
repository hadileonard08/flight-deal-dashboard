import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Flight Deal Tracker',
  description: 'Autonomous flight deal tracking and honeymoon itinerary generator',
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
