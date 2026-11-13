import type { Amount } from './types';

/**
 * The solver searches continuous fractions, then reports them as qualitative
 * amounts. Each threshold is the upper bound (exclusive) of that amount.
 *
 * Paint fraction: share of the resulting mix that comes from the added paint.
 * Water fraction: how far water moves the wash toward paper white.
 */
const PAINT_THRESHOLDS = { touch: 0.08, some: 0.22 };
const WATER_THRESHOLDS = { touch: 0.12, some: 0.3 };

/** Smallest fraction worth telling the painter about. */
export const MIN_FRACTION = 0.02;

export const PAINT_MAX_FRACTION = 0.5;
export const WATER_MAX_FRACTION = 0.6;

function classify(fraction: number, t: { touch: number; some: number }): Amount {
  if (fraction < MIN_FRACTION) return 'none';
  if (fraction < t.touch) return 'touch';
  if (fraction < t.some) return 'some';
  return 'lot';
}

export const paintAmount = (fraction: number): Amount => classify(fraction, PAINT_THRESHOLDS);
export const waterAmount = (fraction: number): Amount => classify(fraction, WATER_THRESHOLDS);

export const AMOUNT_LABELS: Record<Amount, string> = {
  none: 'no',
  touch: 'a touch of',
  some: 'some',
  lot: 'a lot of',
};
