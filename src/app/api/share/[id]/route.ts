import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../db';
import { sharedTrips } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

// GET /api/share/[id] — fetch a shared trip by ID (public, no auth required).
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const [trip] = await db
      .select()
      .from(sharedTrips)
      .where(eq(sharedTrips.id, id));

    if (!trip) {
      return NextResponse.json({ error: 'Shared trip not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      itinerary: trip.itinerary,
      payload: trip.payload ? JSON.parse(trip.payload) : null,
      createdAt: trip.createdAt,
    });
  } catch (error) {
    console.error('Fetch shared trip error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shared trip' },
      { status: 500 }
    );
  }
}
