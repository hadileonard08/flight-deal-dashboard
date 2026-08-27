import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { flights, deals } from '@/db/schema';
import { lt, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const MAX_AGE_DAYS = 30;

function verifyCronAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  if (!secret) return true; // allow if no secret configured (local/test)
  return auth === `Bearer ${secret}`;
}

// DELETE /api/cron/cleanup-old-flights
// Removes flights (and their deals via cascade) that are:
//   1. Past their departure date (useless to users)
//   2. Scraped more than MAX_AGE_DAYS ago (stale data)
// This keeps the database within Neon's 0.5 GB free tier limit.
export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}

async function handleCleanup(req: NextRequest) {
  try {
    if (!verifyCronAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();

    // Count what will be deleted first (for logging).
    const beforeCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(flights)
      .where(sql`${flights.departureDate} < ${now} OR ${flights.scrapedAt} < ${cutoff}`);

    const totalBefore = Number(beforeCount[0]?.count || 0);

    // Delete deals first (explicit, even though flights cascade).
    // We delete deals whose flight is past departure or stale.
    await db
      .delete(deals)
      .where(
        sql`${deals.flightId} IN (
          SELECT id FROM flights
          WHERE departure_date < ${now} OR scraped_at < ${cutoff}
        )`
      );

    // Delete old flights.
    const deleted = await db
      .delete(flights)
      .where(
        sql`${flights.departureDate} < ${now} OR ${flights.scrapedAt} < ${cutoff}`
      )
      .returning({ id: flights.id });

    const deletedCount = deleted.length;

    // Get new total.
    const afterCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(flights);
    const totalAfter = Number(afterCount[0]?.count || 0);

    console.log(`Cleanup: removed ${deletedCount} flights (eligible: ${totalBefore}). Remaining: ${totalAfter}.`);

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      remaining: totalAfter,
      cutoff: cutoff.toISOString(),
    });
  } catch (error) {
    console.error('Cleanup cron error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cleanup old flights' },
      { status: 500 }
    );
  }
}
