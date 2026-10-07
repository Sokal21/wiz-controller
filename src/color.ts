import type { RGB } from '../shared/protocol';

export const BLACK: RGB = { r: 0, g: 0, b: 0 };

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function hexToRgb(hex: string): RGB {
  if (!HEX_COLOR.test(hex)) return BLACK;
  const value = parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

export function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function rgbToInt({ r, g, b }: RGB): number {
  return (clampChannel(r) << 16) | (clampChannel(g) << 8) | clampChannel(b);
}

export function mix(from: RGB, to: RGB, amount: number): RGB {
  const t = Math.max(0, Math.min(1, amount));
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  };
}

export function scale(color: RGB, factor: number): RGB {
  return { r: color.r * factor, g: color.g * factor, b: color.b * factor };
}

/** h, s, v in 0..1. */
export function hsvToRgb(h: number, s: number, v: number): RGB {
  const hue = (((h % 1) + 1) % 1) * 6;
  const sector = Math.floor(hue);
  const f = hue - sector;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][sector % 6];
  return { r: r * 255, g: g * 255, b: b * 255 };
}
