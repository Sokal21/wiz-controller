import { useState } from 'react';
import type { Scene, SceneFixture, Vec3 } from '../../../shared/protocol';
import { command, select, updateActiveScene, useStore } from '../lib/store';
import { ColorField } from './ColorField';
import { NumberField } from './NumberField';

function RoomSettings({ scene }: { scene: Scene }) {
  const setRoom = (key: keyof Scene['room'], value: number) =>
    updateActiveScene((current) => ({ ...current, room: { ...current.room, [key]: value } }));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="heading">Room</h2>
      <div className="flex gap-2">
        <NumberField label="Width" unit="m" value={scene.room.width} min={0.5} max={100} onChange={(value) => setRoom('width', value)} />
        <NumberField label="Depth" unit="m" value={scene.room.depth} min={0.5} max={100} onChange={(value) => setRoom('depth', value)} />
        <NumberField label="Height" unit="m" value={scene.room.height} min={0.5} max={100} onChange={(value) => setRoom('height', value)} />
      </div>
      <p className="text-dim">Select a lamp on the stage or in the list to rename it, move it or set its color.</p>
    </section>
  );
}

function Selection({ lamps }: { lamps: SceneFixture[] }) {
  const [color, setColor] = useState('#ffb070');
  const ids = lamps.map((lamp) => lamp.id);
  const single = lamps.length === 1 ? lamps[0] : null;

  const patch = (change: (lamp: SceneFixture) => SceneFixture) =>
    updateActiveScene((current) => ({
      ...current,
      fixtures: current.fixtures.map((lamp) => (ids.includes(lamp.id) ? change(lamp) : lamp)),
    }));

  const setAxis = (axis: keyof Vec3, value: number) => patch((lamp) => ({ ...lamp, position: { ...lamp.position, [axis]: value } }));

  const remove = () => {
    // Release them first, so real lamps do not stay lit with a color nothing controls anymore.
    void command('color:set', { fixtureIds: ids, color: null });
    updateActiveScene((current) => ({
      ...current,
      fixtures: current.fixtures.filter((lamp) => !ids.includes(lamp.id)),
      looks: current.looks.map((look) => ({
        ...look,
        layers: look.layers.map((layer) => (layer.targets ? { ...layer, targets: layer.targets.filter((id) => !ids.includes(id)) } : layer)),
      })),
    }));
    select([]);
  };

  return (
    <section className="flex flex-col gap-4">
      <h2 className="heading">{single ? 'Selected lamp' : `${lamps.length} lamps selected`}</h2>

      {single && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dim">Name</span>
            <input
              className="field"
              value={single.name}
              maxLength={60}
              onChange={(event) => patch((lamp) => ({ ...lamp, name: event.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <NumberField label="X" value={single.position.x} min={-100} max={100} onChange={(value) => setAxis('x', value)} />
            <NumberField label="Y" value={single.position.y} min={0} max={100} onChange={(value) => setAxis('y', value)} />
            <NumberField label="Z" value={single.position.z} min={-100} max={100} onChange={(value) => setAxis('z', value)} />
          </div>
          <p className="-mt-2 text-xs text-dim">Meters from the center of the floor. X runs left to right, Y is the height, Z runs back to front.</p>
        </>
      )}

      <div className="flex flex-col gap-2">
        <ColorField
          label="Manual color"
          value={color}
          onChange={(next) => {
            setColor(next);
            void command('color:set', { fixtureIds: ids, color: next });
          }}
        />
        <div className="flex gap-2">
          <button className="btn flex-1" onClick={() => void command('color:set', { fixtureIds: ids, color })}>
            Apply color
          </button>
          <button className="btn flex-1" onClick={() => void command('color:set', { fixtureIds: ids, color: null })}>
            Clear color
          </button>
        </div>
        <p className="text-xs text-dim">The manual color shows wherever the playing look does not reach.</p>
      </div>

      <div className="flex gap-2">
        <button className="btn flex-1" onClick={() => void command('flash', { fixtureIds: ids, color: '#ffffff', durationMs: 700 })}>
          Identify
        </button>
        <button className="btn btn-danger flex-1" onClick={remove}>
          Remove from scene
        </button>
      </div>
    </section>
  );
}

export function LampPanel({ scene }: { scene: Scene }) {
  const selected = useStore((state) => state.selected);
  const lamps = scene.fixtures.filter((lamp) => selected.includes(lamp.id));

  // Keyed by selection so the manual color does not carry over from one lamp to the next.
  return lamps.length > 0 ? <Selection key={selected.join('|')} lamps={lamps} /> : <RoomSettings scene={scene} />;
}
