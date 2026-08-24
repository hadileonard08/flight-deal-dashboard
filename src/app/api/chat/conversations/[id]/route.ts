import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { conversations } from '@/db/schema';
import { deleteConversation } from '@/lib/chat-db';

function getAuthUserId(): string | null {
  try {
    return auth().userId || null;
  } catch {
    return null;
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = getAuthUserId();
  const cookieStore = cookies();
  const sessionId = cookieStore.get('anonymous-session-id')?.value;
  const { id } = params;

  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conversation) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const owns =
    (userId && conversation.userId === userId) ||
    (sessionId && conversation.sessionId === sessionId);

  if (!owns) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await deleteConversation(id);
  return Response.json({ ok: true });
}
