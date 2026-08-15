import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const allDeals = await db.select({
    id: deals.id,
    category: deals.category,
    reasoning: deals.reasoning,
    itinerary: deals.itinerary,
    occasion: deals.occasion,
    originCode: flights.originCode,
    destinationCode: flights.destinationCode,
    cashPrice: flights.cashPrice,
    pointsRequired: flights.pointsRequired,
    fareType: flights.fareType,
    airline: flights.airline,
    cabin: flights.cabin,
    departureDate: flights.departureDate,
    returnDate: flights.returnDate,
    tripType: flights.tripType,
    bookingUrl: flights.bookingUrl,
    isSimulated: flights.isSimulated
  })
  .from(deals)
  .innerJoin(flights, eq(deals.flightId, flights.id))
  .orderBy(desc(deals.createdAt));

  return NextResponse.json(allDeals);
}
