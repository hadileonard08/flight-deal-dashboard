import { NextRequest, NextResponse } from 'next/server';
import { marked } from 'marked';
import { db } from '@/db';
import { deals, flights } from '@/db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { resend, isEmailConfigured, getFromEmail } from '@/lib/email';
import { getBookingUrl } from '@/lib/booking-url';
import { styleItineraryImages, formatPriceForEmail, formatDateForEmail } from '@/lib/email-formatting';

export const dynamic = 'force-dynamic';

const DASHBOARD_URL = 'https://flight-deals-dashboard.vercel.app';

function verifyCronAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  if (!secret) return true; // allow if no secret configured (local/test)
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  return handleDigest(req);
}

export async function POST(req: NextRequest) {
  return handleDigest(req);
}

async function handleDigest(req: NextRequest) {
  try {
    if (!verifyCronAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: 'Email service not configured. Add RESEND_API_KEY and FROM_EMAIL.' },
        { status: 503 }
      );
    }

    const notificationEmail = process.env.NOTIFICATION_EMAIL;
    if (!notificationEmail) {
      return NextResponse.json(
        { error: 'No notification email configured. Add NOTIFICATION_EMAIL.' },
        { status: 503 }
      );
    }

    const results = await db
      .select({
        id: deals.id,
        category: deals.category,
        reasoning: deals.reasoning,
        itinerary: deals.itinerary,
        occasion: deals.occasion,
        createdAt: deals.createdAt,
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
      .where(eq(deals.category, 'GOOD_DEAL'))
      .orderBy(asc(flights.pointsRequired), asc(flights.cashPrice))
      .limit(5);

    if (results.length === 0) {
      await resend!.emails.send({
        from: getFromEmail(),
        to: notificationEmail,
        subject: 'Your daily flight deal digest — no good deals today',
        text: `Hi there,\n\nNo GOOD_DEAL flight deals were found today.\n\nCheck back later or view the dashboard at ${DASHBOARD_URL}.`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8" /></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px; margin: 0 auto; padding: 24px;">
            <h1 style="color: #2563eb;">Daily Flight Deal Digest</h1>
            <p>No GOOD_DEAL flight deals were found today.</p>
            <p><a href="${DASHBOARD_URL}" style="color: #2563eb;">View the dashboard</a></p>
          </body>
          </html>
        `.trim()
      });

      return NextResponse.json({ success: true, message: 'No good deals today. Digest sent.' });
    }

    const featured = results[0];
    const others = results.slice(1);
    const featuredHtml = styleItineraryImages(
      featured.itinerary ? await marked(featured.itinerary, { gfm: true }) : '<p>No itinerary available.</p>'
    );

    const dealCards = results.map((deal, i) => {
      const bookingUrl = getBookingUrl(deal);
      return `
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <h2 style="margin-top: 0; color: #111827;">${deal.originCode} ➔ ${deal.destinationCode} on ${deal.airline}</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding: 4px 0; color: #6b7280; width: 80px;">Route</td><td style="padding: 4px 0;">${deal.originCode} → ${deal.destinationCode}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Cabin</td><td style="padding: 4px 0;">${deal.cabin.replace('_', ' ')}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Date</td><td style="padding: 4px 0;">${formatDateForEmail(deal.departureDate)}${deal.returnDate ? ` → ${formatDateForEmail(deal.returnDate)}` : ''}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Price</td><td style="padding: 4px 0;">${formatPriceForEmail(deal)}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Category</td><td style="padding: 4px 0;">${deal.category.replace('_', ' ')}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Assessment</td><td style="padding: 4px 0;">${deal.reasoning}</td></tr>
          </table>
          <a href="${bookingUrl}" target="_blank" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; margin-right: 8px;">Book This Flight</a>
          <a href="${DASHBOARD_URL}" target="_blank" style="display: inline-block; background: #f3f4f6; color: #1f2937; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">View Dashboard</a>
          ${i === 0 ? `<div style="margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 24px;"><h3 style="margin-top: 0;">AI Itinerary</h3>${featuredHtml}</div>` : ''}
        </div>
      `;
    }).join('\n');

    const moreCards = others.map((deal) => {
      const bookingUrl = getBookingUrl(deal);
      return `
        <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <strong>${deal.originCode} ➔ ${deal.destinationCode}</strong> on ${deal.airline} — ${formatPriceForEmail(deal)}
          <br />
          <span style="color: #6b7280;">${formatDateForEmail(deal.departureDate)}${deal.returnDate ? ` → ${formatDateForEmail(deal.returnDate)}` : ''}</span>
          <br />
          <a href="${bookingUrl}" style="color: #2563eb; text-decoration: none;">Book</a> ·
          <a href="${DASHBOARD_URL}" style="color: #2563eb; text-decoration: none;">View on dashboard</a>
        </div>
      `;
    }).join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Flight Deal Digest</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px; margin: 0 auto; padding: 24px;">
  <h1 style="color: #2563eb; font-size: 24px; margin-bottom: 8px;">Your Daily Flight Deal Digest</h1>
  <p style="color: #6b7280; margin-bottom: 24px;">${results.length} good deal${results.length === 1 ? '' : 's'} found today.</p>

  ${dealCards}

  ${others.length > 0 ? `
    <h2 style="color: #111827; font-size: 20px; margin-top: 32px; margin-bottom: 16px;">More Good Deals</h2>
    ${moreCards}
  ` : ''}

  <p style="margin-top: 32px; color: #6b7280; font-size: 12px;">You're receiving this because NOTIFICATION_EMAIL is set on the Flight Deal Dashboard. <a href="${DASHBOARD_URL}" style="color: #2563eb;">View the dashboard</a></p>
</body>
</html>
    `.trim();

    const plainText = `
Hi there,

Your daily flight deal digest:

${results.map((deal, i) => `
${i + 1}. ${deal.originCode} → ${deal.destinationCode} on ${deal.airline}
   Cabin: ${deal.cabin.replace('_', ' ')}
   Date: ${formatDateForEmail(deal.departureDate)}${deal.returnDate ? ` → ${formatDateForEmail(deal.returnDate)}` : ''}
   Price: ${formatPriceForEmail(deal)}
   Category: ${deal.category.replace('_', ' ')}
   Book: ${getBookingUrl(deal)}
`).join('\n')}

View the dashboard: ${DASHBOARD_URL}

Happy travels,
Flight Deal Dashboard
    `.trim();

    const send = await resend!.emails.send({
      from: getFromEmail(),
      to: notificationEmail,
      subject: `Your daily flight deal digest — ${results.length} good deal${results.length === 1 ? '' : 's'}`,
      text: plainText,
      html,
    });

    if (send.error) {
      console.error('Resend digest error:', send.error);
      return NextResponse.json({ error: 'Failed to send digest.', details: send.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Digest with ${results.length} deal(s) sent.` });
  } catch (error) {
    console.error('Cron email digest error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
