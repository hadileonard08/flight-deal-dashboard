import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { mergeAnonymousSession } from '@/lib/chat-db';

function getAuthUserId(): string | null {
  try {
    return auth().userId || null;
  } catch {
    return null;
  }
}

export async function POST() {
  const userId = getAuthUserId();
  const cookieStore = cookies();
  const sessionId = cookieStore.get('anonymous-session-id')?.value;

  if (!userId) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  if (!sessionId) {
    return Response.json({ merged: 0 });
  }

  await mergeAnonymousSession(userId, sessionId);
  return Response.json({ merged: true });
}
