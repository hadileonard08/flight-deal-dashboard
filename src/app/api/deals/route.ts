import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { resolveAirlineName } from '@/lib/airlines';
import { CITY_MAP } from '@/lib/city-map';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 15;

function getCityCodes(cityName: string): string[] | null {
  const normalizedCity = cityName.trim().toLowerCase();
  const codes = Object.entries(CITY_MAP)
    .filter(([, info]) => info.city.toLowerCase() === normalizedCity)
    .map(([code]) => code);
  return codes.length > 0 ? codes : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limit = Math.min(parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10), 100);
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
  const category = searchParams.get('category') || undefined;
  const destinationCity = searchParams.get('destinationCity') || undefined;
  const destinationCode = searchParams.get('destinationCode') || undefined;
  const origin = searchParams.get('origin') || undefined;
  const originCity = searchParams.get('originCity') || undefined;
  const cabin = searchParams.get('cabin') || undefined;
  const tripType = searchParams.get('tripType') || undefined;
  const airline = searchParams.get('airline') || undefined;
  const month = searchParams.get('month') || undefined;
  const year = searchParams.get('year') || undefined;
  const sortBy = searchParams.get('sortBy') || 'price';

  const conditions = [];

  if (category && category !== 'all') {
    conditions.push(eq(deals.category, category as any));
  }

  if (origin && origin !== 'all') {
    conditions.push(eq(flights.originCode, origin));
  }

  if (originCity && originCity !== 'all') {
    const originCodes = getCityCodes(originCity);
    if (originCodes) {
      conditions.push(inArray(flights.originCode, originCodes));
    }
  }

  if (destinationCode && destinationCode !== 'all') {
    conditions.push(eq(flights.destinationCode, destinationCode));
  }

  if (destinationCity && destinationCity !== 'all') {
    const cityCodes = getCityCodes(destinationCity);
    if (cityCodes) {
      conditions.push(inArray(flights.destinationCode, cityCodes));
    }
  }

  if (cabin && cabin !== 'all') {
    conditions.push(eq(flights.cabin, cabin as any));
  }

  if (tripType && tripType !== 'all') {
    conditions.push(eq(flights.tripType, tripType as any));
  }

  if (airline && airline !== 'all') {
    conditions.push(eq(flights.airline, airline));
  }

  if (month && month !== 'all') {
    const monthNum = parseInt(month, 10);
    if (!isNaN(monthNum)) {
      conditions.push(sql`EXTRACT(MONTH FROM ${flights.departureDate}) = ${monthNum}`);
    }
  }

  if (year && year !== 'all') {
    const yearNum = parseInt(year, 10);
    if (!isNaN(yearNum)) {
      conditions.push(sql`EXTRACT(YEAR FROM ${flights.departureDate}) = ${yearNum}`);
    }
  }

  const orderBy = sortBy === 'date'
    ? [asc(flights.departureDate), asc(deals.id)]
    : [asc(flights.pointsRequired), asc(deals.id)];

  const pageDeals = await db.select({
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
    cashAirline: flights.cashAirline,
    duration: flights.duration,
    stops: flights.stops,
    layoverAirport: flights.layoverAirport,
    layoverDuration: flights.layoverDuration
  })
  .from(deals)
  .innerJoin(flights, eq(deals.flightId, flights.id))
  .where(conditions.length > 0 ? and(...conditions) : undefined)
  .orderBy(...orderBy)
  .limit(limit + 1)
  .offset((page - 1) * limit);

  const hasMore = pageDeals.length > limit;
  const trimmedDeals = hasMore ? pageDeals.slice(0, limit) : pageDeals;

  const resolvedDeals = trimmedDeals.map(deal => ({
    ...deal,
    airline: resolveAirlineName(deal.airline)
  }));

  return NextResponse.json({ deals: resolvedDeals, hasMore });
}
