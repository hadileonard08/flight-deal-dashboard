import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '../../../db';
import { dealAlerts } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// GET /api/deal-alerts — list all alerts for the current user.
export async function GET() {
  try {
    const userId = auth().userId;
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const alerts = await db
      .select()
      .from(dealAlerts)
      .where(eq(dealAlerts.userId, userId))
      .orderBy(desc(dealAlerts.createdAt));

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('Deal alerts GET error:', error);
    return NextResponse.json({ error: 'Failed to load alerts' }, { status: 500 });
  }
}

// POST /api/deal-alerts — create a new deal alert.
// Body: { origin?, destination?, cabin?, month?, minCPP? }
export async function POST(req: NextRequest) {
  try {
    const userId = auth().userId;
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the user's email from Clerk.
    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: 'No email address found' }, { status: 400 });
    }

    const body = await req.json();
    const { origin, destination, cabin, month, minCPP } = body;

    const [alert] = await db
      .insert(dealAlerts)
      .values({
        userId,
        email,
        origin: origin || null,
        destination: destination || null,
        cabin: cabin || null,
        month: month || null,
        minCPP: minCPP || '1.5',
      })
      .returning();

    return NextResponse.json({ alert });
  } catch (error) {
    console.error('Deal alerts POST error:', error);
    return NextResponse.json({ error: 'Failed to create alert' }, { status: 500 });
  }
}
