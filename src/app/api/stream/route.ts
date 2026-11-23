import { readSession } from '@/server/auth';
import { bus } from '@/server/bus';
import { jsonError } from '@/server/http';
import { getWorkerStatus } from '@/server/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await readSession())) return jsonError('Sign in required.', 401);
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const onPrice = (event: unknown) => send(event);
      const onAlert = (event: { symbol: string; message: string; kind: string }) => {
        send({ type: 'alert', ...event });
      };
      const onStatus = (event: { ws: string; detail: string }) => {
        send({ type: 'status', ...event });
      };
      bus.on('price', onPrice);
      bus.on('alert', onAlert);
      bus.on('status', onStatus);
      send({ type: 'hello', ...getWorkerStatus() });
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup();
        }
      }, 15_000);
      cleanup = () => {
        clearInterval(ping);
        bus.off('price', onPrice);
        bus.off('alert', onAlert);
        bus.off('status', onStatus);
      };
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
