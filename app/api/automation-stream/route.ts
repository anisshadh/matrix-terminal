import { NextRequest } from 'next/server';
import { eventStore } from '@/lib/eventStore';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('session');

  if (!sessionId) {
    return new Response('Session ID is required', { status: 400 });
  }

  // Set up SSE headers
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  let encoder = new TextEncoder();

  try {
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Function to send event to client
    const sendEvent = async (data: any) => {
      try {
        const eventString = `data: ${JSON.stringify(data)}\n\n`;
        await writer.write(encoder.encode(eventString));
      } catch (error: unknown) {
        logger.error('Error sending event:', error instanceof Error ? error : new Error(String(error)));
      }
    };

    // Send initial connection event
    await sendEvent({ type: 'connected', sessionId });

    // Send existing events for this session
    const existingEvents = eventStore.getSessionEvents(sessionId);
    for (const event of existingEvents) {
      await sendEvent(event);
    }

    // Subscribe to new events
    const unsubscribe = eventStore.subscribeToEvents(async ({ sessionId: eventSessionId, event }) => {
      if (eventSessionId === sessionId) {
        await sendEvent(event);
      }
    });

    // Handle client disconnect
    request.signal.addEventListener('abort', () => {
      unsubscribe();
      writer.close();
    });

    return new Response(stream.readable, { headers });
  } catch (error: unknown) {
    logger.error('Error in automation stream:', error instanceof Error ? error : new Error(String(error)));
    return new Response('Internal Server Error', { status: 500 });
  }
}
