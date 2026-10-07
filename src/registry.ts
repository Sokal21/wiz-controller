import { EventEmitter } from 'events';
import type { Fixture, FixtureKind } from '../shared/protocol';

const OFFLINE_AFTER_MS = 30_000;

interface Entry {
  fixture: Fixture;
  lastSeen: number;
}

export interface FixtureRegistryEvents {
  /** The fixture list changed in a way clients should know about. */
  change: [];
  /** A fixture appeared or came back, so whatever color it should show has to be sent again. */
  online: [fixture: Fixture];
}

/** Every real device the drivers have seen, with its liveness. */
export class FixtureRegistry extends EventEmitter<FixtureRegistryEvents> {
  private entries = new Map<string, Entry>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private now: () => number = Date.now) {
    super();
  }

  /** Called by drivers every time a device shows signs of life. */
  seen(device: { id: string; kind: FixtureKind; name: string; address: string }): void {
    const entry = this.entries.get(device.id);

    if (!entry) {
      const fixture: Fixture = { ...device, online: true };
      this.entries.set(device.id, { fixture, lastSeen: this.now() });
      console.log(`[registry] found ${fixture.name} (${fixture.id}) at ${fixture.address}`);
      this.emit('online', fixture);
      this.emit('change');
      return;
    }

    entry.lastSeen = this.now();
    const { fixture } = entry;
    const cameBack = !fixture.online;
    const changed = cameBack || fixture.address !== device.address || fixture.name !== device.name;

    fixture.online = true;
    fixture.address = device.address;
    fixture.name = device.name;

    if (cameBack) {
      console.log(`[registry] ${fixture.name} (${fixture.id}) is back online`);
      this.emit('online', fixture);
    }
    if (changed) this.emit('change');
  }

  get(id: string): Fixture | undefined {
    return this.entries.get(id)?.fixture;
  }

  list(): Fixture[] {
    return Array.from(this.entries.values(), (entry) => entry.fixture);
  }

  /** Marks fixtures that stopped answering as offline. */
  sweep(): void {
    const cutoff = this.now() - OFFLINE_AFTER_MS;
    let changed = false;

    for (const { fixture, lastSeen } of this.entries.values()) {
      if (fixture.online && lastSeen < cutoff) {
        fixture.online = false;
        changed = true;
        console.log(`[registry] ${fixture.name} (${fixture.id}) went offline`);
      }
    }

    if (changed) this.emit('change');
  }

  start(): void {
    this.sweepTimer = setInterval(() => this.sweep(), 5_000);
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }
}
