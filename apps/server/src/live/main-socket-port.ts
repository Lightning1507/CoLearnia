import type { Socket } from 'socket.io';
import { sessionControlBudget } from '@colearnia/contracts';
import { outsideCoordination } from '../lib/operation-coordinator.js';
import type { SessionProjectionCursor } from '@colearnia/contracts';

const ackCursors = new WeakMap<object, SessionProjectionCursor>();

export function bindMainAckCursor<T extends object>(ack: T, cursor: SessionProjectionCursor): T {
  ackCursors.set(ack, cursor);
  return ack;
}

export function createMainSocketPort(
  socket: Socket,
  dispatch: (event: string, input: unknown, send: () => void) => Promise<boolean | 'discard'>,
): Socket {
  type Packet = { event: string; input: unknown; send(): void; size: number; expires: number };
  const queue: Packet[] = [];
  let bytes = 0;
  let flushing = false;
  let stopped = false;
  let cancelDrain: (() => void) | undefined;
  const stop = () => {
    stopped = true;
    queue.length = 0;
    bytes = 0;
    cancelDrain?.();
    socket.disconnect(true);
  };
  socket.once('disconnect', () => {
    stopped = true;
    queue.length = 0;
    bytes = 0;
    cancelDrain?.();
  });
  const waitDrain = () =>
    new Promise<void>((resolve) => {
      const transport = socket.conn.transport;
      const finish = () => {
        clearTimeout(timer);
        transport.off('drain', finish);
        cancelDrain = undefined;
        resolve();
      };
      const timer = setTimeout(() => {
        stop();
        finish();
      }, 2000).unref();
      cancelDrain = finish;
      transport.once('drain', finish);
      if (transport.writable) finish();
    });
  const flush = async () => {
    if (flushing || stopped) return;
    flushing = true;
    try {
      while (queue.length && socket.connected && !stopped) {
        const item = queue[0]!;
        if (Date.now() >= item.expires) {
          stop();
          break;
        }
        if (!socket.conn.transport.writable) {
          await waitDrain();
          continue;
        }
        let sent = false;
        const authorized = await dispatch(item.event, item.input, () => {
          if (
            stopped ||
            !socket.connected ||
            !socket.conn.transport.writable ||
            Date.now() >= item.expires
          )
            return;
          item.send();
          sent = true;
        });
        if (!authorized) {
          stop();
          break;
        }
        if (stopped) break;
        if (sent || authorized === 'discard') {
          queue.shift();
          bytes -= item.size;
        } else await waitDrain();
      }
    } catch {
      stop();
    } finally {
      flushing = false;
    }
  };
  const enqueue = (event: string, input: unknown, value: unknown, send: () => void) => {
    if (stopped || !socket.connected) return;
    const size = Buffer.byteLength(JSON.stringify(value) ?? 'null');
    if (
      queue.length >= sessionControlBudget.maxSnapshotParts + 2 ||
      bytes + size > sessionControlBudget.maxSnapshotBytes + sessionControlBudget.maxControlBytes
    ) {
      stop();
      return;
    }
    queue.push({ event, input, send, size, expires: Date.now() + 2000 });
    bytes += size;
    outsideCoordination(() => {
      void flush();
    });
  };
  const port = new Proxy(socket, {
    get(target, property) {
      if (property === 'emit')
        return (event: string, ...values: unknown[]) => {
          enqueue(event, values[0], values, () => target.volatile.emit(event, ...values));
          return port;
        };
      if (property === 'on')
        return (event: string, listener: (...values: unknown[]) => unknown) => {
          target.on(event, (...values: unknown[]) => {
            const ack = values.at(-1);
            if (typeof ack === 'function')
              values[values.length - 1] = (...reply: unknown[]) => {
                const response = reply[0];
                const cursor =
                  response && typeof response === 'object' ? ackCursors.get(response) : undefined;
                enqueue(event + '.ack', { request: cursor ?? values[0], response }, reply, () =>
                  Reflect.apply(ack, undefined, reply),
                );
              };
            Reflect.apply(listener, undefined, values);
          });
          return port;
        };
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return port;
}
