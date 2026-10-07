import type { Fixture, FixtureKind, Scene } from '../../../shared/protocol';
import { command, newId, select, selectLamp, updateActiveScene, useStore } from '../lib/store';
import { LampDot } from './LampDot';

const KIND_LABEL: Record<FixtureKind, string> = {
  wiz: 'WiZ',
  'magic-home': 'Magic Home',
  arduino: 'Arduino',
  sim: 'Simulated',
};

function identify(id: string): void {
  void command('flash', { fixtureIds: [id], color: '#ffffff', durationMs: 700 });
}

export function LampList({ scene }: { scene: Scene }) {
  const fixtures = useStore((state) => state.app?.fixtures ?? []);
  const selected = useStore((state) => state.selected);

  const devices = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const placed = new Set(scene.fixtures.map((fixture) => fixture.id));
  const unplaced = fixtures.filter((fixture) => !placed.has(fixture.id));
  const allSelected = scene.fixtures.length > 0 && selected.length === scene.fixtures.length;

  const addSimulated = () => {
    const id = newId('sim:lamp');
    const count = scene.fixtures.filter((fixture) => fixture.kind === 'sim').length;
    updateActiveScene((current) => ({
      ...current,
      fixtures: [...current.fixtures, { id, kind: 'sim', name: `Simulated ${count + 1}`, position: { x: 0, y: 1.5, z: 0 } }],
    }));
    select([id]);
  };

  const place = (device: Fixture) => {
    updateActiveScene((current) => ({
      ...current,
      fixtures: [...current.fixtures, { id: device.id, kind: device.kind, name: device.name, position: { x: 0, y: 1.5, z: 0 } }],
    }));
    select([device.id]);
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="heading">Lamps in this scene</h2>
          {scene.fixtures.length > 0 && (
            <button className="btn btn-quiet !min-h-0 !px-1" onClick={() => select(allSelected ? [] : scene.fixtures.map((fixture) => fixture.id))}>
              {allSelected ? 'Select none' : 'Select all'}
            </button>
          )}
        </div>

        <ul className="flex flex-col gap-1">
          {scene.fixtures.map((fixture) => {
            const device = devices.get(fixture.id);
            const isSelected = selected.includes(fixture.id);
            const status = fixture.kind === 'sim' ? null : device?.online ? 'online' : 'offline';

            return (
              <li key={fixture.id}>
                <button
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${
                    isSelected ? 'border-tungsten bg-raised' : 'border-transparent hover:bg-raised'
                  }`}
                  aria-pressed={isSelected}
                  onClick={(event) => selectLamp(fixture.id, event.shiftKey || event.metaKey || event.ctrlKey)}
                >
                  <LampDot id={fixture.id} />
                  <span className="min-w-0 flex-1 truncate">{fixture.name}</span>
                  <span className={`text-xs ${status === 'offline' ? 'text-alarm' : 'text-dim'}`}>
                    {KIND_LABEL[fixture.kind]}
                    {status === 'offline' && ', offline'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {scene.fixtures.length === 0 && <p className="text-dim">No lamps placed yet.</p>}

        <button className="btn mt-3 w-full" onClick={addSimulated}>
          Add simulated lamp
        </button>
      </section>

      <section>
        <h2 className="heading mb-2">Detected on the network</h2>
        {unplaced.length === 0 ? (
          <p className="text-dim">
            {fixtures.length === 0
              ? 'No lamps found yet. The server keeps looking for WiZ, Magic Home and Arduino lamps every few seconds.'
              : 'Every detected lamp is already in this scene.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unplaced.map((device) => (
              <li key={device.id} className="rounded-lg border border-line p-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${device.online ? 'bg-live' : 'bg-alarm'}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{device.name}</span>
                </div>
                <div className="mb-2 text-xs text-dim">
                  {KIND_LABEL[device.kind]}, {device.address}
                  {!device.online && ', offline'}
                </div>
                <div className="flex gap-2">
                  <button className="btn flex-1" onClick={() => place(device)}>
                    Add to scene
                  </button>
                  <button className="btn" disabled={!device.online} title="Flash this lamp to see which one it is" onClick={() => identify(device.id)}>
                    Identify
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
