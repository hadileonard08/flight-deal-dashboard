import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../db';
import { sharedTrips, conversations, messages } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';

// POST /api/share — create a shareable link for a conversation's latest itinerary.
// Body: { conversationId: string, userId?: string }
// Returns: { shareId: string, url: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationId, userId } = body;

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    // Fetch the conversation to get metadata (title, destination).
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Fetch the most recent assistant message with a payload (the itinerary).
    const recentMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(20);

    // Find the latest assistant message that has a payload with itinerary data.
    let itinerary = '';
    let payload: any = null;

    for (const msg of recentMessages) {
      if (msg.role !== 'assistant') continue;
      if (!msg.payload) continue;
      try {
        const parsed = JSON.parse(msg.payload);
        if (parsed.itinerary || msg.content.length > 200) {
          itinerary = msg.content;
          payload = parsed;
          break;
        }
      } catch {
        // If payload doesn't parse, check content length.
        if (msg.content.length > 200) {
          itinerary = msg.content;
          break;
        }
      }
    }

    if (!itinerary) {
      return NextResponse.json({ error: 'No itinerary found in this conversation' }, { status: 404 });
    }

    // Extract destination from conversation metadata or payload.
    let destination = '';
    try {
      if (conversation.metadata) {
        const meta = JSON.parse(conversation.metadata);
        destination = meta.destination || '';
      }
    } catch { /* ignore */ }
    if (!destination && payload?.entities?.destination) {
      destination = payload.entities.destination;
    }

    const title = conversation.title || (destination ? `Trip to ${destination}` : 'Shared Trip');

    // Create the shared trip record.
    const [shared] = await db
      .insert(sharedTrips)
      .values({
        conversationId,
        userId: userId || null,
        title,
        destination: destination || null,
        itinerary,
        payload: payload ? JSON.stringify(payload) : null,
      })
      .returning();

    const url = `${req.nextUrl.origin}/share/${shared.id}`;

    return NextResponse.json({ shareId: shared.id, url });
  } catch (error) {
    console.error('Share API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create share link' },
      { status: 500 }
    );
  }
}

// GET /api/share/[id] — fetch a shared trip by ID.
// This is handled by the dynamic route below.
