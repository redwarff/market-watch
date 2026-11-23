import { EventEmitter } from 'events';
import type { PriceEvent } from '@/lib/types';

export type BusEvents = {
  price: PriceEvent;
  alert: { symbol: string; message: string; kind: string };
  status: { ws: 'open' | 'closed' | 'idle'; detail: string };
  'ticker:added': string;
  'ticker:updated': string;
  'ticker:removed': string;
  'ticker:refresh': string;
};

class Bus extends EventEmitter {
  override emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): boolean {
    return super.emit(event, payload);
  }

  override on<K extends keyof BusEvents>(event: K, listener: (payload: BusEvents[K]) => void): this {
    return super.on(event, listener);
  }

  override off<K extends keyof BusEvents>(event: K, listener: (payload: BusEvents[K]) => void): this {
    return super.off(event, listener);
  }
}

const globalBus = globalThis as unknown as { marketBus?: Bus };

function createBus(): Bus {
  const bus = new Bus();
  bus.setMaxListeners(100);
  return bus;
}

export const bus = globalBus.marketBus ?? createBus();
globalBus.marketBus = bus;
