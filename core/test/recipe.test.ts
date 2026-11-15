import { describe, expect, it } from 'vitest';
import {
  deltaE,
  dilute,
  formatStartingMix,
  formatSuggestion,
  hexToOklab,
  MAX_RECIPE_PAINTS,
  nextStepFromRecipe,
  oklabToHex,
  PAINT_MAX_FRACTION,
  planFromCurrent,
  planFromScratch,
  suggestionPaints,
  suggestNextStep,
  washOf,
  type Paint,
  type Recipe,
} from '../src';

const paints: Paint[] = [
  { id: 'ub', name: 'Ultramarine', hex: '#1f3fa8', source: 'manual' },
  { id: 'qr', name: 'Quinacridone Rose', hex: '#c2185b', source: 'manual' },
  { id: 'hy', name: 'Hansa Yellow', hex: '#f4c20d', source: 'manual' },
];

/** A larger palette with spread-out colors. */
const many: Paint[] = Array.from({ length: 20 }, (_, i) => ({
  id: `p${i}`,
  name: `Paint ${i}`,
  hex: oklabToHex({ l: 0.4 + (i % 4) * 0.12, a: 0.15 * Math.cos(i * 1.1), b: 0.15 * Math.sin(i * 1.1) }),
  source: 'manual' as const,
}));

const GREEN = '#4a8a3a';
const km = { model: 'km-spectral' as const };

const paintIds = (r: Recipe) => new Set(r.steps.flatMap((s) => suggestionPaints(s).map((p) => p.id)));

describe('REC-01: recipe from the current mix', () => {
  it('REC-01: combines two paints to get closer than the best single-paint step', () => {
    const recipe = planFromCurrent('#ffffff', GREEN, paints, km);
    const greedy = suggestNextStep('#ffffff', GREEN, paints, km);
    expect(paintIds(recipe)).toEqual(new Set(['ub', 'hy']));
    expect(recipe.predictedDeltaE).toBeLessThan(greedy.predictedDeltaE! - 5);
  });

  it('REC-01: all paints and water go in one step, whose prediction is the recipe result', () => {
    const recipe = planFromCurrent('#ffffff', GREEN, paints, km);
    expect(recipe.steps).toHaveLength(1);
    const [s] = recipe.steps;
    expect(s).toMatchObject({ status: 'adjust', modelId: 'km-spectral', predictedHex: recipe.predictedHex });
    expect(s.currentDeltaE).toBeCloseTo(deltaE(hexToOklab('#ffffff'), hexToOklab(GREEN)));
    expect(s.predictedDeltaE).toBeCloseTo(recipe.predictedDeltaE);
    expect(s.notes.length).toBeGreaterThan(0);
  });

  it('REC-01: paints are listed largest first, `paint` is the largest, and the total stays within one step', () => {
    const [s] = planFromCurrent('#ffffff', GREEN, paints, km).steps;
    const fractions = s.paints!.map((p) => p.fraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => b - a));
    expect(s.paint).toEqual(s.paints![0]);
    for (const p of s.paints!) expect(p.amount).not.toBe('none');
    expect(fractions.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(PAINT_MAX_FRACTION + 1e-9);
    expect(formatSuggestion(s)).toMatch(/^Add .+(Ultramarine|Hansa Yellow).+(Ultramarine|Hansa Yellow).*\.$/);
  });

  it('REC-01: a one-paint step has no `paints` list, like the one-step solver', () => {
    const target = oklabToHex(dilute(hexToOklab('#1f3fa8'), 0.4));
    const [s] = planFromCurrent('#ffffff', target, paints, { model: 'oklab' }).steps;
    expect(s.paint?.id).toBe('ub');
    expect(s.paints).toBeUndefined();
  });

  it(`REC-01: uses at most ${MAX_RECIPE_PAINTS} paints`, () => {
    for (const target of [GREEN, '#7a4a8c', '#c08a50', '#3a3a3a']) {
      expect(paintIds(planFromCurrent('#ffffff', target, many, km)).size).toBeLessThanOrEqual(MAX_RECIPE_PAINTS);
    }
  });

  it('REC-01: already within the threshold is done with no steps', () => {
    const recipe = planFromCurrent('#3366cc', '#3366cc', paints);
    expect(recipe).toMatchObject({ start: 'current', steps: [], outcome: 'done' });
  });

  it('REC-01: no paints and a darker target is stuck with no steps', () => {
    expect(planFromCurrent('#a9b6e3', '#1f3fa8', [])).toMatchObject({ steps: [], outcome: 'stuck' });
  });

  it('REC-01: with no paints, a paler target is reached with water alone', () => {
    const target = oklabToHex(dilute(hexToOklab('#8fa3e0'), 0.3));
    const recipe = planFromCurrent('#8fa3e0', target, []);
    expect(recipe.steps).toHaveLength(1);
    expect(recipe.steps[0].paint).toBeUndefined();
    expect(recipe.steps[0].water).not.toBe('none');
  });
});

describe('REC-02: next step comes from the recipe', () => {
  it('REC-02: the next step is the first recipe step', () => {
    const { suggestion, recipe } = nextStepFromRecipe('#ffffff', GREEN, paints, km);
    expect(suggestion).toEqual(recipe.steps[0]);
  });

  it('REC-02: done falls back to the one-step solver', () => {
    const { suggestion } = nextStepFromRecipe('#3366cc', '#3366cc', paints);
    expect(suggestion).toEqual(suggestNextStep('#3366cc', '#3366cc', paints));
  });

  it('REC-02: stuck falls back to the one-step solver and keeps its notes', () => {
    const { suggestion } = nextStepFromRecipe('#a9b6e3', '#1f3fa8', []);
    expect(suggestion.status).toBe('stuck');
    expect(suggestion.notes).toContain(
      "Water can't make a wash darker. Add more of your main pigment, or start a stronger puddle.",
    );
  });
});

describe('REC-03: recipe from scratch', () => {
  it('REC-03: mixes blue and yellow for a green, as a small whole-number ratio', () => {
    const recipe = planFromScratch(GREEN, paints, km);
    expect(recipe.start).toBe('scratch');
    expect(new Set(recipe.parts!.map((p) => p.paintId))).toEqual(new Set(['ub', 'hy']));
    for (const p of recipe.parts!) {
      expect(Number.isInteger(p.parts)).toBe(true);
      expect(p.parts).toBeGreaterThanOrEqual(1);
      expect(p.parts).toBeLessThanOrEqual(5);
    }
    expect(recipe.parts!.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1);
    expect(recipe.outcome).toBe('done');
    expect(recipe.predictedDeltaE).toBeLessThanOrEqual(3);
  });

  it('REC-03: the predicted color is for the rounded ratio, and parts are listed largest first', () => {
    const recipe = planFromScratch(GREEN, paints, km);
    expect(deltaE(hexToOklab(recipe.predictedHex), hexToOklab(GREEN))).toBeCloseTo(recipe.predictedDeltaE, 0);
    const parts = recipe.parts!.map((p) => p.parts);
    expect(parts).toEqual([...parts].sort((a, b) => b - a));
  });

  it('REC-03: a diluted single paint needs one paint and lots of water', () => {
    const target = oklabToHex(dilute(hexToOklab('#c2185b'), 0.75));
    const recipe = planFromScratch(target, paints, { model: 'oklab' });
    expect(recipe.parts).toEqual([{ paintId: 'qr', name: 'Quinacridone Rose', parts: 1, share: 1 }]);
    expect(recipe.wash).toBe('pale');
    expect(recipe.waterFraction!).toBeGreaterThan(0.65);
  });

  it(`REC-03: uses at most ${MAX_RECIPE_PAINTS} paints`, () => {
    for (const target of [GREEN, '#7a4a8c', '#c08a50', '#3a3a3a']) {
      expect(planFromScratch(target, many, km).parts!.length).toBeLessThanOrEqual(MAX_RECIPE_PAINTS);
    }
  });

  it('REC-03: no paints gives an empty, stuck recipe', () => {
    expect(planFromScratch(GREEN, [])).toMatchObject({ parts: [], outcome: 'stuck' });
  });
});

describe('REC-04: wording', () => {
  const base: Recipe = {
    start: 'scratch',
    steps: [],
    predictedHex: '#000000',
    predictedDeltaE: 0,
    outcome: 'done',
    modelId: 'oklab',
  };
  const part = (name: string, parts: number) => ({ paintId: name, name, parts, share: 0 });

  it('REC-04: wash strength from water fraction', () => {
    expect([0, 0.29, 0.3, 0.64, 0.65, 0.95].map(washOf)).toEqual(['strong', 'strong', 'medium', 'medium', 'pale', 'pale']);
  });

  it('REC-04: formats one, two and three paints', () => {
    expect(formatStartingMix({ ...base, parts: [part('Ultramarine', 1)], wash: 'pale' })).toBe(
      'Ultramarine, as a pale wash (lots of water).',
    );
    expect(formatStartingMix({ ...base, parts: [part('Ultramarine', 3), part('Hansa Yellow', 1)], wash: 'medium' })).toBe(
      '3 parts Ultramarine and 1 part Hansa Yellow, as a medium wash.',
    );
    expect(formatStartingMix({ ...base, parts: [part('A', 3), part('B', 2), part('C', 1)], wash: 'strong' })).toBe(
      '3 parts A, 2 parts B and 1 part C, as a strong wash (little water).',
    );
  });
});

describe('REC-05: speed', () => {
  it('REC-05: 20 paints on the slowest model plans both recipes quickly', () => {
    const t = Date.now();
    planFromScratch(GREEN, many, km);
    planFromCurrent('#ffffff', GREEN, many, km);
    // Loose bound for slow CI machines; locally this takes well under 0.5 s.
    expect(Date.now() - t).toBeLessThan(2000);
  });
});
