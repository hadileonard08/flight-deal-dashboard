import { NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { generateFullItinerary } from '@/lib/itinerary';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function itineraryNeedsRefresh(itinerary: string, force: boolean): boolean {
  if (force) return true;
  // Re-generate if the stored itinerary is mostly generic destination/flag images
  // instead of daily landmark images.
  const imageMatches = Array.from(itinerary.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g));
  if (imageMatches.length < 2) return true;

  const flagImages = imageMatches.filter(([, url]) =>
    /flag_of|Flag_of|_flag\.|\/flag\/|emblem_of|coat_of_arms/i.test(url)
  );

  // If half or more of the images are flags, regenerate.
  return flagImages.length > 0 && flagImages.length >= imageMatches.length / 2;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dealId = body.dealId;
    const force = body.force === true;

    if (!dealId) {
      return NextResponse.json({ error: 'dealId is required' }, { status: 400 });
    }

    const rows = await db
      .select({
        flightId: flights.id,
        category: deals.category,
        itinerary: deals.itinerary,
        originCode: flights.originCode,
        destinationCode: flights.destinationCode,
        airline: flights.airline,
        departureDate: flights.departureDate,
        returnDate: flights.returnDate,
        cabin: flights.cabin,
        fareType: flights.fareType,
        tripType: flights.tripType,
        cashPrice: flights.cashPrice,
        pointsRequired: flights.pointsRequired,
        taxesAndFees: flights.taxesAndFees,
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
      .where(eq(deals.id, dealId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    const row = rows[0];

    if (row.category !== 'GOOD_DEAL') {
      return NextResponse.json({ error: 'Itinerary generation is only available for GOOD deals' }, { status: 400 });
    }

    if (row.itinerary && row.itinerary.length > 500 && !itineraryNeedsRefresh(row.itinerary, force)) {
      return NextResponse.json({ itinerary: row.itinerary });
    }

    const flight = {
      ...row,
      id: row.flightId,
      cashPrice: row.cashPrice ? Number(row.cashPrice) : null,
      taxesAndFees: row.taxesAndFees ? Number(row.taxesAndFees) : null,
      pointsRequired: row.pointsRequired ?? null
    };

    const { itinerary, occasion } = await generateFullItinerary(flight);

    await db.update(deals)
      .set({ itinerary, occasion: occasion as any })
      .where(eq(deals.id, dealId));

    return NextResponse.json({ itinerary });
  } catch (error) {
    console.error('Failed to generate itinerary:', error);
    return NextResponse.json({ error: 'Failed to generate itinerary' }, { status: 500 });
  }
}
