import type { EffectInfo, EffectLayer, Look, ParamDef, ParamValue, Scene } from '../../../shared/protocol';
import { newId, toggleLook, updateActiveScene, useStore } from '../lib/store';
import { ColorField } from './ColorField';

function ParamField({ def, value, onChange }: { def: ParamDef; value: ParamValue | undefined; onChange: (value: ParamValue) => void }) {
  switch (def.type) {
    case 'color':
      return <ColorField label={def.label} value={typeof value === 'string' ? value : def.default} onChange={onChange} />;

    case 'number': {
      const current = typeof value === 'number' ? value : def.default;
      return (
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-dim">
            {def.label}
            <span className="tabular-nums text-ink">
              {current} {def.unit}
            </span>
          </span>
          <input type="range" min={def.min} max={def.max} step={def.step} value={current} onChange={(event) => onChange(Number(event.target.value))} />
        </label>
      );
    }

    case 'select':
      return (
        <label className="flex items-center gap-2">
          <span className="flex-1 text-dim">{def.label}</span>
          <select className="field !w-44" value={typeof value === 'string' ? value : def.default} onChange={(event) => onChange(event.target.value)}>
            {def.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );

    case 'boolean':
      return (
        <label className="flex cursor-pointer items-center gap-2">
          <span className="flex-1 text-dim">{def.label}</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-tungsten"
            checked={typeof value === 'boolean' ? value : def.default}
            onChange={(event) => onChange(event.target.checked)}
          />
        </label>
      );
  }
}

interface LayerCardProps {
  layer: EffectLayer;
  index: number;
  count: number;
  effects: EffectInfo[];
  scene: Scene;
  onChange: (layer: EffectLayer) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}

function LayerCard({ layer, index, count, effects, scene, onChange, onMove, onRemove }: LayerCardProps) {
  const selected = useStore((state) => state.selected);
  const effect = effects.find((candidate) => candidate.type === layer.effect);
  const lampNames = new Map(scene.fixtures.map((lamp) => [lamp.id, lamp.name]));
  const targetNames = layer.targets?.map((id) => lampNames.get(id)).filter(Boolean);

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-night/40 p-3">
      <div className="flex items-center gap-1">
        <select
          className="field flex-1"
          aria-label="Effect"
          value={layer.effect}
          // Params are not shared between effects, so a new effect starts from its defaults.
          onChange={(event) => onChange({ ...layer, effect: event.target.value, params: {} })}
        >
          {!effect && <option value={layer.effect}>Unknown effect ({layer.effect})</option>}
          {effects.map((option) => (
            <option key={option.type} value={option.type}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="btn btn-quiet !px-2" disabled={index === 0} aria-label="Move layer up the list" title="Move under the previous layer" onClick={() => onMove(-1)}>
          ↑
        </button>
        <button className="btn btn-quiet !px-2" disabled={index === count - 1} aria-label="Move layer down the list" title="Move over the next layer" onClick={() => onMove(1)}>
          ↓
        </button>
        <button className="btn btn-quiet !px-2" aria-label="Remove layer" title="Remove layer" onClick={onRemove}>
          ✕
        </button>
      </div>

      {effect && <p className="text-xs text-dim">{effect.description}</p>}

      <div className="flex flex-col gap-2">
        <div className="text-dim">
          Lamps: <span className="text-ink">{layer.targets ? (targetNames?.length ? targetNames.join(', ') : 'none') : 'all of them'}</span>
        </div>
        <div className="flex gap-2">
          <button
            className="btn flex-1"
            disabled={selected.length === 0}
            title={selected.length === 0 ? 'Select lamps on the stage first' : undefined}
            onClick={() => onChange({ ...layer, targets: selected })}
          >
            Use selected lamps
          </button>
          <button className="btn flex-1" disabled={layer.targets === null} onClick={() => onChange({ ...layer, targets: null })}>
            Use all lamps
          </button>
        </div>
      </div>

      {effect?.params.map((def) => (
        <ParamField
          key={`${layer.effect}:${def.key}`}
          def={def}
          value={layer.params[def.key]}
          onChange={(value) => onChange({ ...layer, params: { ...layer.params, [def.key]: value } })}
        />
      ))}
    </li>
  );
}

function LookEditor({ look, scene, effects }: { look: Look; scene: Scene; effects: EffectInfo[] }) {
  const update = (change: (look: Look) => Look) =>
    updateActiveScene((current) => ({ ...current, looks: current.looks.map((other) => (other.id === look.id ? change(other) : other)) }));

  const setLayers = (layers: EffectLayer[]) => update((current) => ({ ...current, layers }));

  const duplicate = () => {
    const copy: Look = {
      ...look,
      id: newId('look'),
      name: `${look.name} copy`.slice(0, 60),
      layers: look.layers.map((layer) => ({ ...layer, id: newId('layer') })),
    };
    updateActiveScene((current) => ({ ...current, looks: [...current.looks, copy] }));
    useStore.setState({ editingLookId: copy.id });
  };

  const remove = () => updateActiveScene((current) => ({ ...current, looks: current.looks.filter((other) => other.id !== look.id) }));

  return (
    <section className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-dim">Look name</span>
        <input className="field" value={look.name} maxLength={60} onChange={(event) => update((current) => ({ ...current, name: event.target.value }))} />
      </label>

      <div>
        <h3 className="heading">Layers</h3>
        <p className="text-xs text-dim">Each layer paints its lamps over the ones above it in this list.</p>
      </div>

      <ol className="flex flex-col gap-2">
        {look.layers.map((layer, index) => (
          <LayerCard
            key={layer.id}
            layer={layer}
            index={index}
            count={look.layers.length}
            effects={effects}
            scene={scene}
            onChange={(next) => setLayers(look.layers.map((other) => (other.id === layer.id ? next : other)))}
            onMove={(delta) => {
              const layers = [...look.layers];
              [layers[index], layers[index + delta]] = [layers[index + delta], layers[index]];
              setLayers(layers);
            }}
            onRemove={() => setLayers(look.layers.filter((other) => other.id !== layer.id))}
          />
        ))}
      </ol>
      {look.layers.length === 0 && <p className="text-dim">This look has no layers, so it shows nothing.</p>}

      <button
        className="btn"
        disabled={look.layers.length >= 16}
        onClick={() => setLayers([...look.layers, { id: newId('layer'), effect: 'solid', targets: null, params: {} }])}
      >
        Add layer
      </button>

      <div className="flex gap-2">
        <button className="btn flex-1" onClick={duplicate}>
          Duplicate look
        </button>
        <button className="btn btn-danger flex-1" onClick={remove}>
          Delete look
        </button>
      </div>
    </section>
  );
}

export function LooksPanel({ scene }: { scene: Scene }) {
  const effects = useStore((state) => state.app?.effects ?? []);
  const playingId = useStore((state) => state.app?.runtime.activeLookId ?? null);
  const editingId = useStore((state) => state.editingLookId);
  const editing = scene.looks.find((look) => look.id === editingId);

  const create = () => {
    const look: Look = {
      id: newId('look'),
      name: `Look ${scene.looks.length + 1}`,
      layers: [{ id: newId('layer'), effect: 'solid', targets: null, params: {} }],
    };
    updateActiveScene((current) => ({ ...current, looks: [...current.looks, look] }));
    useStore.setState({ editingLookId: look.id });
  };

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="heading mb-2">Looks in this scene</h2>
        <ul className="flex flex-col gap-1">
          {scene.looks.map((look) => {
            const playing = look.id === playingId;
            return (
              <li key={look.id} className={`flex items-center gap-1 rounded-lg border ${look.id === editingId ? 'border-tungsten bg-raised' : 'border-transparent'}`}>
                <button
                  className="min-w-0 flex-1 cursor-pointer truncate px-2 py-1.5 text-left"
                  aria-pressed={look.id === editingId}
                  onClick={() => useStore.setState({ editingLookId: look.id === editingId ? null : look.id })}
                >
                  {look.name}
                </button>
                <button className={`btn !min-h-7 w-16 ${playing ? 'btn-on' : ''}`} onClick={() => toggleLook(look.id)}>
                  {playing ? 'Stop' : 'Play'}
                </button>
              </li>
            );
          })}
        </ul>
        {scene.looks.length === 0 && <p className="text-dim">No looks yet. A look is a saved combination of effects for this scene.</p>}
        <button className="btn mt-3 w-full" disabled={scene.looks.length >= 100} onClick={create}>
          New look
        </button>
      </section>

      {editing ? <LookEditor look={editing} scene={scene} effects={effects} /> : scene.looks.length > 0 && <p className="text-dim">Pick a look to edit its effects.</p>}
    </div>
  );
}
