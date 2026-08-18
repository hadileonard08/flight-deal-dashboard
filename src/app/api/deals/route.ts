import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { resolveAirlineName, getAirlineInfo } from '@/lib/airlines';
import { getEstimatedCashValue } from '@/lib/config';
import { getFlightDetails } from '@/agents/cash-price';
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

  const limit = Math.min(parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10), 200);
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
  const week = searchParams.get('week') || undefined;
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
    const airlines = airline.split(',').map(s => s.trim()).filter(Boolean);
    if (airlines.length === 1) {
      conditions.push(eq(flights.airline, airlines[0]));
    } else if (airlines.length > 1) {
      conditions.push(inArray(flights.airline, airlines));
    }
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

  if (week && week !== 'all') {
    const weekNum = parseInt(week, 10);
    if (!isNaN(weekNum)) {
      conditions.push(sql`EXTRACT(WEEK FROM ${flights.departureDate}) = ${weekNum}`);
    }
  }

  const orderBy = sortBy === 'date'
    ? [asc(flights.departureDate), asc(deals.id)]
    : sortBy === 'deal'
      ? [
          asc(sql`CASE ${deals.category} WHEN 'GOOD_DEAL' THEN 0 WHEN 'MAYBE_GOOD_DEAL' THEN 1 WHEN 'OKAY_DEAL' THEN 2 ELSE 3 END`),
          asc(flights.pointsRequired),
          asc(deals.id)
        ]
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

  const resolvedDeals = trimmedDeals.map(deal => {
    const info = getAirlineInfo(deal.airline);
    const estimatedCash = getEstimatedCashValue(deal);

    // If no live cash details were captured, recompute the representative
    // cash price and details on the fly so the modal math stays current.
    let cashPrice = deal.cashPrice;
    let cashAirline = deal.cashAirline;
    let duration = deal.duration;
    let stops = deal.stops;
    let layoverAirport = deal.layoverAirport;
    let layoverDuration = deal.layoverDuration;

    if (!cashAirline && estimatedCash) {
      cashPrice = String(estimatedCash);
      const dateStr = deal.departureDate instanceof Date
        ? deal.departureDate.toISOString().split('T')[0]
        : String(deal.departureDate).slice(0, 10);
      const details = getFlightDetails(deal.originCode, deal.destinationCode, deal.cabin, dateStr, deal.airline);
      if (details) {
        duration = details.duration ?? duration;
        stops = details.stops ?? stops;
        layoverAirport = details.layoverAirport ?? layoverAirport;
        layoverDuration = details.layoverDuration ?? layoverDuration;
        cashAirline = details.airlines?.join(', ') ?? cashAirline;
      }
    }

    return {
      ...deal,
      airline: info.name,
      airlineCode: deal.airline,
      airlineDescription: info.description,
      cashPrice,
      cashAirline,
      duration,
      stops,
      layoverAirport,
      layoverDuration
    };
  });

  return NextResponse.json({ deals: resolvedDeals, hasMore });
}
