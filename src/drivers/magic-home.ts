import dgram from 'dgram';
import { Control } from 'magic-home';
import type { Fixture, RGB } from '../../shared/protocol';
import { listInterfaces } from '../net';
import type { FixtureRegistry } from '../registry';
import { bindUdp, closeUdp, Driver } from './driver';

const DISCOVERY_PORT = 48899;
const DISCOVERY_MESSAGE = 'HF-A11ASSISTHREAD';
const DISCOVERY_INTERVAL_MS = 5_000;

export class MagicHomeDriver implements Driver {
  readonly kind = 'magic-home';
  readonly minIntervalMs = 50;

  private controls = new Map<string, Control>();
  private socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  private discoveryTimer: NodeJS.Timeout | null = null;

  constructor(
    private registry: FixtureRegistry,
    private colorOrder: 'rgb' | 'grb'
  ) {}

  /**
   * Discovery is done here instead of with the library's `Discovery`, which opens a socket per scan and
   * takes the whole process down when it cannot bind its port.
   */
  async start(): Promise<void> {
    this.socket.on('message', (message) => this.handleMessage(message));
    // Controllers answer to whatever port the scan came from.
    await bindUdp(this.socket, 0);
    this.socket.on('error', (error) => console.error(`[magic-home] socket error: ${error.message}`));

    this.discover();
    this.discoveryTimer = setInterval(() => this.discover(), DISCOVERY_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    this.discoveryTimer = null;
    await closeUdp(this.socket);
  }

  setColor(fixture: Fixture, { r, g, b }: RGB): void {
    const [first, second] = this.colorOrder === 'grb' ? [g, r] : [r, g];

    this.controlFor(fixture.address)
      .setColor(Math.round(first), Math.round(second), Math.round(b))
      .catch((error: Error) => console.error(`[magic-home] ${fixture.address}: ${error.message}`));
  }

  private controlFor(address: string): Control {
    let control = this.controls.get(address);
    if (!control) {
      control = new Control(address, {
        wait_for_reply: false,
        ack: { power: false, color: false, pattern: false, custom_pattern: false },
      });
      this.controls.set(address, control);
    }
    return control;
  }

  private discover(): void {
    for (const iface of listInterfaces()) {
      this.socket.send(DISCOVERY_MESSAGE, DISCOVERY_PORT, iface.broadcast, (error) => {
        if (error) console.error(`[magic-home] discovery on ${iface.broadcast} failed: ${error.message}`);
      });
    }
  }

  /** Controllers answer with `<ip>,<id>,<model>`. */
  private handleMessage(message: Buffer): void {
    const parts = message.toString().split(',');
    if (parts.length !== 3) return;
    const [address, id] = parts;

    this.registry.seen({
      id: `magic-home:${id}`,
      kind: 'magic-home',
      name: `Magic Home ${id.slice(-6).toUpperCase()}`,
      address,
    });
  }
}
