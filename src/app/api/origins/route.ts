import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { CITY_MAP } from '@/lib/city-map';
import { eq, count, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await db
    .select({
      code: flights.originCode,
      dealCount: count(deals.id),
      minPoints: sql<number | null>`MIN(${flights.pointsRequired})`,
      minCash: sql<number | null>`MIN(${flights.cashPrice})`
    })
    .from(deals)
    .innerJoin(flights, eq(deals.flightId, flights.id))
    .where(eq(deals.category, 'GOOD_DEAL'))
    .groupBy(flights.originCode);

  const cityMap = new Map<string, { name: string; codes: string[]; count: number; minPoints: number | null; minCash: number | null }>();

  for (const row of rows) {
    const city = CITY_MAP[row.code]?.city || row.code;
    if (!cityMap.has(city)) {
      cityMap.set(city, { name: city, codes: [], count: 0, minPoints: null, minCash: null });
    }
    const entry = cityMap.get(city)!;
    entry.codes.push(row.code);
    entry.count += Number(row.dealCount);
    if (row.minPoints !== null && (entry.minPoints === null || row.minPoints < entry.minPoints)) {
      entry.minPoints = row.minPoints;
    }
    if (row.minCash !== null && (entry.minCash === null || row.minCash < entry.minCash)) {
      entry.minCash = Number(row.minCash);
    }
  }

  const origins = Array.from(cityMap.values()).sort((a, b) => b.count - a.count);

  return NextResponse.json(origins);
}
