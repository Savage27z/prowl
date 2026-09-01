// SSE Stream — real-time investigation event broadcasting
// GET /api/investigate/stream — SSE endpoint for real-time investigation updates
// Frontend connects here to watch agents work in real time

import { NextRequest } from 'next/server';
import { getSharedCoordinator, addStreamListener } from '@/agents/shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  // Ensure the shared coordinator is initialized
  getSharedCoordinator();

  const stream = new ReadableStream({
    start(controller) {
      // Send a keepalive comment every 15s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
        }
      }, 15000);

      // Register this SSE connection as a listener
      const removeListener = addStreamListener((update) => {
        try {
          const data = JSON.stringify(update);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // stream closed
        }
      });

      // Clean up on abort
      req.signal.addEventListener('abort', () => {
        clearInterval(keepalive);
        removeListener();
        try { controller.close(); } catch { /* already closed */ }
      });

      // Send initial connected event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ agent: 'coordinator', action: 'connected', data: {}, timestamp: new Date().toISOString() })}\n\n`),
      );
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
