import { lerpVec, scaleVec, type MixModel } from '../mix';
import { MIN_REFLECTANCE, oklabToSpectrum, spectrumToOklab } from '../spectral/convert';

/*
 * Single-constant Kubelka-Munk on a 38-band spectrum estimated from RGB.
 * For an opaque layer, reflectance depends only on K/S (absorption over
 * scattering) per wavelength:
 *   K/S = (1 - R)² / 2R        R = 1 + K/S - √((K/S)² + 2·K/S)
 * Mixing averages K/S by volume. Water is treated as mixing toward white
 * paper (K/S = 0), which is the K/S analogue of thinning the paint.
 */

function ksOf(R: Float64Array): Float64Array {
  const out = new Float64Array(R.length);
  for (let i = 0; i < R.length; i++) {
    const r = Math.max(R[i], MIN_REFLECTANCE);
    out[i] = ((1 - r) * (1 - r)) / (2 * r);
  }
  return out;
}

function reflectanceOf(ks: Float64Array): Float64Array {
  const out = new Float64Array(ks.length);
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    out[i] = 1 + k - Math.sqrt(k * k + 2 * k);
  }
  return out;
}

export const kubelkaMunkModel: MixModel<Float64Array> = {
  id: 'km-spectral',
  label: 'Opaque paint (Kubelka-Munk)',
  shortLabel: 'K-M',
  description:
    'Kubelka-Munk across 38 wavelengths: models how pigments absorb and scatter light. Good for opaque paints (cadmiums, gouache); treats every paint as opaque.',
  encode: (c) => ksOf(oklabToSpectrum(c)),
  decode: (ks) => spectrumToOklab(reflectanceOf(ks)),
  mix: (a, b, t) => lerpVec(a, b, t),
  dilute: (ks, w) => (w <= 0 ? ks : scaleVec(ks, 1 - w)),
};
