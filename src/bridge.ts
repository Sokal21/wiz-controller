export interface Actor {
  id: string;
  name: string;
  type: 'wiz' | 'mh';
}

export interface State {
  dimming?: number;
  r?: number;
  g?: number;
  b?: number;
}

export class Store {
  data: Map<string, Actor>;

  constructor() {
    this.data = new Map<string, Actor>();
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  get(key: string): Actor | undefined {
    return this.data.get(key);
  }

  set(key: string, value: Actor): void {
    this.data.set(key, value);
  }

  delete(key: string): boolean {
    return this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

export interface Controller {
    changeLightState(bulbId: string, state: State): void;
}

export class Bridge {
  private controllers: Record<string, Controller> = {};
  private store: Store;

  constructor() {
    this.store = new Store();
  }

  getStore(): Store {
    return this.store;
  }

  getBulbs(): Array<Actor> {
    return Array.from(this.store.data.values());
  }

  setController(id: string, controller: Controller): void {
    this.controllers[id] = controller;
  }
  
  changeLightState(bulbId: string, state: {
    dimming?: number;
    r?: number;
    g?: number;
    b?: number;
  }): void {
    const bulb = this.store.get(bulbId);
    if (!bulb) {
      throw new Error(`Bulb ${bulbId} not found`);
    }


    const controller = this.controllers[bulb.type];
    if (!controller) {
      throw new Error(`Controller for ${bulb.type} not found`);
    }

    controller.changeLightState(bulbId, state);
  }
}
