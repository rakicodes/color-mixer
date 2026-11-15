import { describe, expect, it } from 'vitest';
import {
  deltaE,
  dilute,
  hexToOklab,
  kubelkaMunkModel,
  oklabToHex,
  suggestNextStep,
  type Paint,
} from '../src';

const paints: Paint[] = [
  { id: 'ub', name: 'Ultramarine', hex: '#1f3fa8', source: 'manual' },
  { id: 'qr', name: 'Quinacridone Rose', hex: '#c2185b', source: 'manual' },
  { id: 'hy', name: 'Hansa Yellow', hex: '#f4c20d', source: 'manual' },
];

describe('MIX-06: done threshold', () => {
  it('MIX-06 / ISS-01: a difference exactly at the threshold counts as done (≤, not <)', () => {
    const current = '#3366cc';
    const target = '#4477bb';
    const d = deltaE(hexToOklab(current), hexToOklab(target));
    expect(suggestNextStep(current, target, paints, { doneThreshold: d }).status).toBe('done');
    expect(suggestNextStep(current, target, paints, { doneThreshold: d - 1e-6 }).status).not.toBe('done');
  });

  it('MIX-06: default threshold is 3', () => {
    const current = hexToOklab('#3366cc');
    // Walk toward a lighter color until the difference just crosses 3.
    let under = '';
    let over = '';
    for (let l = 0; l < 0.2; l += 0.001) {
      const hex = oklabToHex({ ...current, l: current.l + l });
      const d = deltaE(hexToOklab(hex), current);
      if (d <= 3) under = hex;
      else if (!over) over = hex;
    }
    expect(suggestNextStep('#3366cc', under, paints).status).toBe('done');
    expect(suggestNextStep('#3366cc', over, paints).status).not.toBe('done');
  });

  it('MIX-06: done reports the current difference and no notes or paint', () => {
    const s = suggestNextStep('#3366cc', '#3366cc', paints);
    expect(s).toMatchObject({ status: 'done', water: 'none', notes: [], modelId: 'oklab' });
    expect(s.currentDeltaE).toBeCloseTo(0);
    expect(s.paint).toBeUndefined();
  });
});

describe('MIX-09: solver rules', () => {
  it('MIX-09: an adjust suggestion stays within the search ranges and improves by at least 0.5', () => {
    const s = suggestNextStep('#8fa3e0', '#a98fd0', paints);
    expect(s.status).toBe('adjust');
    expect(s.paint!.fraction).toBeGreaterThanOrEqual(0.02);
    expect(s.paint!.fraction).toBeLessThanOrEqual(0.5);
    expect(s.waterFraction!).toBeGreaterThanOrEqual(0);
    expect(s.waterFraction!).toBeLessThanOrEqual(0.6);
    expect(s.currentDeltaE - s.predictedDeltaE!).toBeGreaterThanOrEqual(0.5);
    expect(s.predictedHex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('MIX-09: a high paint cost makes plain water win', () => {
    const target = oklabToHex(dilute(hexToOklab('#8fa3e0'), 0.3));
    const s = suggestNextStep('#8fa3e0', target, paints, { paintCost: 100 });
    expect(s.paint).toBeUndefined();
  });

  it('MIX-09: the paint and water amounts match the chosen fractions', () => {
    const s = suggestNextStep('#a9b6e3', '#1f3fa8', paints);
    expect(s.paint?.amount).toBe('lot');
    expect(s.water).toBe('none');
  });

  it('MIX-09: an improvement smaller than minImprovement is stuck', () => {
    const s = suggestNextStep('#8fa3e0', '#a98fd0', paints, { minImprovement: 100 });
    expect(s.status).toBe('stuck');
  });
});

describe('MIX-08: stuck', () => {
  it('MIX-08: water cannot darken: explains that when the target is darker', () => {
    const s = suggestNextStep('#a9b6e3', '#1f3fa8', []);
    expect(s.status).toBe('stuck');
    expect(s.notes).toContain(
      "Water can't make a wash darker. Add more of your main pigment, or start a stronger puddle.",
    );
    expect(s.water).toBe('none');
    expect(s.paint).toBeUndefined();
  });

  it('MIX-08: suggests a new paint when the target is not darker', () => {
    const s = suggestNextStep('#808080', '#a07070', []);
    expect(s.status).toBe('stuck');
    expect(s.notes).toContain("None of your paints brings this mix closer. You may need a paint you haven't added yet.");
  });

  it('MIX-08: stuck still includes the difference notes', () => {
    const s = suggestNextStep('#a9b6e3', '#1f3fa8', []);
    expect(s.notes).toContain('Your mix is lighter than the target.');
  });
});

describe('MOD-04: model selection in the solver', () => {
  it('MOD-04: accepts a model object', () => {
    expect(suggestNextStep('#8fa3e0', '#a98fd0', paints, { model: kubelkaMunkModel }).modelId).toBe('km-spectral');
  });

  it('MOD-04: defaults to OKLab', () => {
    expect(suggestNextStep('#8fa3e0', '#a98fd0', paints).modelId).toBe('oklab');
  });

  it('MOD-04: unknown ids fall back to OKLab', () => {
    // @ts-expect-error: testing a stale id from old saved data
    expect(suggestNextStep('#8fa3e0', '#a98fd0', paints, { model: 'old-model' }).modelId).toBe('oklab');
  });
});
