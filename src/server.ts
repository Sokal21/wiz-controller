import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type { Ack, AppState, ClientToServerEvents, FixtureKind, ServerToClientEvents } from '../shared/protocol';
import { hexToRgb } from './color';
import type { Driver } from './drivers/driver';
import { BeatSource } from './engine/beat-source';
import { effectCatalog } from './engine/effects';
import { Engine } from './engine/engine';
import type { FixtureRegistry } from './registry';
import { hexColor, sceneSchema } from './scenes/schema';
import type { SceneStore } from './scenes/store';

const STATE_DEBOUNCE_MS = 30;

const fixtureIds = z.array(z.string().min(1).max(100)).max(500);

const payloads = {
  'scene:save': sceneSchema,
  'scene:delete': z.object({ id: z.string() }),
  'scene:activate': z.object({ id: z.string() }),
  'look:activate': z.object({ id: z.string().nullable() }),
  'color:set': z.object({ fixtureIds, color: hexColor.nullable() }),
  flash: z.object({ fixtureIds: fixtureIds.nullable(), color: hexColor, durationMs: z.number().min(20).max(10_000) }),
  'master:set': z.object({ level: z.number().min(0).max(1) }),
  'blackout:set': z.object({ on: z.boolean() }),
  'beat:source': z.object({ url: z.string().trim().max(200).nullable() }),
};

type CommandName = keyof typeof payloads;
type CommandPayload<K extends CommandName> = z.infer<(typeof payloads)[K]>;

export interface LightServerOptions {
  registry: FixtureRegistry;
  drivers: Driver[];
  store: SceneStore;
}

/** Wires the engine to the devices and exposes everything to the web clients over Socket.IO. */
export class LightServer {
  private http = createServer();
  private io = new Server<ClientToServerEvents, ServerToClientEvents>(this.http, { cors: { origin: '*' } });
  private drivers: Map<FixtureKind, Driver>;
  private registry: FixtureRegistry;
  private store: SceneStore;
  private engine: Engine;
  private beatSource: BeatSource;
  private master = 1;
  private blackout = false;
  private stateTimer: NodeJS.Timeout | null = null;

  constructor({ registry, drivers, store }: LightServerOptions) {
    this.registry = registry;
    this.store = store;
    this.drivers = new Map(drivers.map((driver) => [driver.kind, driver]));

    this.engine = new Engine({
      output: (fixtureId, color) => {
        const fixture = this.registry.get(fixtureId);
        if (fixture?.online) this.drivers.get(fixture.kind)?.setColor(fixture, color);
      },
      minIntervalMs: (fixtureId) => {
        const fixture = this.registry.get(fixtureId);
        return (fixture && this.drivers.get(fixture.kind)?.minIntervalMs) ?? 0;
      },
      onColors: (changed) => this.io.emit('colors', changed),
    });
    this.engine.setScene(this.store.activeScene);

    this.beatSource = new BeatSource(
      () => this.beat(),
      () => this.scheduleState()
    );

    this.registry.on('change', () => this.scheduleState());
    this.registry.on('online', (fixture) => this.engine.resend(fixture.id));

    this.io.on('connection', (socket) => this.onConnection(socket));
  }

  start(port: number): Promise<void> {
    try {
      this.beatSource.setUrl(this.store.beatSourceUrl);
    } catch (error) {
      console.error(`[beat] ignoring saved beat source: ${(error as Error).message}`);
    }
    this.engine.start();

    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(port, () => {
        this.http.off('error', reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.engine.stop();
    this.beatSource.stop();
    if (this.stateTimer) clearTimeout(this.stateTimer);
    await this.io.close();
  }

  private onConnection(socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
    socket.emit('state', this.state());
    socket.emit('colors', this.engine.snapshot());

    this.on(socket, 'scene:save', (scene) => {
      this.store.save(scene);
      if (!this.store.activeScene) this.store.activate(scene.id);
      this.engine.setScene(this.store.activeScene);
    });

    this.on(socket, 'scene:delete', ({ id }) => {
      if (!this.store.delete(id)) throw new Error('Scene not found');
      this.engine.setScene(this.store.activeScene);
    });

    this.on(socket, 'scene:activate', ({ id }) => {
      if (!this.store.activate(id)) throw new Error('Scene not found');
      this.engine.setScene(this.store.activeScene);
    });

    this.on(socket, 'look:activate', ({ id }) => {
      if (!this.engine.setLook(id)) throw new Error('Look not found in the active scene');
    });

    this.on(socket, 'color:set', ({ fixtureIds, color }) => {
      this.engine.setManual(fixtureIds, color === null ? null : hexToRgb(color));
    });

    this.on(socket, 'flash', ({ fixtureIds, color, durationMs }) => {
      this.engine.flash(fixtureIds, hexToRgb(color), durationMs);
    });

    this.on(socket, 'master:set', ({ level }) => {
      this.master = level;
      this.engine.setMaster(level);
    });

    this.on(socket, 'blackout:set', ({ on }) => {
      this.blackout = on;
      this.engine.setBlackout(on);
    });

    this.on(socket, 'beat:source', ({ url }) => {
      this.beatSource.setUrl(url || null);
      this.store.setBeatSourceUrl(url || null);
    });

    socket.on('beat:tap', () => this.beat());
  }

  /** Registers a command: validates the payload, runs it, acknowledges and pushes the new state to everyone. */
  private on<K extends CommandName>(
    socket: Socket<ClientToServerEvents, ServerToClientEvents>,
    event: K,
    handler: (payload: CommandPayload<K>) => void
  ): void {
    const listener = (raw: unknown, ack?: Ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const parsed = payloads[event].safeParse(raw);

      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        reply({ ok: false, error: `Invalid ${event}: ${issue.path.join('.')} ${issue.message}`.trim() });
        return;
      }

      try {
        handler(parsed.data as CommandPayload<K>);
        reply({ ok: true });
        this.scheduleState();
      } catch (error) {
        reply({ ok: false, error: (error as Error).message });
      }
    };

    // Socket.IO types each event separately; every command shares this one shape.
    (socket.on as (event: string, listener: (raw: unknown, ack?: Ack) => void) => void)(event, listener);
  }

  private beat(): void {
    this.engine.beat();
    this.io.emit('beat', { count: this.engine.beats.count, bpm: this.engine.beats.bpm });
  }

  private state(): AppState {
    return {
      fixtures: this.registry.list(),
      scenes: this.store.list(),
      effects: effectCatalog(),
      runtime: {
        activeSceneId: this.store.activeScene?.id ?? null,
        activeLookId: this.engine.activeLookId,
        master: this.master,
        blackout: this.blackout,
        beatSource: { url: this.beatSource.url, connected: this.beatSource.connected },
      },
    };
  }

  private scheduleState(): void {
    if (this.stateTimer) return;
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      this.io.emit('state', this.state());
    }, STATE_DEBOUNCE_MS);
  }
}
