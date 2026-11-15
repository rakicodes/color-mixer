import { describe, expect, it } from 'vitest';
import { AMOUNT_LABELS, MIN_FRACTION, PAINT_MAX_FRACTION, paintAmount, WATER_MAX_FRACTION, waterAmount } from '../src';

describe('MIX-05: amounts', () => {
  it.each([
    [0, 'none'],
    [0.019, 'none'],
    [0.02, 'touch'],
    [0.079, 'touch'],
    [0.08, 'some'],
    [0.219, 'some'],
    [0.22, 'lot'],
    [0.5, 'lot'],
  ] as const)('MIX-05: paint fraction %s is "%s"', (f, amount) => {
    expect(paintAmount(f)).toBe(amount);
  });

  it.each([
    [0, 'none'],
    [0.019, 'none'],
    [0.02, 'touch'],
    [0.119, 'touch'],
    [0.12, 'some'],
    [0.299, 'some'],
    [0.3, 'lot'],
    [0.6, 'lot'],
  ] as const)('MIX-05: water fraction %s is "%s"', (f, amount) => {
    expect(waterAmount(f)).toBe(amount);
  });

  it('MIX-05: labels read naturally in a sentence', () => {
    expect(AMOUNT_LABELS).toEqual({ none: 'no', touch: 'a touch of', some: 'some', lot: 'a lot of' });
  });

  it('MIX-09: search limits are 2% minimum, 50% paint, 60% water', () => {
    expect(MIN_FRACTION).toBe(0.02);
    expect(PAINT_MAX_FRACTION).toBe(0.5);
    expect(WATER_MAX_FRACTION).toBe(0.6);
  });
});
