import dgram from 'dgram';
import type { Fixture, FixtureKind, RGB } from '../../shared/protocol';

/** Talks to one family of devices: reports what it discovers to the registry and pushes colors out. */
export interface Driver {
  readonly kind: FixtureKind;
  /** Shortest gap between two color updates to the same device before it starts dropping or lagging. */
  readonly minIntervalMs: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  setColor(fixture: Fixture, color: RGB): void;
}

export function bindUdp(socket: dgram.Socket, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(port, () => {
      socket.off('error', reject);
      socket.setBroadcast(true);
      resolve();
    });
  });
}

export function closeUdp(socket: dgram.Socket): Promise<void> {
  return new Promise((resolve) => {
    try {
      socket.close(() => resolve());
    } catch {
      // Never bound or already closed.
      resolve();
    }
  });
}

export function parseJson(message: Buffer): unknown {
  try {
    return JSON.parse(message.toString());
  } catch {
    return null;
  }
}
