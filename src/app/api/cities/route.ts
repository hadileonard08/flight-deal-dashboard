import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { CITY_MAP } from '@/lib/city-map';
import { eq, count, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await db
    .select({
      code: flights.destinationCode,
      dealCount: count(deals.id)
    })
    .from(deals)
    .innerJoin(flights, eq(deals.flightId, flights.id))
    .where(eq(deals.category, 'GOOD_DEAL'))
    .groupBy(flights.destinationCode);

  const cityMap = new Map<string, { name: string; codes: string[]; count: number }>();

  for (const row of rows) {
    const city = CITY_MAP[row.code]?.city || row.code;
    if (!cityMap.has(city)) {
      cityMap.set(city, { name: city, codes: [], count: 0 });
    }
    const entry = cityMap.get(city)!;
    entry.codes.push(row.code);
    entry.count += Number(row.dealCount);
  }

  const cities = Array.from(cityMap.values()).sort((a, b) => b.count - a.count);

  return NextResponse.json(cities);
}
