const RECONNECT_MS = 3_000;

/**
 * Listens to an external beat detector: a WebSocket that pushes `{"type":"beat"}` on every beat.
 * Keeps reconnecting for as long as a URL is set.
 */
export class BeatSource {
  private socket: WebSocket | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private currentUrl: string | null = null;
  private isConnected = false;

  constructor(
    private onBeat: () => void,
    private onStatus: () => void
  ) {}

  get url(): string | null {
    return this.currentUrl;
  }

  get connected(): boolean {
    return this.isConnected;
  }

  /** Throws if the URL is not a WebSocket URL. */
  setUrl(url: string | null): void {
    if (url !== null && !/^wss?:\/\//.test(url)) throw new Error('The beat source must be a ws:// or wss:// URL');

    this.disconnect();
    this.currentUrl = url;
    if (url) this.connect(url);
    this.onStatus();
  }

  stop(): void {
    this.disconnect();
    this.currentUrl = null;
  }

  private connect(url: string): void {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      console.error(`[beat] cannot connect to ${url}: ${(error as Error).message}`);
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      console.log(`[beat] connected to ${url}`);
      this.setConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        if (JSON.parse(String(event.data)).type === 'beat') this.onBeat();
      } catch {
        // Not JSON: not a beat.
      }
    };

    socket.onclose = () => {
      // A socket we dropped on purpose must not bring the old URL back.
      if (this.socket !== socket) return;
      this.socket = null;
      this.setConnected(false);
      this.retryTimer = setTimeout(() => this.connect(url), RECONNECT_MS);
    };

    // Failures also fire `close`, which is where the retry happens.
    socket.onerror = () => {};
  }

  private disconnect(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;

    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.isConnected = false;
  }

  private setConnected(connected: boolean): void {
    if (this.isConnected === connected) return;
    this.isConnected = connected;
    this.onStatus();
  }
}
