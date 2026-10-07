import { useEffect, useState } from 'react';
import { Dock } from './components/Dock';
import { LampList } from './components/LampList';
import { LampPanel } from './components/LampPanel';
import { LooksPanel } from './components/LooksPanel';
import { TopBar } from './components/TopBar';
import { useActiveScene, useStore } from './lib/store';
import { useShortcuts } from './lib/useShortcuts';
import { Stage } from './stage/Stage';

type Tab = 'lamps' | 'looks';

function App() {
  const scene = useActiveScene();
  const loaded = useStore((state) => state.app !== null);
  const connected = useStore((state) => state.connected);
  const notice = useStore((state) => state.notice);
  const hasSelection = useStore((state) => state.selected.length > 0);
  const [tab, setTab] = useState<Tab>('looks');

  useShortcuts();

  // Selecting a lamp brings up its settings.
  useEffect(() => {
    if (hasSelection) setTab('lamps');
  }, [hasSelection]);

  return (
    <div className="flex h-full flex-col">
      <TopBar />

      {scene ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(320px,1fr)_auto_auto_auto] overflow-y-auto lg:grid-cols-[270px_minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)_auto] lg:overflow-hidden">
          <aside className="order-2 border-line bg-panel lg:order-none lg:row-span-2 lg:min-h-0 lg:border-r">
            <LampList scene={scene} />
          </aside>

          <main className="order-1 min-h-0 lg:order-none">
            <Stage scene={scene} />
          </main>

          <aside className="order-4 flex flex-col border-line bg-panel lg:order-none lg:row-span-2 lg:min-h-0 lg:border-l">
            <div className="flex gap-1 border-b border-line p-2" role="tablist">
              {(['looks', 'lamps'] as const).map((id) => (
                <button key={id} role="tab" aria-selected={tab === id} className={`btn flex-1 ${tab === id ? 'btn-on' : 'btn-quiet'}`} onClick={() => setTab(id)}>
                  {id === 'looks' ? 'Looks' : hasSelection ? 'Selected lamps' : 'Room'}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4" role="tabpanel">
              {tab === 'looks' ? <LooksPanel scene={scene} /> : <LampPanel scene={scene} />}
            </div>
          </aside>

          <footer className="order-3 border-t border-line bg-panel lg:order-none lg:max-h-56">
            <Dock scene={scene} />
          </footer>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-dim">
          {!loaded
            ? connected
              ? 'Loading the scenes…'
              : 'Waiting for the light server. Start it with "yarn dev" in the project folder.'
            : 'There are no scenes. Create one with "New scene" to start placing lamps.'}
        </div>
      )}

      {notice && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-alarm bg-panel px-4 py-2 shadow-xl shadow-black/40">
          {notice}
        </div>
      )}
    </div>
  );
}

export default App;
