/**
 * WiZ bulbs speak JSON over UDP.
 * https://community.hubitat.com/t/release-philips-wiz-color-light-driver-v1-01/31818/90
 *
 * Discovery: we broadcast a `registration` (posing as the phone app) so bulbs start pushing `syncPilot`
 * heartbeats to port 38900, plus a `getPilot` that every bulb answers directly. Either one carries the MAC.
 */
import dgram from 'dgram';
import type { Fixture, RGB } from '../../shared/protocol';
import { listInterfaces } from '../net';
import type { FixtureRegistry } from '../registry';
import { bindUdp, closeUdp, Driver, parseJson } from './driver';

const BULB_PORT = 38899;
const PUSH_PORT = 38900;
const DISCOVERY_INTERVAL_MS = 5_000;
const MIN_DIMMING = 10;

/** Below this the bulb is switched off: WiZ rejects an all-zero color and cannot dim under 10%. */
const OFF_THRESHOLD = 3;

export type WizPilot = { state: false } | { state: true; r: number; g: number; b: number; dimming: number };

/**
 * WiZ takes hue and brightness separately, so the color is normalized to full intensity and the brightness
 * goes in `dimming`. Sending the raw RGB would leave the bulb at whatever dimming it had before.
 */
export function toWizPilot({ r, g, b }: RGB): WizPilot {
  const max = Math.max(r, g, b);
  if (max < OFF_THRESHOLD) return { state: false };

  const normalize = 255 / max;
  return {
    state: true,
    r: Math.round(r * normalize),
    g: Math.round(g * normalize),
    b: Math.round(b * normalize),
    dimming: Math.max(MIN_DIMMING, Math.min(100, Math.round((max / 255) * 100))),
  };
}

function extractMac(message: unknown): string | null {
  if (typeof message !== 'object' || message === null) return null;
  const { params, result } = message as { params?: { mac?: unknown }; result?: { mac?: unknown } };
  const mac = params?.mac ?? result?.mac;
  return typeof mac === 'string' && mac.length > 0 ? mac : null;
}

export class WizDriver implements Driver {
  readonly kind = 'wiz';
  readonly minIntervalMs = 40;

  private commandSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  private pushSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  private discoveryTimer: NodeJS.Timeout | null = null;

  constructor(private registry: FixtureRegistry) {}

  async start(): Promise<void> {
    for (const socket of [this.commandSocket, this.pushSocket]) {
      socket.on('message', (message, remote) => this.handleMessage(message, remote.address));
    }

    await bindUdp(this.commandSocket, 0);
    await bindUdp(this.pushSocket, PUSH_PORT);

    for (const socket of [this.commandSocket, this.pushSocket]) {
      socket.on('error', (error) => console.error(`[wiz] socket error: ${error.message}`));
    }

    this.discover();
    this.discoveryTimer = setInterval(() => this.discover(), DISCOVERY_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    this.discoveryTimer = null;
    await Promise.all([closeUdp(this.commandSocket), closeUdp(this.pushSocket)]);
  }

  setColor(fixture: Fixture, color: RGB): void {
    this.send({ method: 'setPilot', params: toWizPilot(color) }, fixture.address);
  }

  private discover(): void {
    for (const iface of listInterfaces()) {
      this.send(
        {
          method: 'registration',
          params: { register: true, phoneIp: iface.address, phoneMac: iface.mac.replace(/:/g, '').toUpperCase() },
        },
        iface.broadcast
      );
      this.send({ method: 'getPilot', params: {} }, iface.broadcast);
    }
  }

  private handleMessage(message: Buffer, address: string): void {
    const mac = extractMac(parseJson(message));
    if (!mac) return;

    this.registry.seen({ id: `wiz:${mac}`, kind: 'wiz', name: `WiZ ${mac.slice(-6).toUpperCase()}`, address });
  }

  private send(payload: object, address: string): void {
    this.commandSocket.send(JSON.stringify(payload), BULB_PORT, address, (error) => {
      if (error) console.error(`[wiz] send to ${address} failed: ${error.message}`);
    });
  }
}
