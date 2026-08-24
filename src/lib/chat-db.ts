import { db } from '../db';
import { conversations, messages } from '../db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { PersistedMessage, ChatPayload, ExtractedEntities } from './chat-state';

export async function getOrCreateConversation({
  conversationId,
  userId,
  sessionId,
  title,
}: {
  conversationId?: string;
  userId?: string | null;
  sessionId?: string | null;
  title?: string;
}) {
  if (conversationId) {
    const [existing] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    if (existing) return existing;
  }

  const [conversation] = await db
    .insert(conversations)
    .values({
      userId: userId || null,
      sessionId: sessionId || null,
      title: title || 'New trip',
    })
    .returning();

  return conversation;
}

export async function loadMessages(conversationId: string): Promise<PersistedMessage[]> {
  const rows = await db
    .select({ role: messages.role, content: messages.content, payload: messages.payload })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  return rows.map((r) => ({
    role: r.role,
    content: r.content,
    payload: r.payload ? JSON.parse(r.payload) : undefined,
  })) as PersistedMessage[];
}

export async function saveMessage(
  conversationId: string,
  message: PersistedMessage
) {
  await db.insert(messages).values({
    conversationId,
    role: message.role,
    content: message.content,
    payload: message.payload ? JSON.stringify(message.payload) : null,
  });

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function updateConversationMetadata(
  conversationId: string,
  metadata: ExtractedEntities
) {
  await db
    .update(conversations)
    .set({ metadata: JSON.stringify(metadata) })
    .where(eq(conversations.id, conversationId));
}

export async function mergeAnonymousSession(userId: string, sessionId: string) {
  await db
    .update(conversations)
    .set({ userId, sessionId: null })
    .where(and(eq(conversations.sessionId, sessionId), isNull(conversations.userId)));
}

export async function getRecentConversations({
  userId,
  sessionId,
  limit = 20,
}: {
  userId?: string | null;
  sessionId?: string | null;
  limit?: number;
}) {
  if (userId) {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);
  }
  if (sessionId) {
    return db
      .select()
      .from(conversations)
      .where(and(eq(conversations.sessionId, sessionId), isNull(conversations.userId)))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);
  }
  return [];
}
