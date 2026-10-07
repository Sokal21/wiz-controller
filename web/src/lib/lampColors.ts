import { socket } from './socket';

/**
 * Live lamp colors as 0xRRGGBB. They change up to 30 times a second, so they are kept out of React state:
 * the 3D stage reads the map every frame and the few DOM swatches subscribe and repaint themselves.
 */
export const lampColors = new Map<string, number>();

const listeners = new Set<() => void>();

export function onLampColors(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The server sends a full snapshot after connecting; anything from before may be stale.
socket.on('connect', () => lampColors.clear());

socket.on('colors', (changed) => {
  for (const [id, color] of Object.entries(changed)) lampColors.set(id, color);
  listeners.forEach((listener) => listener());
});

export function toCss(color: number | undefined): string {
  return `#${(color ?? 0).toString(16).padStart(6, '0')}`;
}
