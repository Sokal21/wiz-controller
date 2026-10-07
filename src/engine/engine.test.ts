import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Look, RGB, Scene } from '../../shared/protocol';
import { Engine } from './engine';

const RED = { r: 255, g: 0, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };

function scene(looks: Look[] = []): Scene {
  return {
    id: 'scene',
    name: 'Test',
    room: { width: 4, depth: 4, height: 3 },
    fixtures: [
      { id: 'a', kind: 'sim', name: 'A', position: { x: -1, y: 1, z: 0 } },
      { id: 'b', kind: 'sim', name: 'B', position: { x: 1, y: 1, z: 0 } },
    ],
    looks,
    pads: [],
  };
}

function solid(id: string, color: string, targets: string[] | null = null): Look {
  return { id, name: id, layers: [{ id: `${id}-layer`, effect: 'solid', targets, params: { color } }] };
}

function setup(minIntervalMs = 0) {
  let now = 1_000;
  const sent: [string, RGB][] = [];
  const engine = new Engine({
    output: (id, color) => sent.push([id, color]),
    minIntervalMs: () => minIntervalMs,
    now: () => now,
  });
  return {
    engine,
    sent,
    /** Advances the clock and renders a frame. */
    step(ms = 33) {
      now += ms;
      engine.tick();
    },
  };
}

test('leaves lamps alone until something drives them', () => {
  const { engine, sent, step } = setup();
  engine.setScene(scene());
  step();
  assert.deepEqual(sent, []);
  assert.deepEqual(engine.snapshot(), {});
});

test('a look drives its targets and only sends when the color changes', () => {
  const { engine, sent, step } = setup();
  engine.setScene(scene([solid('red', '#ff0000', ['a'])]));
  assert.equal(engine.setLook('red'), true);
  step();
  step();
  assert.deepEqual(sent, [['a', RED]]);
  assert.deepEqual(engine.snapshot(), { a: 0xff0000 });
});

test('rejects a look that is not in the active scene', () => {
  const { engine } = setup();
  engine.setScene(scene());
  assert.equal(engine.setLook('nope'), false);
});

test('turning the look off falls back to the manual color, or darkness without one', () => {
  const { engine, sent, step } = setup();
  engine.setScene(scene([solid('red', '#ff0000')]));
  engine.setManual(['a'], BLUE);
  engine.setLook('red');
  step();
  sent.length = 0;

  engine.setLook(null);
  step();
  assert.deepEqual(sent, [
    ['a', BLUE],
    ['b', { r: 0, g: 0, b: 0 }],
  ]);

  // "b" was handed back after going dark: nothing more is sent to it.
  sent.length = 0;
  step();
  assert.deepEqual(sent, []);
  assert.deepEqual(engine.snapshot(), { a: 0x0000ff });
});

test('later layers win over earlier ones', () => {
  const { engine, step } = setup();
  const look: Look = {
    id: 'mixed',
    name: 'mixed',
    layers: [
      { id: 'base', effect: 'solid', targets: null, params: { color: '#ff0000' } },
      { id: 'top', effect: 'solid', targets: ['b'], params: { color: '#0000ff' } },
    ],
  };
  engine.setScene(scene([look]));
  engine.setLook('mixed');
  step();
  assert.deepEqual(engine.snapshot(), { a: 0xff0000, b: 0x0000ff });
});

test('master dimmer and blackout scale the output', () => {
  const { engine, step } = setup();
  engine.setScene(scene([solid('red', '#ff0000', ['a'])]));
  engine.setLook('red');
  engine.setMaster(0.5);
  step();
  assert.deepEqual(engine.snapshot(), { a: 0x800000 });

  engine.setBlackout(true);
  step();
  assert.deepEqual(engine.snapshot(), { a: 0x000000 });
});

test('a flash covers the look and then gives way to it', () => {
  const { engine, step } = setup();
  engine.setScene(scene([solid('red', '#ff0000')]));
  engine.setLook('red');
  engine.flash(['a'], BLUE, 500);
  step();
  assert.deepEqual(engine.snapshot(), { a: 0x0000ff, b: 0xff0000 });

  step(600);
  assert.deepEqual(engine.snapshot(), { a: 0xff0000, b: 0xff0000 });
});

test('throttles updates per lamp but always delivers the final color', () => {
  const { engine, sent, step } = setup(100);
  engine.setScene(scene());
  engine.setManual(['a'], RED);
  step();
  engine.setManual(['a'], BLUE);
  step();
  assert.deepEqual(sent, [['a', RED]]);

  step(100);
  assert.deepEqual(sent, [
    ['a', RED],
    ['a', BLUE],
  ]);
});

test('resend pushes the current color again', () => {
  const { engine, sent, step } = setup();
  engine.setScene(scene());
  engine.setManual(['a'], RED);
  step();
  engine.resend('a');
  step();
  assert.deepEqual(sent, [
    ['a', RED],
    ['a', RED],
  ]);
});

test('editing a layer keeps the look playing with the new params', () => {
  const { engine, step } = setup();
  engine.setScene(scene([solid('look', '#ff0000')]));
  engine.setLook('look');
  step();

  engine.setScene(scene([solid('look', '#0000ff')]));
  step();
  assert.equal(engine.activeLookId, 'look');
  assert.deepEqual(engine.snapshot(), { a: 0x0000ff, b: 0x0000ff });
});

test('switching scenes stops the look and darkens the lamps left behind', () => {
  const { engine, step } = setup();
  engine.setScene(scene([solid('red', '#ff0000')]));
  engine.setLook('red');
  step();

  engine.setScene({ ...scene(), id: 'other', fixtures: [] });
  step();
  assert.equal(engine.activeLookId, null);
  assert.deepEqual(engine.snapshot(), {});
});
