/**
 * Types shared by the server and the web client. Type-only: nothing here may have a runtime dependency.
 *
 * Coordinates are in meters, three.js style: x = right, y = up, z = towards the viewer.
 * The room is centered on the origin and sits on the floor (y = 0).
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type FixtureKind = 'wiz' | 'magic-home' | 'arduino' | 'sim';

/** A real device discovered on the network. */
export interface Fixture {
  id: string;
  kind: FixtureKind;
  name: string;
  address: string;
  online: boolean;
}

/**
 * A lamp placed in a scene. Real lamps reference a discovered fixture by id and keep working as simulated
 * ones while the device is offline; `sim` lamps only exist inside the scene.
 */
export interface SceneFixture {
  id: string;
  kind: FixtureKind;
  name: string;
  position: Vec3;
}

export type ParamValue = string | number | boolean;

export type ParamDef =
  | { key: string; label: string; type: 'color'; default: string }
  | { key: string; label: string; type: 'number'; default: number; min: number; max: number; step: number; unit?: string }
  | { key: string; label: string; type: 'select'; default: string; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'boolean'; default: boolean };

export interface EffectInfo {
  type: string;
  label: string;
  description: string;
  params: ParamDef[];
}

export interface EffectLayer {
  id: string;
  effect: string;
  /** Scene fixture ids this layer drives; null means every lamp in the scene. */
  targets: string[] | null;
  params: Record<string, ParamValue>;
}

/** A saved lighting state: effect layers composited bottom to top. */
export interface Look {
  id: string;
  name: string;
  layers: EffectLayer[];
}

export interface Pad {
  key: string;
  color: string;
}

export interface Room {
  width: number;
  depth: number;
  height: number;
}

export interface Scene {
  id: string;
  name: string;
  room: Room;
  fixtures: SceneFixture[];
  looks: Look[];
  pads: Pad[];
}

export interface RuntimeState {
  activeSceneId: string | null;
  activeLookId: string | null;
  /** Master dimmer, 0..1. */
  master: number;
  blackout: boolean;
  beatSource: { url: string | null; connected: boolean };
}

export interface AppState {
  fixtures: Fixture[];
  scenes: Scene[];
  runtime: RuntimeState;
  effects: EffectInfo[];
}

export interface BeatInfo {
  count: number;
  bpm: number | null;
}

export type AckResult = { ok: true } | { ok: false; error: string };
export type Ack = (result: AckResult) => void;

export interface ClientToServerEvents {
  'scene:save': (scene: Scene, ack?: Ack) => void;
  'scene:delete': (payload: { id: string }, ack?: Ack) => void;
  'scene:activate': (payload: { id: string }, ack?: Ack) => void;
  'look:activate': (payload: { id: string | null }, ack?: Ack) => void;
  /** Manual color underneath the active look. `color: null` releases the lamps. */
  'color:set': (payload: { fixtureIds: string[]; color: string | null }, ack?: Ack) => void;
  /** Momentary color on top of everything. `fixtureIds: null` flashes the whole scene. */
  flash: (payload: { fixtureIds: string[] | null; color: string; durationMs: number }, ack?: Ack) => void;
  'master:set': (payload: { level: number }, ack?: Ack) => void;
  'blackout:set': (payload: { on: boolean }, ack?: Ack) => void;
  'beat:tap': () => void;
  'beat:source': (payload: { url: string | null }, ack?: Ack) => void;
}

export interface ServerToClientEvents {
  state: (state: AppState) => void;
  /** Current lamp colors as 0xRRGGBB, keyed by fixture id. Only changed lamps are sent after the first one. */
  colors: (colors: Record<string, number>) => void;
  beat: (beat: BeatInfo) => void;
}
