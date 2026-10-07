import type { EffectInfo, ParamDef, ParamValue, RGB, Room, Vec3 } from '../../shared/protocol';
import { HEX_COLOR, hexToRgb, hsvToRgb, mix } from '../color';

export interface EffectFixture {
  id: string;
  /** Position of the lamp in its layer's target list. */
  index: number;
  position: Vec3;
}

export interface FrameContext {
  /** Engine time in seconds. */
  t: number;
  /** Seconds since the previous frame. */
  dt: number;
  beat: {
    count: number;
    /** Engine time of the last beat in seconds, or -Infinity before the first one. */
    at: number;
  };
  room: Room;
}

export interface EffectInstance {
  /** Runs once per frame before `color`, for effects that keep state. */
  frame?(ctx: FrameContext, fixtures: EffectFixture[]): void;
  /** The color for one lamp, or null to let lower layers show through. */
  color(ctx: FrameContext, fixture: EffectFixture): RGB | null;
}

type Params = Record<string, ParamValue>;
type Rng = () => number;

export interface EffectDef extends EffectInfo {
  create(params: Params, rng: Rng): EffectInstance;
}

const AXIS_OPTIONS = [
  { value: 'x', label: 'Left → right (X)' },
  { value: 'z', label: 'Back → front (Z)' },
  { value: 'y', label: 'Floor → ceiling (Y)' },
  { value: 'radial', label: 'From the center' },
];

const color = (key: string, label: string, fallback: string): ParamDef => ({ key, label, type: 'color', default: fallback });
const number = (key: string, label: string, fallback: number, min: number, max: number, step: number, unit?: string): ParamDef => ({
  key,
  label,
  type: 'number',
  default: fallback,
  min,
  max,
  step,
  unit,
});
const axis = (fallback = 'x'): ParamDef => ({ key: 'axis', label: 'Direction', type: 'select', default: fallback, options: AXIS_OPTIONS });

/** Distance of a lamp along the chosen direction, in meters. */
function along(direction: string, position: Vec3): number {
  switch (direction) {
    case 'y':
      return position.y;
    case 'z':
      return position.z;
    case 'radial':
      return Math.hypot(position.x, position.z);
    default:
      return position.x;
  }
}

const fract = (value: number) => value - Math.floor(value);

/** 1 right when it starts, fading linearly to 0 after `durationMs`. */
function decay(elapsedMs: number, durationMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= durationMs) return 0;
  return 1 - elapsedMs / durationMs;
}

const solid: EffectDef = {
  type: 'solid',
  label: 'Solid',
  description: 'One fixed color.',
  params: [color('color', 'Color', '#ffb070')],
  create(params) {
    const value = hexToRgb(params.color as string);
    return { color: () => value };
  },
};

const strobe: EffectDef = {
  type: 'strobe',
  label: 'Strobe',
  description: 'Alternates between two colors.',
  params: [color('colorA', 'Color A', '#ffffff'), color('colorB', 'Color B', '#000000'), number('intervalMs', 'Interval', 100, 40, 2000, 10, 'ms')],
  create(params) {
    const colors = [hexToRgb(params.colorA as string), hexToRgb(params.colorB as string)];
    const interval = (params.intervalMs as number) / 1000;
    return { color: (ctx) => colors[Math.floor(ctx.t / interval) % 2] };
  },
};

const pulse: EffectDef = {
  type: 'pulse',
  label: 'Pulse',
  description: 'All lamps breathe together between two colors.',
  params: [color('colorA', 'Color A', '#ff2d6f'), color('colorB', 'Color B', '#12001f'), number('periodMs', 'Period', 2000, 200, 20000, 100, 'ms')],
  create(params) {
    const from = hexToRgb(params.colorB as string);
    const to = hexToRgb(params.colorA as string);
    const period = (params.periodMs as number) / 1000;
    return { color: (ctx) => mix(from, to, 0.5 - 0.5 * Math.cos((2 * Math.PI * ctx.t) / period)) };
  },
};

const chase: EffectDef = {
  type: 'chase',
  label: 'Chase',
  description: 'Lights the lamps one after another, in list order or following their position.',
  params: [
    color('color', 'Color', '#00e5ff'),
    color('background', 'Background', '#000000'),
    {
      key: 'order',
      label: 'Order',
      type: 'select',
      default: 'x',
      options: [{ value: 'list', label: 'Scene list order' }, ...AXIS_OPTIONS],
    },
    {
      key: 'sync',
      label: 'Advance',
      type: 'select',
      default: 'time',
      options: [
        { value: 'time', label: 'On a timer' },
        { value: 'beat', label: 'On every beat' },
      ],
    },
    number('stepMs', 'Step time', 250, 40, 2000, 10, 'ms'),
    number('holdMs', 'Hold time', 500, 40, 4000, 10, 'ms'),
    { key: 'fade', label: 'Fade out', type: 'boolean', default: true },
  ],
  create(params) {
    const lit = hexToRgb(params.color as string);
    const background = hexToRgb(params.background as string);
    const stepMs = params.stepMs as number;
    const holdMs = params.holdMs as number;
    /** Lamp id → its place in the sequence. */
    let rank = new Map<string, number>();

    const level = (elapsedMs: number) => {
      if (elapsedMs < 0 || elapsedMs >= holdMs) return 0;
      return params.fade ? 1 - elapsedMs / holdMs : 1;
    };

    return {
      frame(_ctx, fixtures) {
        const ordered =
          params.order === 'list'
            ? fixtures
            : [...fixtures].sort((a, b) => along(params.order as string, a.position) - along(params.order as string, b.position));
        rank = new Map(ordered.map((fixture, place) => [fixture.id, place]));
      },
      color(ctx, fixture) {
        const count = rank.size;
        const place = rank.get(fixture.id);
        if (place === undefined || count === 0) return background;

        if (params.sync === 'beat') {
          if (ctx.beat.count === 0) return background;
          const head = (ctx.beat.count - 1) % count;
          return mix(background, lit, place === head ? level((ctx.t - ctx.beat.at) * 1000) : 0);
        }

        const elapsed = ctx.t * 1000;
        const head = Math.floor(elapsed / stepMs) % count;
        const stepsAgo = (head - place + count) % count;
        return mix(background, lit, level(stepsAgo * stepMs + (elapsed % stepMs)));
      },
    };
  },
};

const wave: EffectDef = {
  type: 'wave',
  label: 'Wave',
  description: 'A two-color wave travelling across the room.',
  params: [
    color('colorA', 'Color A', '#7a5cff'),
    color('colorB', 'Color B', '#00d4a6'),
    axis(),
    number('wavelength', 'Wavelength', 4, 0.5, 20, 0.1, 'm'),
    number('speed', 'Speed', 1.5, -10, 10, 0.1, 'm/s'),
  ],
  create(params) {
    const from = hexToRgb(params.colorA as string);
    const to = hexToRgb(params.colorB as string);
    const wavelength = params.wavelength as number;
    const speed = params.speed as number;
    return {
      color(ctx, fixture) {
        const phase = (along(params.axis as string, fixture.position) - ctx.t * speed) / wavelength;
        return mix(from, to, 0.5 + 0.5 * Math.sin(2 * Math.PI * phase));
      },
    };
  },
};

const rainbow: EffectDef = {
  type: 'rainbow',
  label: 'Rainbow',
  description: 'The full spectrum spread across the room and drifting.',
  params: [
    axis(),
    number('scale', 'Spread', 8, 0.5, 40, 0.5, 'm'),
    number('speed', 'Speed', 0.08, 0, 2, 0.01, 'cycles/s'),
    number('brightness', 'Brightness', 100, 5, 100, 1, '%'),
  ],
  create(params) {
    const spread = params.scale as number;
    const speed = params.speed as number;
    const brightness = (params.brightness as number) / 100;
    return {
      color: (ctx, fixture) => hsvToRgb(fract(along(params.axis as string, fixture.position) / spread - ctx.t * speed), 1, brightness),
    };
  },
};

const ripple: EffectDef = {
  type: 'ripple',
  label: 'Ripple',
  description: 'Rings of light that expand through the room.',
  params: [
    color('color', 'Color', '#ffffff'),
    color('background', 'Background', '#050018'),
    {
      key: 'trigger',
      label: 'Trigger',
      type: 'select',
      default: 'interval',
      options: [
        { value: 'interval', label: 'On a timer' },
        { value: 'beat', label: 'On every beat' },
      ],
    },
    number('intervalMs', 'Interval', 1500, 200, 10000, 50, 'ms'),
    {
      key: 'origin',
      label: 'Origin',
      type: 'select',
      default: 'center',
      options: [
        { value: 'center', label: 'Room center' },
        { value: 'random', label: 'Random lamp' },
      ],
    },
    number('speed', 'Speed', 4, 0.5, 20, 0.5, 'm/s'),
    number('width', 'Ring width', 1.2, 0.2, 6, 0.1, 'm'),
  ],
  create(params, rng) {
    const lit = hexToRgb(params.color as string);
    const background = hexToRgb(params.background as string);
    const speed = params.speed as number;
    const width = params.width as number;
    const interval = (params.intervalMs as number) / 1000;
    let rings: { startedAt: number; origin: Vec3 }[] = [];
    let lastBeat = -1;
    let nextAt = 0;

    return {
      frame(ctx, fixtures) {
        const { room } = ctx;
        const reach = Math.hypot(room.width, room.depth, room.height) + width;
        rings = rings.filter((ring) => (ctx.t - ring.startedAt) * speed < reach);

        if (lastBeat === -1) lastBeat = ctx.beat.count;
        const due = params.trigger === 'beat' ? ctx.beat.count !== lastBeat : ctx.t >= nextAt;
        lastBeat = ctx.beat.count;
        if (!due) return;

        nextAt = ctx.t + interval;
        const randomLamp = fixtures[Math.floor(rng() * fixtures.length)];
        const origin = params.origin === 'random' && randomLamp ? randomLamp.position : { x: 0, y: room.height / 2, z: 0 };
        rings.push({ startedAt: ctx.t, origin });
      },
      color(ctx, fixture) {
        let level = 0;
        for (const ring of rings) {
          const radius = (ctx.t - ring.startedAt) * speed;
          const { x, y, z } = fixture.position;
          const distance = Math.hypot(x - ring.origin.x, y - ring.origin.y, z - ring.origin.z);
          level = Math.max(level, 1 - Math.abs(distance - radius) / width);
        }
        return mix(background, lit, level);
      },
    };
  },
};

const sparkle: EffectDef = {
  type: 'sparkle',
  label: 'Sparkle',
  description: 'Lamps twinkle at random.',
  params: [
    color('color', 'Color', '#fff4d6'),
    color('background', 'Background', '#0a0a1e'),
    number('rate', 'Sparkles per lamp', 1.5, 0.1, 10, 0.1, '/s'),
    number('decayMs', 'Fade time', 400, 40, 3000, 10, 'ms'),
  ],
  create(params, rng) {
    const lit = hexToRgb(params.color as string);
    const background = hexToRgb(params.background as string);
    const rate = params.rate as number;
    const decayMs = params.decayMs as number;
    const sparkedAt = new Map<string, number>();

    return {
      frame(ctx, fixtures) {
        for (const fixture of fixtures) {
          if (rng() < rate * ctx.dt) sparkedAt.set(fixture.id, ctx.t);
        }
      },
      color(ctx, fixture) {
        const at = sparkedAt.get(fixture.id);
        return mix(background, lit, at === undefined ? 0 : decay((ctx.t - at) * 1000, decayMs));
      },
    };
  },
};

const beat: EffectDef = {
  type: 'beat',
  label: 'Beat flash',
  description: 'Flashes on every beat.',
  params: [
    color('color', 'Color', '#ff3b30'),
    color('background', 'Background', '#000000'),
    {
      key: 'mode',
      label: 'Lamps',
      type: 'select',
      default: 'all',
      options: [
        { value: 'all', label: 'All of them' },
        { value: 'random', label: 'A random few' },
        { value: 'alternate', label: 'Alternate halves' },
      ],
    },
    number('decayMs', 'Fade time', 250, 40, 2000, 10, 'ms'),
  ],
  create(params, rng) {
    const lit = hexToRgb(params.color as string);
    const background = hexToRgb(params.background as string);
    const decayMs = params.decayMs as number;
    let chosen = new Set<string>();
    let lastBeat = -1;

    return {
      frame(ctx, fixtures) {
        if (lastBeat === -1) lastBeat = ctx.beat.count;
        if (ctx.beat.count === lastBeat) return;
        lastBeat = ctx.beat.count;

        if (params.mode === 'alternate') {
          chosen = new Set(fixtures.filter((fixture) => fixture.index % 2 === ctx.beat.count % 2).map((fixture) => fixture.id));
        } else if (params.mode === 'random') {
          const picked = fixtures.filter(() => rng() < 0.5);
          const fallback = fixtures[Math.floor(rng() * fixtures.length)];
          chosen = new Set((picked.length > 0 ? picked : fallback ? [fallback] : []).map((fixture) => fixture.id));
        } else {
          chosen = new Set(fixtures.map((fixture) => fixture.id));
        }
      },
      color(ctx, fixture) {
        const level = chosen.has(fixture.id) ? decay((ctx.t - ctx.beat.at) * 1000, decayMs) : 0;
        return mix(background, lit, level);
      },
    };
  },
};

export const EFFECTS: EffectDef[] = [solid, pulse, strobe, chase, wave, rainbow, ripple, sparkle, beat];

const BY_TYPE = new Map(EFFECTS.map((effect) => [effect.type, effect]));

export function getEffect(type: string): EffectDef | undefined {
  return BY_TYPE.get(type);
}

export function effectCatalog(): EffectInfo[] {
  return EFFECTS.map(({ type, label, description, params }) => ({ type, label, description, params }));
}

/** Fills in missing params and forces every value into what its definition allows. */
export function resolveParams(effect: EffectInfo, params: Params): Params {
  const resolved: Params = {};

  for (const def of effect.params) {
    const value = params[def.key];
    switch (def.type) {
      case 'color':
        resolved[def.key] = typeof value === 'string' && HEX_COLOR.test(value) ? value : def.default;
        break;
      case 'number':
        resolved[def.key] = typeof value === 'number' && Number.isFinite(value) ? Math.max(def.min, Math.min(def.max, value)) : def.default;
        break;
      case 'select':
        resolved[def.key] = def.options.some((option) => option.value === value) ? (value as string) : def.default;
        break;
      case 'boolean':
        resolved[def.key] = typeof value === 'boolean' ? value : def.default;
        break;
    }
  }

  return resolved;
}

export function createEffect(type: string, params: Params, rng: Rng = Math.random): EffectInstance | null {
  const effect = getEffect(type);
  return effect ? effect.create(resolveParams(effect, params), rng) : null;
}
