import { randomUUID } from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { conversationGraph, generateTitle } from '@/agents/conversation-graph';
import {
  getOrCreateConversation,
  loadMessages,
  saveMessage,
  updateConversationMetadata,
  updateConversationTitle,
} from '@/lib/chat-db';
import type { PersistedMessage, ChatPayload } from '@/lib/chat-state';

function getAuthUserId(): string | null {
  try {
    return auth().userId || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const userId = getAuthUserId();
  const cookieStore = cookies();
  let sessionId = cookieStore.get('anonymous-session-id')?.value;
  let setCookieHeader: string | undefined;

  if (!userId && !sessionId) {
    sessionId = randomUUID();
    setCookieHeader = `anonymous-session-id=${sessionId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
  }

  let body: { message?: string; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { message, conversationId } = body;
  if (!message) {
    return new Response('Message is required', { status: 400 });
  }

  const conversation = await getOrCreateConversation({
    conversationId,
    userId: userId || null,
    sessionId: sessionId || null,
  });

  if (conversation.title === 'New trip' || !conversation.title) {
    const title = await generateTitle(message);
    await updateConversationTitle(conversation.id, title);
  }

  const history = await loadMessages(conversation.id);

  await saveMessage(conversation.id, {
    role: 'user',
    content: message,
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const statusMap: Record<string, string> = {
        extract: 'Thinking...',
        clarify: 'Asking a quick question...',
        answer: 'Looking that up...',
        gather: 'Planning your trip...',
        critic: 'Double-checking...',
        respond: 'Putting it all together...',
      };

      try {
        let result: any = {};

        const graphStream = await conversationGraph.stream(
          { userMessage: message, history },
          { streamMode: 'updates' }
        );

        for await (const chunk of graphStream) {
          for (const [nodeName, update] of Object.entries(chunk)) {
            if (nodeName in statusMap) {
              emit({ type: 'status', message: statusMap[nodeName] });
            }
            if (typeof update === 'object' && update !== null) {
              result = { ...result, ...update };
            }
          }
        }

        const finalResponse = (result.finalResponse || result.itinerary || 'Here is what I found.') as string;
        const words = finalResponse.split(/(\s+)/);
        for (const word of words) {
          emit({ type: 'content', chunk: word });
        }

        const payload: ChatPayload = {
          entities: result.entities,
          weather: result.weather,
          news: result.news || undefined,
          deals: result.deals,
          images: result.images,
          itinerary: result.itinerary,
          routeLinks: result.routeLinks,
          transportPlan: result.transportPlan || undefined,
          packingTips: result.packingTips,
          feedback: result.criticFeedback?.length ? result.criticFeedback : undefined,
        };

        emit({ type: 'done', payload, conversationId: conversation.id });

        await updateConversationMetadata(conversation.id, result.entities || {});
        await saveMessage(conversation.id, {
          role: 'assistant',
          content: finalResponse,
          payload,
        });
      } catch (error) {
        console.error('Chat error:', error);
        emit({
          type: 'error',
          message: error instanceof Error ? error.message : 'Something went wrong',
        });
      } finally {
        controller.close();
      }
    },
  });

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  };
  if (setCookieHeader) {
    headers['Set-Cookie'] = setCookieHeader;
  }

  return new Response(stream, { headers });
}
