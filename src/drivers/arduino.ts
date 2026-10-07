/**
 * LED strip on an Arduino, speaking our own JSON-over-UDP protocol. The firmware answers a broadcast
 * `DISCOVER` with a `DISCOVER_RESPONSE` and paints the strip on `SET_LIGHTS`.
 */
import dgram from 'dgram';
import type { Fixture, RGB } from '../../shared/protocol';
import { listInterfaces } from '../net';
import type { FixtureRegistry } from '../registry';
import { bindUdp, closeUdp, Driver, parseJson } from './driver';

const PORT = 41234;
const DISCOVERY_INTERVAL_MS = 5_000;

interface DiscoverResponse {
  type: 'DISCOVER_RESPONSE';
  payload?: { ip?: string; deviceType?: string; firmwareVersion?: string };
}

function isDiscoverResponse(message: unknown): message is DiscoverResponse {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'DISCOVER_RESPONSE';
}

export class ArduinoDriver implements Driver {
  readonly kind = 'arduino';
  readonly minIntervalMs = 40;

  private socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  private discoveryTimer: NodeJS.Timeout | null = null;

  constructor(
    private registry: FixtureRegistry,
    private ledCount: number
  ) {}

  async start(): Promise<void> {
    this.socket.on('message', (message, remote) => this.handleMessage(message, remote.address));
    await bindUdp(this.socket, PORT);
    this.socket.on('error', (error) => console.error(`[arduino] socket error: ${error.message}`));

    this.discover();
    this.discoveryTimer = setInterval(() => this.discover(), DISCOVERY_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    this.discoveryTimer = null;
    await closeUdp(this.socket);
  }

  /** The strip is driven as a single lamp: every LED gets the same color. */
  setColor(fixture: Fixture, color: RGB): void {
    const light = { r: Math.round(color.r), g: Math.round(color.g), b: Math.round(color.b) };
    const lights = Array.from({ length: this.ledCount }, () => light);

    this.send({ type: 'SET_LIGHTS', payload: { lights } }, fixture.address);
  }

  private discover(): void {
    for (const iface of listInterfaces()) {
      this.send({ type: 'DISCOVER', payload: {} }, iface.broadcast);
    }
  }

  private handleMessage(message: Buffer, senderAddress: string): void {
    // Our own DISCOVER broadcast comes back on this port too; anything but a response is ignored.
    const parsed = parseJson(message);
    if (!isDiscoverResponse(parsed)) return;

    const address = parsed.payload?.ip || senderAddress;
    this.registry.seen({
      id: `arduino:${address}`,
      kind: 'arduino',
      name: `Arduino ${parsed.payload?.deviceType ?? 'strip'}`,
      address,
    });
  }

  private send(payload: object, address: string): void {
    this.socket.send(JSON.stringify(payload), PORT, address, (error) => {
      if (error) console.error(`[arduino] send to ${address} failed: ${error.message}`);
    });
  }
}
