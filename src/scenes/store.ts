import fs from 'fs';
import path from 'path';
import type { Scene } from '../../shared/protocol';
import { demoScene } from './demo';
import { StoreFile, storeFileSchema } from './schema';

const SAVE_DELAY_MS = 300;

/** Scenes and settings, kept in memory and mirrored to a JSON file. */
export class SceneStore {
  private data: StoreFile;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    private file: string,
    defaults: { beatSourceUrl: string | null } = { beatSourceUrl: null }
  ) {
    this.data = this.load() ?? { version: 1, activeSceneId: 'demo', beatSourceUrl: defaults.beatSourceUrl, scenes: [demoScene()] };
  }

  list(): Scene[] {
    return this.data.scenes;
  }

  get(id: string): Scene | undefined {
    return this.data.scenes.find((scene) => scene.id === id);
  }

  get activeScene(): Scene | null {
    return (this.data.activeSceneId && this.get(this.data.activeSceneId)) || null;
  }

  get beatSourceUrl(): string | null {
    return this.data.beatSourceUrl;
  }

  setBeatSourceUrl(url: string | null): void {
    this.data.beatSourceUrl = url;
    this.scheduleSave();
  }

  save(scene: Scene): void {
    const index = this.data.scenes.findIndex((existing) => existing.id === scene.id);
    if (index === -1) this.data.scenes.push(scene);
    else this.data.scenes[index] = scene;
    this.scheduleSave();
  }

  /** Removes a scene. Returns false if it does not exist. */
  delete(id: string): boolean {
    const index = this.data.scenes.findIndex((scene) => scene.id === id);
    if (index === -1) return false;

    this.data.scenes.splice(index, 1);
    if (this.data.activeSceneId === id) this.data.activeSceneId = this.data.scenes[0]?.id ?? null;
    this.scheduleSave();
    return true;
  }

  activate(id: string): boolean {
    if (!this.get(id)) return false;
    this.data.activeSceneId = id;
    this.scheduleSave();
    return true;
  }

  /** Writes pending changes right away. */
  flush(): void {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.write();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.write();
    }, SAVE_DELAY_MS);
  }

  private write(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // Write then rename, so a crash mid-write cannot leave a truncated file behind.
      const temp = `${this.file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(this.data, null, 2));
      fs.renameSync(temp, this.file);
    } catch (error) {
      console.error(`[store] could not save ${this.file}: ${(error as Error).message}`);
    }
  }

  private load(): StoreFile | null {
    if (!fs.existsSync(this.file)) return null;

    try {
      return storeFileSchema.parse(JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch (error) {
      // Keep the unreadable file around instead of overwriting the user's scenes with the demo.
      const backup = `${this.file}.invalid-${Date.now()}`;
      fs.renameSync(this.file, backup);
      console.error(`[store] ${this.file} is not valid, moved it to ${backup}: ${(error as Error).message}`);
      return null;
    }
  }
}
