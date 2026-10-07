import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { hexToRgb, hsvToRgb, mix, rgbToInt } from './color';
import { toWizPilot } from './drivers/wiz';
import { BeatTracker } from './engine/beat';
import { broadcastAddress } from './net';
import { FixtureRegistry } from './registry';
import { demoScene } from './scenes/demo';
import { sceneSchema } from './scenes/schema';
import { SceneStore } from './scenes/store';

test('color helpers', () => {
  assert.deepEqual(hexToRgb('#ff8000'), { r: 255, g: 128, b: 0 });
  assert.deepEqual(hexToRgb('nonsense'), { r: 0, g: 0, b: 0 });
  assert.equal(rgbToInt({ r: 300, g: 127.6, b: -4 }), 0xff8000);
  assert.deepEqual(mix({ r: 0, g: 0, b: 0 }, { r: 200, g: 100, b: 0 }, 0.5), { r: 100, g: 50, b: 0 });
  assert.equal(rgbToInt(hsvToRgb(0, 1, 1)), 0xff0000);
  assert.equal(rgbToInt(hsvToRgb(1 / 3, 1, 1)), 0x00ff00);
  assert.equal(rgbToInt(hsvToRgb(-1 / 3, 1, 1)), 0x0000ff);
});

test('broadcast address', () => {
  assert.equal(broadcastAddress('192.168.100.87', '255.255.255.0'), '192.168.100.255');
  assert.equal(broadcastAddress('10.1.2.3', '255.255.240.0'), '10.1.15.255');
  assert.throws(() => broadcastAddress('10.1.2', '255.255.255.0'));
});

test('WiZ gets brightness as dimming and is switched off when dark', () => {
  assert.deepEqual(toWizPilot({ r: 0, g: 0, b: 0 }), { state: false });
  assert.deepEqual(toWizPilot({ r: 255, g: 0, b: 0 }), { state: true, r: 255, g: 0, b: 0, dimming: 100 });
  assert.deepEqual(toWizPilot({ r: 51, g: 17, b: 0 }), { state: true, r: 255, g: 85, b: 0, dimming: 20 });
  assert.deepEqual(toWizPilot({ r: 5, g: 5, b: 5 }), { state: true, r: 255, g: 255, b: 255, dimming: 10 });
});

test('beat tracker estimates the tempo and forgets it after a pause', () => {
  const tracker = new BeatTracker();
  assert.equal(tracker.bpm, null);
  for (let i = 0; i < 5; i++) tracker.beat(10_000 + i * 500);
  assert.equal(tracker.count, 5);
  assert.equal(tracker.bpm, 120);

  tracker.beat(60_000);
  assert.equal(tracker.bpm, null);
});

test('registry tracks devices going offline and coming back', () => {
  let now = 0;
  const registry = new FixtureRegistry(() => now);
  const online: string[] = [];
  registry.on('online', (fixture) => online.push(fixture.id));

  const lamp = { id: 'wiz:abc', kind: 'wiz' as const, name: 'Lamp', address: '10.0.0.5' };
  registry.seen(lamp);
  now = 40_000;
  registry.sweep();
  assert.equal(registry.get('wiz:abc')?.online, false);

  registry.seen({ ...lamp, address: '10.0.0.9' });
  assert.deepEqual(registry.list(), [{ ...lamp, address: '10.0.0.9', online: true }]);
  assert.deepEqual(online, ['wiz:abc', 'wiz:abc']);
});

test('the demo scene is a valid scene', () => {
  assert.deepEqual(sceneSchema.parse(demoScene()), demoScene());
});

test('scene schema rejects broken scenes', () => {
  const scene = demoScene();
  assert.equal(sceneSchema.safeParse({ ...scene, fixtures: [scene.fixtures[0], scene.fixtures[0]] }).success, false);
  assert.equal(sceneSchema.safeParse({ ...scene, room: { ...scene.room, width: 0 } }).success, false);
  assert.equal(sceneSchema.safeParse({ ...scene, pads: [{ key: 'q', color: 'red' }] }).success, false);
});

test('store persists scenes and survives a corrupt file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lights-store-'));
  const file = path.join(dir, 'nested', 'scenes.json');

  const store = new SceneStore(file);
  assert.equal(store.activeScene?.id, 'demo');
  store.save({ ...demoScene(), id: 'living', name: 'Living room' });
  assert.equal(store.activate('living'), true);
  assert.equal(store.activate('missing'), false);
  store.flush();

  const reloaded = new SceneStore(file);
  assert.deepEqual(
    reloaded.list().map((scene) => scene.id),
    ['demo', 'living']
  );
  assert.equal(reloaded.activeScene?.name, 'Living room');

  assert.equal(reloaded.delete('living'), true);
  assert.equal(reloaded.activeScene?.id, 'demo');
  reloaded.flush();

  fs.writeFileSync(file, '{ not json');
  const recovered = new SceneStore(file);
  assert.equal(recovered.activeScene?.id, 'demo');
  assert.equal(fs.readdirSync(path.dirname(file)).filter((name) => name.includes('.invalid-')).length, 1);

  fs.rmSync(dir, { recursive: true });
});
