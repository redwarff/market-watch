'use client';

import { useEffect, useRef } from 'react';
import type { PriceEvent } from '@/lib/types';

export type StreamEvent =
  | PriceEvent
  | { type: 'alert'; symbol: string; message: string; kind: string }
  | { type: 'status'; ws: string; detail: string }
  | { type: 'hello'; ws: string; detail: string };

export function useStream(onEvent: (event: StreamEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const source = new EventSource('/api/stream');
    source.onmessage = (message) => {
      try {
        handler.current(JSON.parse(message.data) as StreamEvent);
      } catch {
        /* Ignore a malformed event and keep the stream open. */
      }
    };
    return () => source.close();
  }, []);
}
