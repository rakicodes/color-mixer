import { lerpVec, scaleVec, type MixModel } from '../mix';
import {
  linearRgbToOklab,
  MIN_REFLECTANCE,
  oklabToLinearRgb,
  oklabToSpectrum,
  spectrumToOklab,
} from '../spectral/convert';

/*
 * Beer-Lambert on white paper. Watercolor is a transparent glaze: light goes
 * down through the paint, bounces off the paper, and comes back up, so
 *   R = R_paper · e^(-2A),  with absorbance A proportional to pigment amount.
 * Calibrated paper is white (R_paper = 1), so A = -½·ln(R).
 * Mixing averages absorbances by volume; water lowers the concentration.
 */

const toAbsorbance = (r: number) => -0.5 * Math.log(Math.max(r, MIN_REFLECTANCE));
const toReflectance = (a: number) => Math.exp(-2 * a);

function absorbanceOf(values: ArrayLike<number>): Float64Array {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = toAbsorbance(values[i]);
  return out;
}

function reflectanceOf(a: Float64Array): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = toReflectance(a[i]);
  return out;
}

const mix = (a: Float64Array, b: Float64Array, t: number) => lerpVec(a, b, t);
const dilute = (a: Float64Array, w: number) => (w <= 0 ? a : scaleVec(a, 1 - w));

/** Beer-Lambert on the three linear-RGB channels. */
export const beerLambertRgbModel: MixModel<Float64Array> = {
  id: 'bl-rgb',
  label: 'Transparent glaze (RGB)',
  shortLabel: 'Glaze RGB',
  description:
    'Beer-Lambert per color channel: paints filter light like transparent glazes on white paper. Fast; blue + yellow makes green, though a bit dull.',
  encode: (c) => absorbanceOf(oklabToLinearRgb(c)),
  decode: (a) => {
    const r = reflectanceOf(a);
    return linearRgbToOklab(r[0], r[1], r[2]);
  },
  mix,
  dilute,
};

/** Beer-Lambert on a 38-band spectrum estimated from RGB. */
export const beerLambertSpectralModel: MixModel<Float64Array> = {
  id: 'bl-spectral',
  label: 'Transparent glaze (spectral)',
  shortLabel: 'Glaze spectral',
  description:
    'Beer-Lambert across 38 wavelengths: the most realistic choice for transparent watercolors. Spectra are estimated from color, so look-alike paints mix alike.',
  encode: (c) => absorbanceOf(oklabToSpectrum(c)),
  decode: (a) => spectrumToOklab(reflectanceOf(a)),
  mix,
  dilute,
};
