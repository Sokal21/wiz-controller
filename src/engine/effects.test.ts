import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rgbToInt } from '../color';
import { createEffect, EFFECTS, EffectFixture, FrameContext, getEffect, resolveParams } from './effects';

const room = { width: 6, depth: 4, height: 3 };
const fixtures: EffectFixture[] = [
  { id: 'right', index: 0, position: { x: 2, y: 1, z: 0 } },
  { id: 'left', index: 1, position: { x: -2, y: 1, z: 0 } },
  { id: 'middle', index: 2, position: { x: 0, y: 1, z: 0 } },
];

function ctx(t: number, beat = { count: 0, at: -Infinity }, dt = 0.033): FrameContext {
  return { t, dt, beat, room };
}

/** Colors of every lamp at one moment, as hex ints, keyed by id. */
function render(type: string, params: Record<string, string | number | boolean>, frame: FrameContext, rng = () => 0.99) {
  const effect = createEffect(type, params, rng);
  assert.ok(effect);
  effect.frame?.(frame, fixtures);
  return Object.fromEntries(fixtures.map((fixture) => [fixture.id, rgbToInt(effect.color(frame, fixture) ?? { r: 0, g: 0, b: 0 })]));
}

test('every effect renders with its default params', () => {
  for (const def of EFFECTS) {
    const colors = render(def.type, {}, ctx(1.234, { count: 3, at: 1.2 }));
    for (const value of Object.values(colors)) assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffff, def.type);
  }
});

test('resolveParams fills defaults and clamps what is out of range', () => {
  const strobe = getEffect('strobe')!;
  assert.deepEqual(resolveParams(strobe, { colorA: 'red', intervalMs: 5, extra: true }), {
    colorA: '#ffffff',
    colorB: '#000000',
    intervalMs: 40,
  });
});

test('unknown effects are skipped', () => {
  assert.equal(createEffect('nope', {}), null);
});

test('strobe alternates on its interval', () => {
  const params = { colorA: '#ffffff', colorB: '#000000', intervalMs: 100 };
  assert.equal(render('strobe', params, ctx(0.05)).left, 0xffffff);
  assert.equal(render('strobe', params, ctx(0.15)).left, 0x000000);
  assert.equal(render('strobe', params, ctx(0.25)).left, 0xffffff);
});

test('chase follows the lamps position, not the list order', () => {
  const params = { color: '#ffffff', background: '#000000', order: 'x', stepMs: 100, holdMs: 100, fade: false };
  assert.deepEqual(render('chase', params, ctx(0.05)), { left: 0xffffff, middle: 0, right: 0 });
  assert.deepEqual(render('chase', params, ctx(0.15)), { left: 0, middle: 0xffffff, right: 0 });
  assert.deepEqual(render('chase', params, ctx(0.25)), { left: 0, middle: 0, right: 0xffffff });
  assert.deepEqual(render('chase', params, ctx(0.35)), { left: 0xffffff, middle: 0, right: 0 });
});

test('chase can step on beats', () => {
  const params = { color: '#ffffff', background: '#000000', order: 'list', sync: 'beat', holdMs: 200, fade: false };
  assert.deepEqual(render('chase', params, ctx(1)), { right: 0, left: 0, middle: 0 });
  assert.deepEqual(render('chase', params, ctx(1.05, { count: 1, at: 1 })), { right: 0xffffff, left: 0, middle: 0 });
  assert.deepEqual(render('chase', params, ctx(1.55, { count: 2, at: 1.5 })), { right: 0, left: 0xffffff, middle: 0 });
});

test('wave is a function of position', () => {
  // Half a wavelength apart: one lamp at each extreme of the wave.
  const colors = render('wave', { colorA: '#000000', colorB: '#ffffff', axis: 'x', wavelength: 8, speed: 0 }, ctx(0));
  assert.equal(colors.right, 0xffffff);
  assert.equal(colors.left, 0x000000);
  assert.equal(colors.middle, 0x808080);
});

test('beat flash lights up on a beat and fades', () => {
  const effect = createEffect('beat', { color: '#ffffff', background: '#000000', mode: 'all', decayMs: 200 })!;
  const lamp = fixtures[0];

  effect.frame?.(ctx(1), fixtures);
  assert.equal(rgbToInt(effect.color(ctx(1), lamp)!), 0);

  const onBeat = ctx(2, { count: 1, at: 2 });
  effect.frame?.(onBeat, fixtures);
  assert.equal(rgbToInt(effect.color(onBeat, lamp)!), 0xffffff);

  const later = ctx(2.05, { count: 1, at: 2 });
  effect.frame?.(later, fixtures);
  assert.equal(rgbToInt(effect.color(later, lamp)!), 0xbfbfbf);

  const faded = ctx(2.3, { count: 1, at: 2 });
  assert.equal(rgbToInt(effect.color(faded, lamp)!), 0);
});

test('ripple reaches near lamps before far ones', () => {
  const effect = createEffect('ripple', { color: '#ffffff', background: '#000000', trigger: 'interval', speed: 2, width: 0.5 })!;
  const [right, , middle] = fixtures;

  effect.frame?.(ctx(0), fixtures);
  // The ring starts at the room center (0, 1.5, 0): 0.5 m from "middle", ~2.06 m from "right".
  const early = ctx(0.25);
  assert.equal(rgbToInt(effect.color(early, middle)!), 0xffffff);
  assert.equal(rgbToInt(effect.color(early, right)!), 0);

  const late = ctx(1.03);
  assert.equal(rgbToInt(effect.color(late, middle)!), 0);
  assert.ok(rgbToInt(effect.color(late, right)!) > 0xf0f0f0);
});
