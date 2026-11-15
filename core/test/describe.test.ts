import { describe, expect, it } from 'vitest';
import { describeDifference, formatSuggestion, hexToOklab, hueName, suggestionPaints, type Oklab, type Suggestion } from '../src';

const base: Suggestion = { status: 'adjust', currentDeltaE: 10, water: 'none', notes: [] };
const paint = (amount: 'touch' | 'some' | 'lot') => ({ id: 'ub', name: 'Ultramarine', amount, fraction: 0.1 });

describe('MIX-04: formatSuggestion', () => {
  it('MIX-04: done', () => {
    expect(formatSuggestion({ ...base, status: 'done' })).toBe('Close enough. This matches your target!');
  });

  it('MIX-04: stuck', () => {
    expect(formatSuggestion({ ...base, status: 'stuck' })).toBe("Your paints can't get this mix any closer.");
  });

  it('MIX-04: water only', () => {
    expect(formatSuggestion({ ...base, water: 'some' })).toBe('Add some water.');
    expect(formatSuggestion({ ...base, water: 'touch' })).toBe('Add a touch of water.');
    expect(formatSuggestion({ ...base, water: 'lot' })).toBe('Add a lot of water.');
  });

  it('MIX-04: paint only', () => {
    expect(formatSuggestion({ ...base, paint: paint('touch') })).toBe('Add a touch of Ultramarine.');
    expect(formatSuggestion({ ...base, paint: paint('lot') })).toBe('Add a lot of Ultramarine.');
  });

  it('MIX-04: paint and water', () => {
    expect(formatSuggestion({ ...base, paint: paint('touch'), water: 'some' })).toBe(
      'Add a touch of Ultramarine and some water.',
    );
  });

  it('MIX-04: several paints in one step, with and without water', () => {
    const rose = { id: 'qr', name: 'Quinacridone Rose', amount: 'some' as const, fraction: 0.2 };
    const yellow = { id: 'hy', name: 'Hansa Yellow', amount: 'touch' as const, fraction: 0.03 };
    const two = { ...base, paint: rose, paints: [rose, paint('touch')] };
    expect(formatSuggestion(two)).toBe('Add some Quinacridone Rose and a touch of Ultramarine.');
    expect(formatSuggestion({ ...two, water: 'lot' })).toBe(
      'Add some Quinacridone Rose, a touch of Ultramarine and a lot of water.',
    );
    expect(formatSuggestion({ ...base, paint: rose, paints: [rose, paint('touch'), yellow], water: 'some' })).toBe(
      'Add some Quinacridone Rose, a touch of Ultramarine, a touch of Hansa Yellow and some water.',
    );
  });

  it('MIX-04: older suggestions with only `paint` still format', () => {
    expect(suggestionPaints({ ...base, paint: paint('lot') })).toEqual([paint('lot')]);
    expect(suggestionPaints(base)).toEqual([]);
  });
});

describe('MIX-07: hueName', () => {
  it.each([
    [20, 'pink-red'],
    [35, 'red'],
    [60, 'orange'],
    [100, 'yellow'],
    [135, 'yellow-green'],
    [150, 'green'],
    [190, 'teal'],
    [230, 'sky blue'],
    [265, 'blue'],
    [300, 'violet'],
    [335, 'magenta'],
  ])('MIX-07: %s° is %s', (h, name) => {
    expect(hueName(h)).toBe(name);
  });

  it('MIX-07: wraps around 360°', () => {
    expect(hueName(359)).toBe('pink-red'); // 21° from 20, 24° from 335
    expect(hueName(0)).toBe('pink-red');
    expect(hueName(345)).toBe('magenta');
  });
});

describe('MIX-07: describeDifference', () => {
  const lch = (l: number, c: number, h: number): Oklab => ({
    l,
    a: c * Math.cos((h * Math.PI) / 180),
    b: c * Math.sin((h * Math.PI) / 180),
  });

  it('MIX-07: no notes for identical colors', () => {
    const c = hexToOklab('#6a8caf');
    expect(describeDifference(c, c)).toEqual([]);
  });

  it('MIX-07: darker / lighter beyond 0.03 lightness', () => {
    expect(describeDifference(lch(0.5, 0.1, 250), lch(0.6, 0.1, 250))).toContain('Your mix is darker than the target.');
    expect(describeDifference(lch(0.6, 0.1, 250), lch(0.5, 0.1, 250))).toContain('Your mix is lighter than the target.');
    expect(describeDifference(lch(0.52, 0.1, 250), lch(0.5, 0.1, 250))).toEqual([]);
  });

  it('MIX-07: more vivid / duller beyond 0.02 chroma', () => {
    expect(describeDifference(lch(0.6, 0.15, 250), lch(0.6, 0.1, 250))).toContain('Your mix is more vivid than the target.');
    expect(describeDifference(lch(0.6, 0.05, 250), lch(0.6, 0.1, 250))).toContain('Your mix is duller than the target.');
    expect(describeDifference(lch(0.6, 0.11, 250), lch(0.6, 0.1, 250))).toEqual([]);
  });

  it('MIX-07: names the hue lean when hue names differ', () => {
    expect(describeDifference(lch(0.6, 0.1, 150), lch(0.6, 0.1, 265))).toContain(
      'Your mix leans green; the target is more blue.',
    );
  });

  it('MIX-07: reports degrees when the hue name is the same', () => {
    expect(describeDifference(lch(0.6, 0.1, 255), lch(0.6, 0.1, 270))).toContain(
      'The hue is a little off (about 15°).',
    );
  });

  it('MIX-07: ignores hue differences of 8° or less, and for near-grays', () => {
    expect(describeDifference(lch(0.6, 0.1, 260), lch(0.6, 0.1, 267))).toEqual([]);
    expect(describeDifference(lch(0.6, 0.02, 30), lch(0.6, 0.02, 200))).toEqual([]);
  });
});
