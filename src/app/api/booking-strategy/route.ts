import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { getBookingStrategy } from '@/agents/booking-strategy';
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
        pointsRequired: flights.pointsRequired,
        taxesAndFees: flights.taxesAndFees,
        bookingUrl: flights.bookingUrl
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

    const strategy = await getBookingStrategy({
      airline: row.airline,
      pointsRequired: row.pointsRequired ?? 0,
      taxesAndFees: row.taxesAndFees ? Number(row.taxesAndFees) : 0,
      cabin: row.cabin,
      originCode: row.originCode,
      destinationCode: row.destinationCode,
      departureDate,
      bookingUrl: row.bookingUrl
    });

    return NextResponse.json({ strategy });
  } catch (error) {
    console.error('Failed to generate booking strategy:', error);
    return NextResponse.json({ error: 'Failed to generate booking strategy' }, { status: 500 });
  }
}
