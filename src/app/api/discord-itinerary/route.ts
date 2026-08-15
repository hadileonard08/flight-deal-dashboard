import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getBookingUrl } from '@/lib/booking-url';

export const dynamic = 'force-dynamic';

function formatDate(date: Date | string | null): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

function extractFirstImageUrl(markdown: string): string | null {
  const match = markdown.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
  return match ? match[1] : null;
}

const CATEGORY_COLORS: Record<string, number> = {
  GOOD_DEAL: 0x22c55e,
  MAYBE_GOOD_DEAL: 0xeab308,
  OKAY_DEAL: 0x3b82f6,
  BAD_DEAL: 0xef4444,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dealId } = body;

    if (!dealId) {
      return NextResponse.json({ error: 'A deal ID is required.' }, { status: 400 });
    }

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl || webhookUrl.includes('your_webhook_id')) {
      return NextResponse.json(
        { error: 'Discord webhook not configured. Add DISCORD_WEBHOOK_URL to your environment variables.' },
        { status: 503 }
      );
    }

    const [result] = await db
      .select({
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
        taxesAndFees: flights.taxesAndFees,
        isSimulated: flights.isSimulated
      })
      .from(deals)
      .innerJoin(flights, eq(deals.flightId, flights.id))
      .where(eq(deals.id, dealId))
      .limit(1);

    if (!result) {
      return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
    }

    const deal = result as any;

    const priceDisplay = deal.fareType === 'POINTS'
      ? `${Number(deal.pointsRequired).toLocaleString()} points${deal.taxesAndFees ? ` + $${Number(deal.taxesAndFees).toLocaleString()} taxes` : ''}`
      : `$${Number(deal.cashPrice).toLocaleString()}`;

    const bookingUrl = getBookingUrl(deal);
    const imageUrl = extractFirstImageUrl(deal.itinerary || '');

    const embed = {
      title: `${deal.originCode} ➔ ${deal.destinationCode} on ${deal.airline}`,
      color: CATEGORY_COLORS[deal.category] || 0x3b82f6,
      description: `**${deal.category.replace('_', ' ')}** — ${deal.reasoning}`,
      fields: [
        { name: 'Route', value: `${deal.originCode} ➔ ${deal.destinationCode}`, inline: true },
        { name: 'Cabin', value: deal.cabin.replace('_', ' '), inline: true },
        { name: 'Date', value: formatDate(deal.departureDate), inline: true },
        { name: 'Price', value: priceDisplay, inline: true },
        { name: 'Trip Type', value: (deal.tripType || 'ONE_WAY').replace('_', ' '), inline: true },
        { name: 'Book', value: `[Book this flight](${bookingUrl})`, inline: true },
      ],
      ...(imageUrl ? { image: { url: imageUrl } } : {})
    };

    const itineraryText = deal.itinerary || 'No detailed itinerary available for this deal.';
    const fileName = `${deal.originCode}-${deal.destinationCode}-itinerary.md`;

    const payload = { embeds: [embed] };
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify(payload));
    formData.append('file', new Blob([itineraryText], { type: 'text/markdown' }), fileName);

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      body: formData
    });

    if (!discordRes.ok) {
      const text = await discordRes.text();
      console.error('Discord webhook error:', text);
      return NextResponse.json({ error: 'Discord webhook rejected the message.', details: text }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Itinerary shared to Discord successfully.' });
  } catch (error) {
    console.error('Discord itinerary error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
