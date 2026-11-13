import { converter } from 'culori';
import type { Rgb } from './types';

const toLrgb = converter('lrgb');
const toRgb = converter('rgb');

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * White-balance a sampled color using a sample of blank paper from the same
 * photo. Applies a per-channel gain in linear light so the paper maps to pure
 * white, which corrects both color cast and exposure.
 */
export function whiteBalance(sample: Rgb, paper: Rgb): Rgb {
  const p = toLrgb({ mode: 'rgb', r: paper.r, g: paper.g, b: paper.b });
  const s = toLrgb({ mode: 'rgb', r: sample.r, g: sample.g, b: sample.b });
  const min = 0.02;
  if (p.r < min || p.g < min || p.b < min) {
    throw new Error('The paper sample is too dark to calibrate with');
  }
  const out = toRgb({
    mode: 'lrgb',
    r: clamp01(s.r / p.r),
    g: clamp01(s.g / p.g),
    b: clamp01(s.b / p.b),
  });
  return { r: clamp01(out.r), g: clamp01(out.g), b: clamp01(out.b) };
}
