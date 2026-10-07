import { useEffect, useRef, useState } from 'react';
import type { RuntimeState, Scene } from '../../../shared/protocol';
import { command, newId, saveScene, tapBeat, updateActiveScene, useStore } from '../lib/store';
import { useMicBeats } from '../lib/useMicBeats';

const DEFAULT_PADS = [
  ['q', '#ff3b30'],
  ['w', '#ff9500'],
  ['e', '#ffd60a'],
  ['a', '#34c759'],
  ['s', '#00c7be'],
  ['d', '#0a84ff'],
  ['z', '#5e5ce6'],
  ['x', '#ff2d92'],
  ['c', '#ffffff'],
].map(([key, color]) => ({ key, color }));

function ScenePicker({ scene, scenes }: { scene: Scene | null; scenes: Scene[] }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = window.setTimeout(() => setConfirmingDelete(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmingDelete]);

  const open = (candidate: Scene) => {
    saveScene(candidate);
    void command('scene:activate', { id: candidate.id });
  };

  const create = () =>
    open({
      id: newId('scene'),
      name: `Scene ${scenes.length + 1}`,
      room: { width: 6, depth: 5, height: 2.8 },
      fixtures: [],
      looks: [],
      pads: DEFAULT_PADS,
    });

  // Simulated lamps belong to one scene, so the copy gets its own.
  const duplicate = (source: Scene) => {
    const ids = new Map(source.fixtures.filter((lamp) => lamp.kind === 'sim').map((lamp) => [lamp.id, newId('sim:lamp')]));
    const remap = (id: string) => ids.get(id) ?? id;

    open({
      ...source,
      id: newId('scene'),
      name: `${source.name} copy`.slice(0, 60),
      fixtures: source.fixtures.map((lamp) => ({ ...lamp, id: remap(lamp.id) })),
      looks: source.looks.map((look) => ({
        ...look,
        id: newId('look'),
        layers: look.layers.map((layer) => ({ ...layer, id: newId('layer'), targets: layer.targets && layer.targets.map(remap) })),
      })),
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="field !w-40"
        aria-label="Scene"
        value={scene?.id ?? ''}
        onChange={(event) => void command('scene:activate', { id: event.target.value })}
      >
        {!scene && <option value="">No scene</option>}
        {scenes.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      {scene && (
        <input
          className="field !w-40"
          aria-label="Scene name"
          value={scene.name}
          maxLength={60}
          onChange={(event) => updateActiveScene((current) => ({ ...current, name: event.target.value }))}
        />
      )}
      <button className="btn" onClick={create}>
        New scene
      </button>
      {scene && (
        <>
          <button className="btn" onClick={() => duplicate(scene)}>
            Duplicate
          </button>
          <button
            className={`btn btn-danger ${confirmingDelete ? 'btn-on' : ''}`}
            onClick={() => {
              if (!confirmingDelete) return setConfirmingDelete(true);
              setConfirmingDelete(false);
              void command('scene:delete', { id: scene.id });
            }}
          >
            {confirmingDelete ? `Delete "${scene.name}"?` : 'Delete'}
          </button>
        </>
      )}
    </div>
  );
}

function BeatControls({ source }: { source: RuntimeState['beatSource'] }) {
  const beat = useStore((state) => state.beat);
  const mic = useMicBeats();
  const [url, setUrl] = useState(source.url ?? '');
  const lamp = useRef<HTMLSpanElement>(null);

  useEffect(() => setUrl(source.url ?? ''), [source.url]);

  // Blink on every beat.
  useEffect(() => {
    if (beat.count === 0) return;
    lamp.current?.animate([{ opacity: 1 }, { opacity: 0.15 }], { duration: 220, easing: 'ease-out' });
  }, [beat.count]);

  return (
    <div className="flex items-center gap-2">
      <span ref={lamp} className="h-3 w-3 rounded-full bg-tungsten opacity-15" aria-hidden />
      <span className="w-16 tabular-nums" title="Tempo estimated from the last beats">
        {beat.bpm ?? '--'} <span className="text-dim">BPM</span>
      </span>
      <button className="btn" title="Tap the beat (Space)" onClick={tapBeat}>
        Tap
      </button>
      <button className={`btn ${mic.listening ? 'btn-on' : ''}`} aria-pressed={mic.listening} title="Detect beats with this device's microphone" onClick={() => void mic.toggle()}>
        {mic.listening ? 'Mic on' : 'Mic'}
      </button>
      <details className="relative">
        <summary className={`btn list-none ${source.connected ? 'btn-on' : ''}`} title="External beat detector">
          Beat source
        </summary>
        <form
          className="absolute right-0 top-full z-30 mt-2 flex w-80 flex-col gap-2 rounded-lg border border-line bg-panel p-3 shadow-xl shadow-black/40"
          onSubmit={(event) => {
            event.preventDefault();
            void command('beat:source', { url: url.trim() || null });
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-dim">WebSocket that sends a beat message on every beat</span>
            <input className="field" placeholder="ws://192.168.1.20:5000" value={url} spellCheck={false} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-dim">
              {source.url ? (source.connected ? 'Connected.' : 'Not connected, retrying every few seconds.') : 'No source set.'}
            </span>
            <button className="btn" type="submit">
              Save
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

function Master({ runtime }: { runtime: RuntimeState }) {
  const [level, setLevel] = useState(runtime.master);
  const input = useRef<HTMLInputElement>(null);

  // Follow other clients, but not while this slider is the one being moved.
  useEffect(() => {
    if (document.activeElement !== input.current) setLevel(runtime.master);
  }, [runtime.master]);

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2">
        <span className="text-dim">Master</span>
        <input
          ref={input}
          type="range"
          className="w-28"
          min={0}
          max={1}
          step={0.01}
          value={level}
          onChange={(event) => {
            const next = Number(event.target.value);
            setLevel(next);
            void command('master:set', { level: next });
          }}
        />
        <span className="w-10 tabular-nums">{Math.round(level * 100)}%</span>
      </label>
      <button
        className={`btn btn-danger ${runtime.blackout ? 'btn-on' : ''}`}
        aria-pressed={runtime.blackout}
        title="Turn every lamp off without stopping the look"
        onClick={() => void command('blackout:set', { on: !runtime.blackout })}
      >
        Blackout
      </button>
    </div>
  );
}

export function TopBar() {
  const app = useStore((state) => state.app);
  const connected = useStore((state) => state.connected);
  const scene = app?.scenes.find((candidate) => candidate.id === app.runtime.activeSceneId) ?? null;

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-panel px-4 py-2">
      <h1 className="text-lg font-semibold tracking-tight">Light Stage</h1>
      {app && <ScenePicker scene={scene} scenes={app.scenes} />}
      <div className="flex-1" />
      {app && <BeatControls source={app.runtime.beatSource} />}
      {app && <Master runtime={app.runtime} />}
      <span className={`flex items-center gap-1.5 text-xs ${connected ? 'text-dim' : 'text-alarm'}`} role="status">
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-live' : 'bg-alarm'}`} aria-hidden />
        {connected ? 'Connected' : 'Server offline'}
      </span>
    </header>
  );
}
