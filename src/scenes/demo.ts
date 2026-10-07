import type { EffectLayer, Look, Pad, ParamValue, Scene, SceneFixture } from '../../shared/protocol';

const PAD_KEYS = ['q', 'w', 'e', 'a', 's', 'd', 'z', 'x', 'c'];
const PAD_COLORS = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#ff2d92', '#ffffff'];

export function defaultPads(): Pad[] {
  return PAD_KEYS.map((key, index) => ({ key, color: PAD_COLORS[index] }));
}

function look(id: string, name: string, ...layers: [effect: string, params: Record<string, ParamValue>][]): Look {
  return {
    id,
    name,
    layers: layers.map(([effect, params], index): EffectLayer => ({ id: `${id}-layer-${index + 1}`, effect, targets: null, params })),
  };
}

function sim(index: number, name: string, x: number, y: number, z: number): SceneFixture {
  return { id: `sim:demo-${index}`, kind: 'sim', name, position: { x, y, z } };
}

/** A room full of simulated lamps, so there is something to play with before any hardware shows up. */
export function demoScene(): Scene {
  return {
    id: 'demo',
    name: 'Demo room',
    room: { width: 6, depth: 5, height: 2.8 },
    fixtures: [
      sim(1, 'Ceiling back left', -2, 2.6, -1.6),
      sim(2, 'Ceiling back right', 2, 2.6, -1.6),
      sim(3, 'Ceiling front left', -2, 2.6, 1.6),
      sim(4, 'Ceiling front right', 2, 2.6, 1.6),
      sim(5, 'Ceiling center', 0, 2.6, 0),
      sim(6, 'Floor lamp', -2.6, 1.5, 2),
      sim(7, 'Desk lamp', 2.4, 0.9, -2),
      sim(8, 'TV backlight', 0, 0.7, -2.3),
    ],
    looks: [
      look('demo-warm', 'Warm', ['solid', { color: '#ffb070' }]),
      look('demo-rainbow', 'Rainbow drift', ['rainbow', { axis: 'x', scale: 8, speed: 0.08 }]),
      look('demo-wave', 'Ocean wave', ['wave', { colorA: '#0a84ff', colorB: '#00d4a6', axis: 'z', wavelength: 5, speed: 1.2 }]),
      look('demo-chase', 'Chase', ['chase', { color: '#00e5ff', background: '#0b0020', order: 'x', stepMs: 220, holdMs: 600 }]),
      look('demo-ripple', 'Ripple', ['ripple', { color: '#ffffff', background: '#150030', trigger: 'interval', intervalMs: 1400 }]),
      look('demo-stars', 'Stars', ['sparkle', { color: '#fff4d6', background: '#070718', rate: 1.2, decayMs: 600 }]),
      look('demo-beat', 'Beat flash', ['beat', { color: '#ff2d92', background: '#0a0010', mode: 'random', decayMs: 280 }]),
    ],
    pads: defaultPads(),
  };
}
