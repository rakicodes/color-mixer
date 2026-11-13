import { converter, differenceCiede2000, formatHex, parse } from 'culori';
import type { Oklab, Rgb } from './types';

const toOklabC = converter('oklab');
const toRgbC = converter('rgb');
const toOklchC = converter('oklch');
const de2000 = differenceCiede2000();

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function isValidHex(hex: string): boolean {
  return /^#?[0-9a-f]{6}$/i.test(hex.trim());
}

export function normalizeHex(hex: string): string {
  const h = hex.trim().toLowerCase();
  return h.startsWith('#') ? h : `#${h}`;
}

export function parseHex(hex: string): Rgb {
  const c = parse(normalizeHex(hex));
  if (!c) throw new Error(`Invalid color: ${hex}`);
  const rgb = toRgbC(c);
  return { r: rgb.r, g: rgb.g, b: rgb.b };
}

export function rgbToHex(c: Rgb): string {
  return formatHex({ mode: 'rgb', r: clamp01(c.r), g: clamp01(c.g), b: clamp01(c.b) });
}

export function rgbToOklab(c: Rgb): Oklab {
  const o = toOklabC({ mode: 'rgb', r: c.r, g: c.g, b: c.b });
  return { l: o.l, a: o.a, b: o.b };
}

export function oklabToRgb(c: Oklab): Rgb {
  const rgb = toRgbC({ mode: 'oklab', l: c.l, a: c.a, b: c.b });
  return { r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b) };
}

export const hexToOklab = (hex: string): Oklab => rgbToOklab(parseHex(hex));
export const oklabToHex = (c: Oklab): string => rgbToHex(oklabToRgb(c));

/** CIEDE2000 color difference. About 1 is barely noticeable; under 3 is a close match. */
export function deltaE(a: Oklab, b: Oklab): number {
  return de2000({ mode: 'oklab', l: a.l, a: a.a, b: a.b }, { mode: 'oklab', l: b.l, a: b.a, b: b.b });
}

export function toOklch(c: Oklab): { l: number; c: number; h: number | undefined } {
  const o = toOklchC({ mode: 'oklab', l: c.l, a: c.a, b: c.b });
  return { l: o.l, c: o.c, h: o.h };
}
