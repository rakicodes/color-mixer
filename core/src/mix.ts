import type { Oklab } from './types';

export type MixModelId = 'oklab' | 'bl-rgb' | 'bl-spectral' | 'km-spectral';

/**
 * A way of predicting paint mixes. Each model works in its own internal
 * representation `T` (e.g. absorbance per wavelength), so the solver can
 * convert each color once and then mix and dilute cheaply.
 */
export interface MixModel<T = unknown> {
  readonly id: MixModelId;
  /** Name for menus. */
  readonly label: string;
  /** Very short name for badges, e.g. in the mix history. */
  readonly shortLabel: string;
  /** One-line explanation for painters. */
  readonly description: string;
  encode(c: Oklab): T;
  /** Mix `added` into `base`; `fraction` (0..1) is the share of the result from `added`. */
  mix(base: T, added: T, fraction: number): T;
  /** Add water; `fraction` (0..1) is the share of the result that is water. */
  dilute(c: T, fraction: number): T;
  decode(x: T): Oklab;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Calibrated paper is white by definition (see whiteBalance). */
export const PAPER_WHITE: Oklab = { l: 1, a: 0, b: 0 };

/** Linear interpolation in OKLab. Simple, but poor for mixes of different hues. */
export const oklabMixModel: MixModel<Oklab> = {
  id: 'oklab',
  label: 'Simple blend (OKLab)',
  shortLabel: 'Blend',
  description: 'Averages the colors. Fast and predictable, but mixes of different hues come out too gray (blue + yellow ≠ green).',
  encode: (c) => c,
  decode: (c) => c,
  mix: (a, b, t) => ({ l: lerp(a.l, b.l, t), a: lerp(a.a, b.a, t), b: lerp(a.b, b.b, t) }),
  dilute: (c, w) => (w <= 0 ? c : { l: lerp(c.l, 1, w), a: lerp(c.a, 0, w), b: lerp(c.b, 0, w) }),
};

/** Element-wise helpers for the vector-based models. */
export function lerpVec(a: Float64Array, b: Float64Array, t: number): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

export function scaleVec(a: Float64Array, k: number): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * k;
  return out;
}
