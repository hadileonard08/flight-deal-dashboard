import { NextResponse } from 'next/server';
import { db } from '@/db';
import { flights, deals } from '@/db/schema';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [origins, destinations, cabins, tripTypes, airlines, months, years, weeks, categories] = await Promise.all([
    db.selectDistinct({ value: flights.originCode }).from(flights),
    db.selectDistinct({ value: flights.destinationCode }).from(flights),
    db.selectDistinct({ value: flights.cabin }).from(flights),
    db.selectDistinct({ value: flights.tripType }).from(flights),
    db.selectDistinct({ value: flights.airline }).from(flights),
    db.selectDistinct({ value: sql<number>`EXTRACT(MONTH FROM ${flights.departureDate})` }).from(flights),
    db.selectDistinct({ value: sql<number>`EXTRACT(YEAR FROM ${flights.departureDate})` }).from(flights),
    db.selectDistinct({ value: sql<number>`EXTRACT(WEEK FROM ${flights.departureDate})` }).from(flights),
    db.selectDistinct({ value: deals.category }).from(deals)
  ]);

  return NextResponse.json({
    origins: origins.map(r => r.value).sort(),
    destinations: destinations.map(r => r.value).sort(),
    cabins: cabins.map(r => r.value).sort(),
    tripTypes: tripTypes.map(r => r.value).sort(),
    airlines: airlines.map(r => r.value).sort(),
    months: months.map(r => r.value).sort((a, b) => a - b),
    years: years.map(r => r.value).sort((a, b) => a - b),
    weeks: weeks.map(r => r.value).sort((a, b) => a - b),
    categories: categories.map(r => r.value).sort()
  });
}
