import type { Oklab } from './types';

/** Calibrated paper is white by definition (see whiteBalance). */
export const PAPER_WHITE: Oklab = { l: 1, a: 0, b: 0 };

/**
 * Approximates adding water to a wash on white paper: the paint becomes more
 * transparent, so more paper shows through and the color moves toward white.
 */
export function dilute(color: Oklab, fraction: number, paper: Oklab = PAPER_WHITE): Oklab {
  if (fraction <= 0) return color;
  return {
    l: color.l + (paper.l - color.l) * fraction,
    a: color.a + (paper.a - color.a) * fraction,
    b: color.b + (paper.b - color.b) * fraction,
  };
}
