import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { getRecentConversations } from '@/lib/chat-db';

function getAuthUserId(): string | null {
  try {
    return auth().userId || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const userId = getAuthUserId();
  const cookieStore = cookies();
  const sessionId = cookieStore.get('anonymous-session-id')?.value;

  const conversations = await getRecentConversations({ userId, sessionId });
  return Response.json({ conversations });
}
