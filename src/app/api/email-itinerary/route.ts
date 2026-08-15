import { NextRequest, NextResponse } from 'next/server';
import { marked } from 'marked';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { resend, isEmailConfigured, getFromEmail } from '@/lib/email';
import { getBookingUrl } from '@/lib/booking-url';
import { styleItineraryImages } from '@/lib/email-formatting';

export const dynamic = 'force-dynamic';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, dealId } = body;

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }

    if (!dealId) {
      return NextResponse.json({ error: 'A deal ID is required.' }, { status: 400 });
    }

    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: 'Email service is not configured. Add RESEND_API_KEY and FROM_EMAIL to your environment variables.' },
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

    const dealSummary = `
- Route: ${deal.originCode} → ${deal.destinationCode}
- Airline: ${deal.airline}
- Cabin: ${deal.cabin.replace('_', ' ')}
- Date: ${formatDate(deal.departureDate)}${deal.returnDate ? ` → ${formatDate(deal.returnDate)}` : ''}
- Price: ${priceDisplay} per traveler
- Category: ${deal.category.replace('_', ' ')}
- Assessment: ${deal.reasoning}
`.trim();

    const plainText = `
Hi there,

Here is your custom flight deal and AI-generated itinerary.

FLIGHT DEAL
-----------
${dealSummary}

Book this flight: ${bookingUrl}

ITINERARY
---------
${deal.itinerary || 'No detailed itinerary available for this deal.'}

Happy travels,
Flight Deal Dashboard
`.trim();

    const rawHtmlItinerary = deal.itinerary
      ? await marked(deal.itinerary, { gfm: true })
      : '<p>No detailed itinerary available for this deal.</p>';

    const htmlItinerary = styleItineraryImages(rawHtmlItinerary);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Flight Deal Itinerary</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px; margin: 0 auto; padding: 24px;">
  <h1 style="color: #2563eb; font-size: 24px; margin-bottom: 8px;">Your Custom Flight Deal Itinerary</h1>
  <p style="color: #6b7280; margin-bottom: 24px;">${deal.originCode} → ${deal.destinationCode} on ${deal.airline}</p>

  <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 24px;">
    <tr><td style="padding: 8px 16px; font-weight: 600;">Route</td><td style="padding: 8px 16px;">${deal.originCode} → ${deal.destinationCode}</td></tr>
    <tr><td style="padding: 8px 16px; font-weight: 600;">Airline</td><td style="padding: 8px 16px;">${deal.airline}</td></tr>
    <tr><td style="padding: 8px 16px; font-weight: 600;">Cabin</td><td style="padding: 8px 16px;">${deal.cabin.replace('_', ' ')}</td></tr>
    <tr><td style="padding: 8px 16px; font-weight: 600;">Date</td><td style="padding: 8px 16px;">${formatDate(deal.departureDate)}${deal.returnDate ? ` → ${formatDate(deal.returnDate)}` : ''}</td></tr>
    <tr><td style="padding: 8px 16px; font-weight: 600;">Price</td><td style="padding: 8px 16px;">${priceDisplay}</td></tr>
    <tr><td style="padding: 8px 16px; font-weight: 600;">Category</td><td style="padding: 8px 16px;">${deal.category.replace('_', ' ')}</td></tr>
    <tr><td style="padding: 8px 16px; font-weight: 600;">Assessment</td><td style="padding: 8px 16px;">${deal.reasoning}</td></tr>
  </table>

  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${bookingUrl}" target="_blank" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">Book This Flight</a>
  </div>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
    <h2 style="font-size: 20px; margin-bottom: 16px;">AI Itinerary</h2>
    <div style="font-size: 14px; color: #374151;">
      ${htmlItinerary}
    </div>
  </div>

  <p style="margin-top: 32px; color: #6b7280; font-size: 12px;">You received this because someone requested a flight deal itinerary from the Flight Deal Dashboard. If this wasn't you, you can ignore this email.</p>
</body>
</html>
    `.trim();

    const send = await resend!.emails.send({
      from: getFromEmail(),
      to: email,
      subject: `Your custom itinerary: ${deal.originCode} → ${deal.destinationCode} on ${deal.airline}`,
      text: plainText,
      html,
    });

    if (send.error) {
      console.error('Resend error:', send.error);
      return NextResponse.json({ error: 'Failed to send email.', details: send.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Itinerary emailed successfully.' });
  } catch (error) {
    console.error('Email itinerary error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
