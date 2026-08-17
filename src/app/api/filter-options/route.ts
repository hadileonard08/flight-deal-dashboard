import { NextResponse } from 'next/server';
import { db } from '@/db';
import { flights, deals } from '@/db/schema';
import { CITY_MAP } from '@/lib/city-map';
import { resolveAirlineName } from '@/lib/airlines';
import { and, eq, inArray, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

function getCityCodes(cityName: string): string[] | null {
  const normalizedCity = cityName.trim().toLowerCase();
  const codes = Object.entries(CITY_MAP)
    .filter(([, info]) => info.city.toLowerCase() === normalizedCity)
    .map(([code]) => code);
  return codes.length > 0 ? codes : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const originCity = searchParams.get('originCity') || undefined;
  const destinationCity = searchParams.get('destinationCity') || undefined;

  const conditions = [];

  if (originCity && originCity !== 'all') {
    const codes = getCityCodes(originCity);
    if (codes) {
      conditions.push(inArray(flights.originCode, codes));
    }
  }

  if (destinationCity && destinationCity !== 'all') {
    const codes = getCityCodes(destinationCity);
    if (codes) {
      conditions.push(inArray(flights.destinationCode, codes));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [
    origins,
    destinations,
    cabins,
    tripTypes,
    airlines,
    months,
    years,
    weeks,
    categories
  ] = await Promise.all([
    db.selectDistinct({ value: flights.originCode }).from(flights).innerJoin(deals, eq(deals.flightId, flights.id)).where(whereClause),
    db.selectDistinct({ value: flights.destinationCode }).from(flights).innerJoin(deals, eq(deals.flightId, flights.id)).where(whereClause),
    db.selectDistinct({ value: flights.cabin }).from(flights).innerJoin(deals, eq(deals.flightId, flights.id)).where(whereClause),
    db.selectDistinct({ value: flights.tripType }).from(flights).innerJoin(deals, eq(deals.flightId, flights.id)).where(whereClause),
    db.selectDistinct({ value: flights.airline }).from(flights).innerJoin(deals, eq(deals.flightId, flights.id)).where(whereClause),
    db.selectDistinct({ value: sql<number>`EXTRACT(MONTH FROM ${flights.departureDate})` }).from(flights).innerJoin(deals, eq(deals.flightId, flights.id)).where(whereClause),
    db.selectDistinct({ value: sql<number>`EXTRACT(YEAR FROM ${flights.departureDate})` }).from(flights).innerJoin(deals, eq(deals.flightId, flights.id)).where(whereClause),
    db.selectDistinct({ value: sql<number>`EXTRACT(WEEK FROM ${flights.departureDate})` }).from(flights).innerJoin(deals, eq(deals.flightId, flights.id)).where(whereClause),
    db.selectDistinct({ value: deals.category }).from(deals).innerJoin(flights, eq(deals.flightId, flights.id)).where(whereClause)
  ]);

  return NextResponse.json({
    origins: origins.map(r => r.value).sort(),
    destinations: destinations.map(r => r.value).sort(),
    cabins: cabins.map(r => r.value).sort(),
    tripTypes: tripTypes.map(r => r.value).sort(),
    airlines: airlines
      .map(r => ({ code: r.value, name: resolveAirlineName(r.value) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    months: months.map(r => r.value).sort((a, b) => a - b),
    years: years.map(r => r.value).sort((a, b) => a - b),
    weeks: weeks.map(r => r.value).sort((a, b) => a - b),
    categories: categories.map(r => r.value).sort()
  });
}
