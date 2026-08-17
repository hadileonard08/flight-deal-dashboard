import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { getLogisticsCheck } from '@/agents/logistics-check';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dealId = body.dealId;

    if (!dealId) {
      return NextResponse.json({ error: 'dealId is required' }, { status: 400 });
    }

    const rows = await db
      .select({
        flightId: flights.id,
        originCode: flights.originCode,
        destinationCode: flights.destinationCode,
        airline: flights.airline,
        departureDate: flights.departureDate,
        cabin: flights.cabin,
        duration: flights.duration,
        stops: flights.stops,
        layoverAirport: flights.layoverAirport,
        layoverDuration: flights.layoverDuration,
        aircraftType: flights.aircraftType,
        segments: flights.segments
      })
      .from(deals)
      .innerJoin(flights, eq(deals.flightId, flights.id))
      .where(eq(deals.id, dealId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    const row = rows[0];
    const departureDate = row.departureDate
      ? (row.departureDate instanceof Date ? row.departureDate.toISOString().split('T')[0] : String(row.departureDate).slice(0, 10))
      : '';

    const check = await getLogisticsCheck({
      originCode: row.originCode,
      destinationCode: row.destinationCode,
      airline: row.airline,
      cabin: row.cabin,
      duration: row.duration,
      stops: row.stops,
      layoverAirport: row.layoverAirport,
      layoverDuration: row.layoverDuration,
      aircraftType: row.aircraftType,
      segments: row.segments,
      departureDate
    });

    return NextResponse.json({ check });
  } catch (error) {
    console.error('Failed to generate logistics check:', error);
    return NextResponse.json({ error: 'Failed to generate logistics check' }, { status: 500 });
  }
}
