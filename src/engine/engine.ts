import type { Look, RGB, Scene } from '../../shared/protocol';
import { BLACK, mix, rgbToInt, scale } from '../color';
import { BeatTracker } from './beat';
import { createEffect, EffectFixture, EffectInstance, FrameContext } from './effects';

const FRAME_MS = 33;
/** The tail of a flash fades out instead of cutting, so it does not look like a glitch. */
const FLASH_FADE_MS = 120;
const DEFAULT_ROOM = { width: 6, depth: 5, height: 2.8 };

interface Layer {
  id: string;
  /** Serialized config, to tell an edited layer from an untouched one. */
  signature: string;
  targets: Set<string> | null;
  effect: EffectInstance;
}

interface Flash {
  targets: Set<string> | null;
  color: RGB;
  startedAt: number;
  durationMs: number;
}

interface Sent {
  color: number;
  at: number;
}

export interface EngineOptions {
  /** Pushes a color to a real device. Called at most once per `minIntervalMs` for each lamp. */
  output: (fixtureId: string, color: RGB) => void;
  /** Shortest gap the lamp tolerates between two updates. */
  minIntervalMs?: (fixtureId: string) => number;
  /** Called after every frame with the lamps whose color changed, as 0xRRGGBB. */
  onColors?: (changed: Record<string, number>) => void;
  now?: () => number;
  rng?: () => number;
}

/**
 * Computes the color of every lamp on each frame and sends out what changed.
 *
 * A lamp's color is, from top to bottom: an active flash, the topmost layer of the active look that covers
 * it, and its manual color. A lamp none of those reach is left alone, so the engine never touches lamps
 * the user has not asked it to drive; once it has driven one, it turns it off when nothing covers it anymore.
 */
export class Engine {
  readonly beats = new BeatTracker();

  private scene: Scene | null = null;
  private look: Look | null = null;
  private layers: Layer[] = [];
  private manual = new Map<string, RGB>();
  private flashes: Flash[] = [];
  private master = 1;
  private blackout = false;

  /** Lamps the engine has taken control of. */
  private driven = new Set<string>();
  private colors = new Map<string, number>();
  private sent = new Map<string, Sent>();

  private timer: NodeJS.Timeout | null = null;
  private startedAt: number;
  private lastFrameAt: number;

  private output: EngineOptions['output'];
  private minIntervalMs: (fixtureId: string) => number;
  private onColors: (changed: Record<string, number>) => void;
  private now: () => number;
  private rng: () => number;

  constructor(options: EngineOptions) {
    this.output = options.output;
    this.minIntervalMs = options.minIntervalMs ?? (() => 0);
    this.onColors = options.onColors ?? (() => {});
    this.now = options.now ?? Date.now;
    this.rng = options.rng ?? Math.random;
    this.startedAt = this.now();
    this.lastFrameAt = this.startedAt;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), FRAME_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setScene(scene: Scene | null): void {
    const switched = scene?.id !== this.scene?.id;
    this.scene = scene;
    if (switched) {
      this.look = null;
      this.flashes = [];
    } else if (this.look) {
      // The scene was edited: pick up changes to the look that is playing.
      this.look = scene?.looks.find((look) => look.id === this.look?.id) ?? null;
    }
    this.rebuildLayers();
  }

  setLook(lookId: string | null): boolean {
    const look = lookId === null ? null : this.scene?.looks.find((candidate) => candidate.id === lookId);
    if (look === undefined) return false;
    this.look = look;
    this.rebuildLayers();
    return true;
  }

  get activeLookId(): string | null {
    return this.look?.id ?? null;
  }

  setManual(fixtureIds: string[], color: RGB | null): void {
    for (const id of fixtureIds) {
      if (color) this.manual.set(id, color);
      else this.manual.delete(id);
    }
  }

  flash(fixtureIds: string[] | null, color: RGB, durationMs: number): void {
    this.flashes.push({ targets: fixtureIds && new Set(fixtureIds), color, startedAt: this.now(), durationMs });
  }

  setMaster(level: number): void {
    this.master = Math.max(0, Math.min(1, level));
  }

  setBlackout(on: boolean): void {
    this.blackout = on;
  }

  beat(): void {
    this.beats.beat(this.now());
  }

  /** Forgets what was sent to a lamp so its current color goes out again, e.g. after it reconnects. */
  resend(fixtureId: string): void {
    this.sent.delete(fixtureId);
  }

  /** Current color of every lamp the engine is driving, as 0xRRGGBB. */
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.colors);
  }

  tick(): void {
    const now = this.now();
    const ctx: FrameContext = {
      t: (now - this.startedAt) / 1000,
      dt: Math.max(0, now - this.lastFrameAt) / 1000,
      beat: { count: this.beats.count, at: (this.beats.lastAt - this.startedAt) / 1000 },
      room: this.scene?.room ?? DEFAULT_ROOM,
    };
    this.lastFrameAt = now;
    this.flashes = this.flashes.filter((flash) => now - flash.startedAt < flash.durationMs);

    const sceneFixtures = this.scene?.fixtures ?? [];
    const layered = this.renderLayers(ctx, sceneFixtures);
    const sceneIds = new Set(sceneFixtures.map((fixture) => fixture.id));
    const ids = new Set([...sceneIds, ...this.manual.keys(), ...this.driven]);
    for (const flash of this.flashes) flash.targets?.forEach((id) => ids.add(id));

    const changed: Record<string, number> = {};

    for (const id of ids) {
      let color: RGB | null = layered.get(id) ?? this.manual.get(id) ?? null;

      for (const flash of this.flashes) {
        if (flash.targets ? !flash.targets.has(id) : !sceneIds.has(id)) continue;
        const remaining = flash.durationMs - (now - flash.startedAt);
        color = mix(color ?? BLACK, flash.color, remaining / Math.min(FLASH_FADE_MS, flash.durationMs));
      }

      const uncovered = color === null;
      if (color === null) {
        if (!this.driven.has(id)) continue;
        color = BLACK;
      }
      this.driven.add(id);

      const final = rgbToInt(this.blackout ? BLACK : scale(color, this.master));
      if (this.colors.get(id) !== final) {
        this.colors.set(id, final);
        changed[id] = final;
      }

      const sent = this.sent.get(id);
      if (sent?.color !== final && (!sent || now - sent.at >= this.minIntervalMs(id))) {
        this.sent.set(id, { color: final, at: now });
        this.output(id, { r: (final >> 16) & 0xff, g: (final >> 8) & 0xff, b: final & 0xff });
      }

      // Nothing covers the lamp anymore and it has been told to go dark: hand it back.
      if (uncovered && this.sent.get(id)?.color === final) {
        this.driven.delete(id);
        this.sent.delete(id);
        this.colors.delete(id);
      }
    }

    if (Object.keys(changed).length > 0) this.onColors(changed);
  }

  private renderLayers(ctx: FrameContext, sceneFixtures: Scene['fixtures']): Map<string, RGB> {
    const result = new Map<string, RGB>();

    for (const layer of this.layers) {
      const targets: EffectFixture[] = sceneFixtures
        .filter((fixture) => !layer.targets || layer.targets.has(fixture.id))
        .map((fixture, index) => ({ id: fixture.id, index, position: fixture.position }));

      layer.effect.frame?.(ctx, targets);
      for (const target of targets) {
        const color = layer.effect.color(ctx, target);
        if (color) result.set(target.id, color);
      }
    }

    return result;
  }

  /** Keeps the running instance of every layer that was not edited, so tweaking one does not restart the rest. */
  private rebuildLayers(): void {
    const previous = new Map(this.layers.map((layer) => [layer.id, layer]));
    this.layers = [];

    for (const config of this.look?.layers ?? []) {
      const signature = JSON.stringify([config.effect, config.params]);
      const existing = previous.get(config.id);
      const effect = existing?.signature === signature ? existing.effect : createEffect(config.effect, config.params, this.rng);
      if (!effect) continue;

      this.layers.push({ id: config.id, signature, targets: config.targets && new Set(config.targets), effect });
    }
  }
}
