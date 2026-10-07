import { create } from 'zustand';
import type { AckResult, AppState, BeatInfo, ClientToServerEvents, Scene } from '../../../shared/protocol';
import { socket } from './socket';

interface Store {
  connected: boolean;
  app: AppState | null;
  /** Ids of the lamps selected in the active scene. */
  selected: string[];
  /** The look open in the editor. */
  editingLookId: string | null;
  beat: BeatInfo;
  /** How long a pad keeps its color, in ms. */
  flashMs: number;
  notice: string | null;
}

const FLASH_KEY = 'light-stage:flash-ms';

function storedFlashMs(): number {
  try {
    const value = Number(localStorage.getItem(FLASH_KEY));
    return value >= 50 && value <= 3000 ? value : 400;
  } catch {
    return 400;
  }
}

export const useStore = create<Store>(() => ({
  connected: false,
  app: null,
  selected: [],
  editingLookId: null,
  beat: { count: 0, bpm: null },
  flashMs: storedFlashMs(),
  notice: null,
}));

/** Scene saves still waiting for the server's answer. */
let pendingSaves = 0;
let noticeTimer: number | undefined;

export function notify(message: string): void {
  useStore.setState({ notice: message });
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => useStore.setState({ notice: null }), 5000);
}

socket.on('connect', () => useStore.setState({ connected: true }));
socket.on('disconnect', () => useStore.setState({ connected: false }));
socket.on('beat', (beat) => useStore.setState({ beat }));

socket.on('state', (incoming) => {
  useStore.setState((current) => {
    // While our own edits are in flight the server's scenes are older than ours; taking them would make
    // a slider or a lamp being dragged jump back.
    const app = pendingSaves > 0 && current.app ? { ...incoming, scenes: current.app.scenes } : incoming;
    const scene = app.scenes.find((candidate) => candidate.id === app.runtime.activeSceneId);
    const lampIds = new Set(scene?.fixtures.map((fixture) => fixture.id));

    return {
      app,
      selected: current.selected.filter((id) => lampIds.has(id)),
      editingLookId: scene?.looks.some((look) => look.id === current.editingLookId) ? current.editingLookId : null,
    };
  });
});

type CommandName = Exclude<keyof ClientToServerEvents, 'beat:tap'>;
type CommandPayload<K extends CommandName> = Parameters<ClientToServerEvents[K]>[0];

/** Sends a command and surfaces the server's refusal, if any. */
export function command<K extends CommandName>(event: K, payload: CommandPayload<K>): Promise<AckResult> {
  return new Promise((resolve) => {
    const emit = socket.emit as (event: string, payload: unknown, ack: (result: AckResult) => void) => void;
    emit.call(socket, event, payload, (result) => {
      if (!result.ok) notify(result.error);
      resolve(result);
    });
  });
}

export function tapBeat(): void {
  socket.emit('beat:tap');
}

export function activeScene(app: AppState | null): Scene | null {
  return app?.scenes.find((scene) => scene.id === app.runtime.activeSceneId) ?? null;
}

export function useActiveScene(): Scene | null {
  return useStore((state) => activeScene(state.app));
}

/** Applies the scene locally right away and sends it to the server. */
export function saveScene(scene: Scene): void {
  useStore.setState((current) => {
    if (!current.app) return current;
    const exists = current.app.scenes.some((candidate) => candidate.id === scene.id);
    const scenes = exists ? current.app.scenes.map((candidate) => (candidate.id === scene.id ? scene : candidate)) : [...current.app.scenes, scene];
    return { app: { ...current.app, scenes } };
  });

  pendingSaves += 1;
  void command('scene:save', scene).finally(() => {
    pendingSaves -= 1;
  });
}

export function updateActiveScene(change: (scene: Scene) => Scene): void {
  const scene = activeScene(useStore.getState().app);
  if (scene) saveScene(change(scene));
}

export function select(ids: string[]): void {
  useStore.setState({ selected: ids });
}

/** Click selects just that lamp; with a modifier key it is added to or removed from the selection. */
export function selectLamp(id: string, additive: boolean): void {
  useStore.setState(({ selected }) => {
    if (!additive) return { selected: [id] };
    return { selected: selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id] };
  });
}

/** Short random id. `crypto.randomUUID` is not available when the page is opened over plain HTTP on the LAN. */
export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function setFlashMs(flashMs: number): void {
  useStore.setState({ flashMs });
  try {
    localStorage.setItem(FLASH_KEY, String(flashMs));
  } catch {
    // Storage is unavailable (private window): the setting just does not persist.
  }
}

/** Flashes a pad color on the selected lamps, or on the whole scene when nothing is selected. */
export function flashPad(color: string): void {
  const { selected, flashMs } = useStore.getState();
  void command('flash', { fixtureIds: selected.length > 0 ? selected : null, color, durationMs: flashMs });
}

/** Plays a look, or stops it if it is the one playing. */
export function toggleLook(id: string): void {
  const playing = useStore.getState().app?.runtime.activeLookId;
  void command('look:activate', { id: playing === id ? null : id });
}
