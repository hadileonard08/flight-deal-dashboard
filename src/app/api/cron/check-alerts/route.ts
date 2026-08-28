import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { deals, flights, dealAlerts } from '@/db/schema';
import { eq, and, sql, gte, lte, isNull, desc } from 'drizzle-orm';
import { resend, isEmailConfigured, getFromEmail } from '@/lib/email';
import { getBookingUrl } from '@/lib/booking-url';
import { calculateCPP } from '@/lib/config';

export const dynamic = 'force-dynamic';

const DASHBOARD_URL = 'https://jalan-ai.vercel.app';

function verifyCronAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  if (!secret) return true;
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  return handleAlerts(req);
}

export async function POST(req: NextRequest) {
  return handleAlerts(req);
}

async function handleAlerts(req: NextRequest) {
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

    // Fetch all active alerts.
    const alerts = await db
      .select()
      .from(dealAlerts)
      .where(eq(dealAlerts.isActive, true));

    if (alerts.length === 0) {
      return NextResponse.json({ success: true, message: 'No active alerts.', sent: 0 });
    }

    // Fetch recent GOOD_DEAL flights from the last 24 hours.
    // We join deals + flights to get all the info we need for matching + email.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentDeals = await db
      .select({
        dealId: deals.id,
        category: deals.category,
        reasoning: deals.reasoning,
        flightId: flights.id,
        originCode: flights.originCode,
        destinationCode: flights.destinationCode,
        airline: flights.airline,
        departureDate: flights.departureDate,
        returnDate: flights.returnDate,
        cabin: flights.cabin,
        fareType: flights.fareType,
        cashPrice: flights.cashPrice,
        pointsRequired: flights.pointsRequired,
        taxesAndFees: flights.taxesAndFees,
        bookingUrl: flights.bookingUrl,
        dealCreatedAt: deals.createdAt,
      })
      .from(deals)
      .innerJoin(flights, eq(deals.flightId, flights.id))
      .where(and(eq(deals.category, 'GOOD_DEAL'), gte(deals.createdAt, oneDayAgo)))
      .orderBy(desc(flights.pointsRequired));

    if (recentDeals.length === 0) {
      return NextResponse.json({ success: true, message: 'No new good deals to check against.', sent: 0 });
    }

    let emailsSent = 0;
    const alertsNotified: { alertId: string; dealIds: string[] }[] = [];

    // For each alert, find matching deals and send an email.
    for (const alert of alerts) {
      const matching = recentDeals.filter((d) => dealMatchesAlert(d, alert));
      if (matching.length === 0) continue;

      // Don't spam — only send if we haven't notified this alert in the last 12 hours.
      if (alert.lastNotifiedAt) {
        const hoursSince = (Date.now() - new Date(alert.lastNotifiedAt).getTime()) / (1000 * 60 * 60);
        if (hoursSince < 12) continue;
      }

      // Send the email.
      const emailHtml = buildAlertEmail(alert, matching);
      const emailText = buildAlertText(alert, matching);

      try {
        const result = await resend!.emails.send({
          from: getFromEmail(),
          to: alert.email,
          subject: `✈️ ${matching.length} new deal${matching.length === 1 ? '' : 's'} matching your alert`,
          text: emailText,
          html: emailHtml,
        });

        if (!result.error) {
          emailsSent++;
          alertsNotified.push({
            alertId: alert.id,
            dealIds: matching.map((d) => d.dealId),
          });
        }
      } catch (e) {
        console.error(`Failed to send alert email to ${alert.email}:`, e);
      }
    }

    // Update lastNotifiedAt for all alerts that got an email.
    if (alertsNotified.length > 0) {
      const now = new Date();
      for (const a of alertsNotified) {
        await db
          .update(dealAlerts)
          .set({ lastNotifiedAt: now })
          .where(eq(dealAlerts.id, a.alertId));
      }
    }

    return NextResponse.json({
      success: true,
      alertsChecked: alerts.length,
      newDeals: recentDeals.length,
      emailsSent,
    });
  } catch (error) {
    console.error('Check alerts cron error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check alerts' },
      { status: 500 }
    );
  }
}

// Check if a deal matches an alert's criteria.
function dealMatchesAlert(
  deal: any,
  alert: any
): boolean {
  // Origin filter (null = any origin).
  if (alert.origin && deal.originCode !== alert.origin) return false;

  // Destination filter (null = any destination).
  if (alert.destination && deal.destinationCode !== alert.destination) return false;

  // Cabin filter (null = any cabin).
  if (alert.cabin && deal.cabin !== alert.cabin) return false;

  // Month filter (YYYY-MM, null = any month).
  if (alert.month) {
    const dealMonth = deal.departureDate.toISOString().slice(0, 7);
    if (dealMonth !== alert.month) return false;
  }

  // CPP filter — deal must meet the minimum CPP threshold.
  if (alert.minCPP) {
    const cpp = calculateCPP(deal);
    if (cpp === null || cpp < Number(alert.minCPP)) return false;
  }

  return true;
}

function buildAlertText(alert: any, deals: any[]): string {
  const header = `Hi there,\n\n${deals.length} new deal${deals.length === 1 ? '' : 's'} matching your alert:\n`;
  const criteria = [
    alert.origin && `Origin: ${alert.origin}`,
    alert.destination && `Destination: ${alert.destination}`,
    alert.cabin && `Cabin: ${alert.cabin.replace('_', ' ')}`,
    alert.month && `Month: ${alert.month}`,
    `Min CPP: ${alert.minCPP}`,
  ].filter(Boolean).join('\n');

  const dealList = deals.map((d, i) => {
    const cpp = calculateCPP(d);
    const cppStr = cpp ? `${cpp.toFixed(1)}¢/pt` : 'N/A';
    return `\n${i + 1}. ${d.originCode} → ${d.destinationCode} on ${d.airline}
   Cabin: ${d.cabin.replace('_', ' ')}
   Date: ${d.departureDate.toISOString().slice(0, 10)}
   Points: ${Number(d.pointsRequired).toLocaleString()} pts
   CPP: ${cppStr}
   Book: ${getBookingUrl(d)}`;
  }).join('\n');

  return `${header}\n${criteria}\n${dealList}\n\nView all deals: ${DASHBOARD_URL}\n\nHappy travels,\nJalan`;
}

function buildAlertEmail(alert: any, deals: any[]): string {
  const criteria = [
    alert.origin && `Origin: ${alert.origin}`,
    alert.destination && `Destination: ${alert.destination}`,
    alert.cabin && `Cabin: ${alert.cabin.replace('_', ' ')}`,
    alert.month && `Month: ${alert.month}`,
    `Min CPP: ${alert.minCPP}¢`,
  ].filter(Boolean).join(' · ');

  const dealCards = deals.slice(0, 5).map((d, i) => {
    const cpp = calculateCPP(d);
    const cppStr = cpp ? `${cpp.toFixed(1)}¢/pt` : 'N/A';
    const bookingUrl = getBookingUrl(d);
    return `
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <h3 style="margin-top: 0; color: #111827;">${d.originCode} → ${d.destinationCode} on ${d.airline}</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
          <tr><td style="padding: 4px 0; color: #6b7280; width: 80px;">Cabin</td><td style="padding: 4px 0;">${d.cabin.replace('_', ' ')}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Date</td><td style="padding: 4px 0;">${d.departureDate.toISOString().slice(0, 10)}</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Points</td><td style="padding: 4px 0;">${Number(d.pointsRequired).toLocaleString()} pts</td></tr>
          <tr><td style="padding: 4px 0; color: #6b7280;">Value</td><td style="padding: 4px 0; font-weight: bold; color: #059669;">${cppStr}</td></tr>
        </table>
        <a href="${bookingUrl}" target="_blank" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">Book This Flight</a>
      </div>
    `;
  }).join('\n');

  const moreText = deals.length > 5 ? `<p style="color: #6b7280; font-size: 14px;">+ ${deals.length - 5} more deal${deals.length - 5 === 1 ? '' : 's'} — view all on Jalan.</p>` : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px; margin: 0 auto; padding: 24px;">
  <h1 style="color: #2563eb; font-size: 24px; margin-bottom: 8px;">✈️ ${deals.length} New Deal${deals.length === 1 ? '' : 's'} for You</h1>
  <p style="color: #6b7280; margin-bottom: 8px;">Matching: ${criteria}</p>
  <p style="color: #6b7280; margin-bottom: 24px;">Found in the latest scan.</p>

  ${dealCards}
  ${moreText}

  <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
    <a href="${DASHBOARD_URL}" style="display: inline-block; background: #f3f4f6; color: #1f2937; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">View All Deals on Jalan</a>
    <p style="margin-top: 16px; color: #9ca3af; font-size: 12px;">You're receiving this because you created a deal alert on Jalan. Manage your alerts in the One Stop panel.</p>
  </div>
</body>
</html>
  `.trim();
}
