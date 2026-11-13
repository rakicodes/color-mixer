import { converter } from 'culori';
import type { Oklab } from '../types';
import { BANDS, BASE_SPECTRA, CMF_D65 } from './data';

/** A reflectance spectrum: BANDS values in (0, 1], 380–750 nm in 10 nm steps. */
export type Spectrum = Float64Array;

/** Floor for reflectance, so logarithms and K/S stay finite for very dark colors. */
export const MIN_REFLECTANCE = 1e-4;

const toLrgb = converter('lrgb');
const toOklabC = converter('oklab');

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function oklabToLinearRgb(c: Oklab): [number, number, number] {
  const l = toLrgb({ mode: 'oklab', l: c.l, a: c.a, b: c.b });
  return [clamp(l.r, 0, 1), clamp(l.g, 0, 1), clamp(l.b, 0, 1)];
}

export function linearRgbToOklab(r: number, g: number, b: number): Oklab {
  const o = toOklabC({ mode: 'lrgb', r, g, b });
  return { l: o.l, a: o.a, b: o.b };
}

/**
 * Builds a smooth, plausible reflectance spectrum for a linear-RGB color by
 * splitting it into white + secondary (C/M/Y) + primary (R/G/B) parts and
 * summing their base spectra. Same method as spectral.js.
 */
export function linearRgbToSpectrum(rgb: readonly [number, number, number]): Spectrum {
  const w = Math.min(rgb[0], rgb[1], rgb[2]);
  const r0 = rgb[0] - w;
  const g0 = rgb[1] - w;
  const b0 = rgb[2] - w;
  const c = Math.min(g0, b0);
  const m = Math.min(r0, b0);
  const y = Math.min(r0, g0);
  const r = Math.max(0, Math.min(r0 - b0, r0 - g0));
  const g = Math.max(0, Math.min(g0 - b0, g0 - r0));
  const b = Math.max(0, Math.min(b0 - g0, b0 - r0));

  const out = new Float64Array(BANDS);
  const S = BASE_SPECTRA;
  for (let i = 0; i < BANDS; i++) {
    const v = w * S.W[i] + c * S.C[i] + m * S.M[i] + y * S.Y[i] + r * S.R[i] + g * S.G[i] + b * S.B[i];
    out[i] = clamp(v, MIN_REFLECTANCE, 1);
  }
  return out;
}

/** Spectrum → CIE XYZ (D65), with Y = 1 for a perfect white reflector. */
export function spectrumToXyz(R: Spectrum): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  const [cx, cy, cz] = CMF_D65;
  for (let i = 0; i < BANDS; i++) {
    x += cx[i] * R[i];
    y += cy[i] * R[i];
    z += cz[i] * R[i];
  }
  return [x, y, z];
}

export function spectrumToOklab(R: Spectrum): Oklab {
  const [x, y, z] = spectrumToXyz(R);
  const o = toOklabC({ mode: 'xyz65', x, y, z });
  return { l: o.l, a: o.a, b: o.b };
}

export const oklabToSpectrum = (c: Oklab): Spectrum => linearRgbToSpectrum(oklabToLinearRgb(c));
