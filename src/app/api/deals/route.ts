import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { resolveAirlineName } from '@/lib/airlines';
import { asc, eq } from 'drizzle-orm';

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
    isSimulated: flights.isSimulated,
    duration: flights.duration,
    stops: flights.stops,
    layoverAirport: flights.layoverAirport,
    layoverDuration: flights.layoverDuration
  })
  .from(deals)
  .innerJoin(flights, eq(deals.flightId, flights.id))
  .orderBy(asc(flights.pointsRequired), asc(deals.id))
  .limit(4000);

  const resolvedDeals = allDeals.map(deal => ({
    ...deal,
    airline: resolveAirlineName(deal.airline)
  }));

  return NextResponse.json(resolvedDeals);
}
