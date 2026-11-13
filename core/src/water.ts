import { oklabMixModel, PAPER_WHITE } from './mix';
import type { Oklab } from './types';

export { PAPER_WHITE };

/**
 * Simple-blend water model: moves the color toward paper white.
 * Kept for compatibility; each MixModel now has its own `dilute`.
 */
export function dilute(color: Oklab, fraction: number): Oklab {
  return oklabMixModel.dilute(color, fraction);
}
