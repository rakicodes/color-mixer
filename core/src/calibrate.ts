import { converter } from 'culori';
import type { Rgb } from './types';

const toLrgb = converter('lrgb');
const toRgb = converter('rgb');
const toOklch = converter('oklch');

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const luminance = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Thrown when the paper sample can't be a sensible white reference. */
export class CalibrationError extends Error {
  override name = 'CalibrationError';
}

/** Paper must be at least this bright (linear luminance, 0..1). */
const MIN_PAPER_LUMINANCE = 0.15;
/**
 * Paper may be tinted by warm or cool light, but not this colorful (OKLCH
 * chroma). Lenient enough for tungsten light; strict enough to catch paint.
 */
const MAX_PAPER_CHROMA = 0.12;
/** Allowed amount by which the sample may be brighter than the paper (noise). */
const BRIGHTER_TOLERANCE = 1.05;

/**
 * Throws a CalibrationError if `paper` doesn't look like blank paper:
 * too dark, or too colorful.
 */
export function checkPaper(paper: Rgb): void {
  const p = toLrgb({ mode: 'rgb', r: paper.r, g: paper.g, b: paper.b });
  if (luminance(p) < MIN_PAPER_LUMINANCE) {
    throw new CalibrationError('That spot is too dark for white paper. Tap a well-lit, blank area of paper.');
  }
  const chroma = toOklch({ mode: 'rgb', r: paper.r, g: paper.g, b: paper.b }).c;
  if (chroma > MAX_PAPER_CHROMA) {
    throw new CalibrationError('That spot is too colorful for blank paper. Tap an unpainted area.');
  }
}

/**
 * White-balance a sampled color using a sample of blank paper from the same
 * photo. Applies a per-channel gain in linear light so the paper maps to pure
 * white, which corrects both color cast and exposure.
 */
export function whiteBalance(sample: Rgb, paper: Rgb): Rgb {
  checkPaper(paper);
  const p = toLrgb({ mode: 'rgb', r: paper.r, g: paper.g, b: paper.b });
  const s = toLrgb({ mode: 'rgb', r: sample.r, g: sample.g, b: sample.b });
  if (luminance(s) > luminance(p) * BRIGHTER_TOLERANCE) {
    throw new CalibrationError(
      'The color is brighter than the paper you tapped. Tap the paper again, choosing the brightest blank area.',
    );
  }
  const min = 0.005;
  const out = toRgb({
    mode: 'lrgb',
    r: clamp01(s.r / Math.max(p.r, min)),
    g: clamp01(s.g / Math.max(p.g, min)),
    b: clamp01(s.b / Math.max(p.b, min)),
  });
  return { r: clamp01(out.r), g: clamp01(out.g), b: clamp01(out.b) };
}
