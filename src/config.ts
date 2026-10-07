import path from 'path';

const HARDWARE_DRIVERS = ['wiz', 'magic-home', 'arduino'] as const;
export type HardwareDriver = (typeof HARDWARE_DRIVERS)[number];

function parseDrivers(value: string | undefined): HardwareDriver[] {
  if (value === undefined) return [...HARDWARE_DRIVERS];
  const requested = value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = requested.filter((name) => name !== 'none' && !HARDWARE_DRIVERS.includes(name as HardwareDriver));
  if (unknown.length > 0) {
    throw new Error(`Unknown driver(s) in DRIVERS: ${unknown.join(', ')}. Valid: ${HARDWARE_DRIVERS.join(', ')}, none`);
  }
  return HARDWARE_DRIVERS.filter((name) => requested.includes(name));
}

function parseInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
  return value;
}

function parseColorOrder(value: string | undefined): 'rgb' | 'grb' {
  if (value === undefined) return 'grb';
  if (value !== 'rgb' && value !== 'grb') throw new Error(`MH_COLOR_ORDER must be "rgb" or "grb", got "${value}"`);
  return value;
}

export const config = {
  port: parseInteger('PORT', 3000),
  dataDir: path.resolve(process.env.DATA_DIR ?? 'data'),
  /** Hardware drivers to start. `DRIVERS=none` runs with simulated lamps only. */
  drivers: parseDrivers(process.env.DRIVERS),
  /** WebSocket that pushes `{"type":"beat"}` messages. Only used until one is set from the UI. */
  beatSourceUrl: process.env.BEAT_WS_URL || null,
  /** Channel order of the Magic Home strips. */
  magicHomeColorOrder: parseColorOrder(process.env.MH_COLOR_ORDER),
  arduinoLedCount: parseInteger('ARDUINO_LED_COUNT', 300),
};
