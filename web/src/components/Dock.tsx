import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import type { Scene } from '../../../shared/protocol';
import { flashPad, setFlashMs, toggleLook, updateActiveScene, useStore } from '../lib/store';

function Pads({ scene }: { scene: Scene }) {
  const flashMs = useStore((state) => state.flashMs);
  const selectedCount = useStore((state) => state.selected.length);
  const [editing, setEditing] = useState<number | null>(null);
  const editingPad = editing === null ? null : scene.pads[editing];

  const setColor = (index: number, color: string) =>
    updateActiveScene((current) => ({ ...current, pads: current.pads.map((pad, i) => (i === index ? { ...pad, color } : pad)) }));

  return (
    <section className="flex shrink-0 gap-4">
      <div className="grid grid-cols-3 gap-1.5">
        {scene.pads.map((pad, index) => (
          <button
            key={pad.key}
            className={`h-11 w-14 cursor-pointer rounded-lg border-2 text-sm font-semibold uppercase text-night ${
              editing === index ? 'border-tungsten' : 'border-transparent'
            }`}
            style={{ background: pad.color }}
            title={editing === null ? `Flash this color (key ${pad.key.toUpperCase()})` : 'Pick this pad to change its color'}
            onClick={() => (editing === null ? flashPad(pad.color) : setEditing(index))}
          >
            {pad.key}
          </button>
        ))}
      </div>

      <div className="flex w-52 flex-col gap-2">
        <div>
          <h2 className="heading">Pads</h2>
          <p className="text-xs text-dim">Flash {selectedCount > 0 ? 'the selected lamps' : 'every lamp'} with the keyboard or a click.</p>
        </div>
        {editingPad ? (
          <HexColorPicker color={editingPad.color} onChange={(color) => setColor(editing!, color)} style={{ height: 70 }} />
        ) : (
          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-xs text-dim">
              Flash length <span className="tabular-nums text-ink">{flashMs} ms</span>
            </span>
            <input type="range" min={50} max={3000} step={10} value={flashMs} onChange={(event) => setFlashMs(Number(event.target.value))} />
          </label>
        )}
        <button className={`btn ${editing !== null ? 'btn-on' : ''}`} onClick={() => setEditing(editing === null ? 0 : null)}>
          {editing === null ? 'Change pad colors' : 'Done'}
        </button>
      </div>
    </section>
  );
}

export function Dock({ scene }: { scene: Scene }) {
  const playingId = useStore((state) => state.app?.runtime.activeLookId ?? null);

  return (
    <div className="flex h-full gap-6 overflow-x-auto p-4">
      <section className="flex min-w-64 flex-1 flex-col gap-2">
        <h2 className="heading">Looks</h2>
        {scene.looks.length === 0 ? (
          <p className="text-dim">Create a look in the Looks tab to play it from here.</p>
        ) : (
          <div className="flex flex-wrap content-start gap-2 overflow-y-auto">
            {scene.looks.map((look, index) => {
              const playing = look.id === playingId;
              return (
                <button
                  key={look.id}
                  className={`btn !min-h-11 !justify-start !px-3 ${playing ? 'btn-on' : ''}`}
                  aria-pressed={playing}
                  title={index < 9 ? `Key ${index + 1}` : undefined}
                  onClick={() => toggleLook(look.id)}
                >
                  {index < 9 && <kbd className="rounded border border-line px-1.5 text-xs text-dim">{index + 1}</kbd>}
                  {look.name}
                </button>
              );
            })}
          </div>
        )}
      </section>
      <Pads scene={scene} />
    </div>
  );
}
