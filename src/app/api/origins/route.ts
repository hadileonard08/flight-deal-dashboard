import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { CITY_MAP } from '@/lib/city-map';
import { and, eq, count, sql, inArray } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface OriginCity {
  name: string;
  codes: string[];
  count: number;
  categories: Record<string, number>;
  minPoints: number | null;
  minCash: number | null;
}

function getCityCodes(cityName: string): string[] | null {
  const normalizedCity = cityName.trim().toLowerCase();
  const codes = Object.entries(CITY_MAP)
    .filter(([, info]) => info.city.toLowerCase() === normalizedCity)
    .map(([code]) => code);
  return codes.length > 0 ? codes : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const destinationCity = searchParams.get('destinationCity') || undefined;

  const conditions = [];

  if (destinationCity && destinationCity !== 'all') {
    const codes = getCityCodes(destinationCity);
    if (codes) {
      conditions.push(inArray(flights.destinationCode, codes));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      code: flights.originCode,
      category: deals.category,
      dealCount: count(deals.id),
      minPoints: sql<number | null>`MIN(${flights.pointsRequired})`,
      minCash: sql<number | null>`MIN(${flights.cashPrice})`
    })
    .from(deals)
    .innerJoin(flights, eq(deals.flightId, flights.id))
    .where(whereClause)
    .groupBy(flights.originCode, deals.category);

  const cityMap = new Map<string, OriginCity>();

  for (const row of rows) {
    const city = CITY_MAP[row.code]?.city || row.code;
    if (!cityMap.has(city)) {
      cityMap.set(city, {
        name: city,
        codes: [],
        count: 0,
        categories: {},
        minPoints: null,
        minCash: null
      });
    }
    const entry = cityMap.get(city)!;
    entry.codes.push(row.code);
    entry.count += Number(row.dealCount);
    entry.categories[row.category] = (entry.categories[row.category] || 0) + Number(row.dealCount);

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
