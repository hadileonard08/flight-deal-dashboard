import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '../../../../db';
import { dealAlerts } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// PATCH /api/deal-alerts/[id] — update an alert (e.g., toggle active, change minCPP).
// Body: { isActive?, minCPP? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = auth().userId;
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { isActive, minCPP } = body;

    const updates: Record<string, any> = {};
    if (isActive !== undefined) updates.isActive = isActive;
    if (minCPP !== undefined) updates.minCPP = minCPP;

    const [updated] = await db
      .update(dealAlerts)
      .set(updates)
      .where(and(eq(dealAlerts.id, params.id), eq(dealAlerts.userId, userId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json({ alert: updated });
  } catch (error) {
    console.error('Deal alerts PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}

// DELETE /api/deal-alerts/[id] — delete an alert.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = auth().userId;
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [deleted] = await db
      .delete(dealAlerts)
      .where(and(eq(dealAlerts.id, params.id), eq(dealAlerts.userId, userId)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Deal alerts DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete alert' }, { status: 500 });
  }
}
