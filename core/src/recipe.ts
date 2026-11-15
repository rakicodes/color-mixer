import { MIN_FRACTION, PAINT_MAX_FRACTION, paintAmount, waterAmount } from './amounts';
import { deltaE, hexToOklab, oklabToHex } from './color';
import { describeDifference, listOf } from './describe';
import { PAPER_WHITE, type MixModel } from './mix';
import { getMixModel } from './models';
import { suggestNextStep, type SolverOptions } from './solver';
import type { Amount, Oklab, Paint, Suggestion, SuggestionPaint } from './types';

/*
 * Whole-recipe optimizer. Unlike suggestNextStep (one paint per step, greedy),
 * this searches combinations of up to MAX_RECIPE_PAINTS paints plus water at
 * once, then turns the result into something a painter can follow:
 * - from scratch: a parts ratio and a wash strength;
 * - from the current mix: one step that adds all its paints and water together.
 *
 * Every model mixes by linear interpolation in its own space, so a weighted
 * mix of N paints is built by chaining pairwise mixes.
 */

export const MAX_RECIPE_PAINTS = 3;
/** Smallest share of the paint blend a recipe paint may have. */
const MIN_SHARE = 0.05;
/** Largest number of parts in a from-scratch ratio (e.g. 5:2). */
const MAX_PART = 5;
/** Three-paint mixes are only tried among this many of the most promising paints. */
const TRIPLE_POOL = 8;
/** How many of the best grid results per paint count get refined. */
const REFINE_TOP = 4;
/** From scratch, washes can be much paler than a single adjustment step allows. */
const SCRATCH_WATER_MAX = 0.95;
const CURRENT_WATER_MAX = 0.6;

export type Wash = 'strong' | 'medium' | 'pale';

export const WASH_LABELS: Record<Wash, string> = {
  strong: 'a strong wash (little water)',
  medium: 'a medium wash',
  pale: 'a pale wash (lots of water)',
};

export function washOf(waterFraction: number): Wash {
  if (waterFraction < 0.3) return 'strong';
  if (waterFraction < 0.65) return 'medium';
  return 'pale';
}

export interface RecipePart {
  paintId: string;
  name: string;
  /** Whole-number parts, e.g. 3 in "3 parts Ultramarine". */
  parts: number;
  /** Share of the paint blend (parts / total parts). */
  share: number;
}

export interface Recipe {
  start: 'scratch' | 'current';
  /** From scratch only: the paints and their ratio. */
  parts?: RecipePart[];
  /** From scratch only: share of the starting puddle that is water. */
  waterFraction?: number;
  wash?: Wash;
  /** From the current mix only: the one step to take (all paints together), or none when done or stuck. */
  steps: Suggestion[];
  /** Predicted color once the whole recipe is followed. */
  predictedHex: string;
  predictedDeltaE: number;
  /** 'done' when the prediction is within the match threshold. */
  outcome: 'done' | 'stuck';
  modelId: MixModel['id'];
}

interface Resolved {
  model: MixModel;
  doneThreshold: number;
  minImprovement: number;
  paintCost: number;
}

function resolve(options: SolverOptions): Resolved {
  return {
    model: typeof options.model === 'object' ? options.model : getMixModel(options.model),
    doneThreshold: options.doneThreshold ?? 3,
    minImprovement: options.minImprovement ?? 0.5,
    paintCost: options.paintCost ?? 0.5,
  };
}

interface Encoded {
  paint: Paint;
  enc: unknown;
}

/** Weighted mix of encoded paints (weights need not sum to 1). */
function blend(model: MixModel, encs: unknown[], weights: number[]): unknown {
  let acc = encs[0];
  let sum = weights[0];
  for (let i = 1; i < encs.length; i++) {
    sum += weights[i];
    acc = model.mix(acc, encs[i], weights[i] / sum);
  }
  return acc;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Coordinate descent with shrinking steps. Good enough for 2–5 smooth parameters. */
function refine(x0: number[], lo: number[], hi: number[], f: (x: number[]) => number): { x: number[]; fx: number } {
  let x = x0.slice();
  let fx = f(x);
  for (let step = 0.05; step >= 0.004; step /= 2) {
    for (let round = 0; round < 40; round++) {
      let improved = false;
      for (let i = 0; i < x.length; i++) {
        for (const d of [step, -step]) {
          const y = x.slice();
          y[i] = clamp(y[i] + d, lo[i], hi[i]);
          if (y[i] === x[i]) continue;
          const fy = f(y);
          if (fy < fx) {
            x = y;
            fx = fy;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
  }
  return { x, fx };
}

/** Points on the simplex (each weight ≥ step), used as starting grids. */
function simplexGrid(k: number): number[][] {
  if (k === 1) return [[1]];
  if (k === 2) return [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((a) => [a, 1 - a]);
  const out: number[][] = [[1 / 3, 1 / 3, 1 / 3]];
  for (const a of [0.2, 0.4, 0.6]) {
    for (const b of [0.2, 0.4, 0.6]) {
      const c = 1 - a - b;
      if (c > 0.15) out.push([a, b, c]);
    }
  }
  return out;
}

function cartesian(lists: number[][]): number[][] {
  return lists.reduce<number[][]>((acc, list) => acc.flatMap((xs) => list.map((v) => [...xs, v])), [[]]);
}

function subsets(n: number, k: number, pool?: number[]): number[][] {
  const items = pool ?? [...Array(n).keys()];
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push(acc);
      return;
    }
    for (let i = start; i < items.length; i++) rec(i + 1, [...acc, items[i]]);
  };
  rec(0, []);
  return out;
}

interface Candidate {
  idx: number[];
  /** Raw paint weights (k of them), then the extra parameters. */
  x: number[];
  score: number;
}

interface Problem {
  /** Score for paints `idx` with parameters `x`; Infinity when invalid. */
  score(idx: number[], x: number[]): number;
  /** Grids, lower and upper bounds for the extra (non-weight) parameters. */
  extraGrid: number[][];
  extraLo: number[];
  extraHi: number[];
  /** Whether a mix with no paint at all (water only) is allowed. */
  allowNoPaint: boolean;
  /** Stop adding paints once a candidate's difference is this small. */
  goodEnough(c: Candidate): boolean;
}

/** Finds the best combination of up to MAX_RECIPE_PAINTS paints. */
function optimize(n: number, p: Problem): Candidate | undefined {
  const all: Candidate[] = [];

  const runSize = (subs: number[][]) => {
    const k = subs[0]?.length ?? 0;
    const extras = cartesian(p.extraGrid);
    const grid = (k ? simplexGrid(k) : [[]]).flatMap((w) => extras.map((e) => [...w, ...e]));
    const found: Candidate[] = [];
    for (const idx of subs) {
      let best: Candidate | undefined;
      for (const x of grid) {
        const score = p.score(idx, x);
        if (!best || score < best.score) best = { idx, x, score };
      }
      if (best && Number.isFinite(best.score)) found.push(best);
    }
    found.sort((a, b) => a.score - b.score);
    const lo = [...Array(k).fill(MIN_SHARE), ...p.extraLo];
    const hi = [...Array(k).fill(1), ...p.extraHi];
    for (const c of found.slice(0, REFINE_TOP)) {
      const r = refine(c.x, lo, hi, (x) => p.score(c.idx, x));
      c.x = r.x;
      c.score = r.fx;
    }
    all.push(...found);
    return found;
  };

  const bestSoFar = () => all.reduce<Candidate | undefined>((b, c) => (!b || c.score < b.score ? c : b), undefined);

  if (p.allowNoPaint) runSize([[]]);
  if (n === 0) return bestSoFar();

  const singles = runSize(subsets(n, 1));
  if (bestSoFar() && p.goodEnough(bestSoFar()!)) return bestSoFar();
  const pairs = n >= 2 ? runSize(subsets(n, 2)) : [];
  if (n < 3 || (bestSoFar() && p.goodEnough(bestSoFar()!))) return bestSoFar();

  // Rank paints by the best mix they took part in, then try triples of the top few.
  const rank = new Map<number, number>();
  for (const c of [...singles, ...pairs]) {
    for (const i of c.idx) rank.set(i, Math.min(rank.get(i) ?? Infinity, c.score));
  }
  const pool = [...rank.entries()].sort((a, b) => a[1] - b[1]).slice(0, TRIPLE_POOL).map(([i]) => i).sort((a, b) => a - b);
  if (pool.length >= 3) runSize(subsets(n, 3, pool));
  return bestSoFar();
}

const normalize = (w: number[]) => {
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);
};

function encodePaints(model: MixModel, paints: readonly Paint[]): Encoded[] {
  return paints.map((paint) => ({ paint, enc: model.encode(hexToOklab(paint.hex)) }));
}

/** Best small-integer ratio close to `shares`, judged by the resulting color. */
function roundRatio(shares: number[], evalShares: (s: number[]) => number): number[] {
  const k = shares.length;
  if (k === 1) return [1];
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let best: { parts: number[]; score: number } | undefined;
  for (const parts of cartesian(Array.from({ length: k }, () => [1, 2, 3, 4, 5].slice(0, MAX_PART)))) {
    if (parts.reduce(gcd) !== 1) continue;
    const s = normalize(parts);
    if (s.some((v, i) => Math.abs(v - shares[i]) > 0.12)) continue;
    // A small nudge toward simpler ratios when colors are about equal.
    const score = evalShares(s) + 0.1 * (Math.max(...parts) - 1);
    if (!best || score < best.score) best = { parts, score };
  }
  return best?.parts ?? shares.map((v) => Math.max(1, Math.round(v * MAX_PART)));
}

/**
 * A starting mix from your paints alone: which paints, in what ratio, and how
 * much water. Up to MAX_RECIPE_PAINTS paints.
 */
export function planFromScratch(targetHex: string, paints: readonly Paint[], options: SolverOptions = {}): Recipe {
  const { model, doneThreshold, paintCost } = resolve(options);
  const target = hexToOklab(targetHex);
  const encs = encodePaints(model, paints);

  const predict = (idx: number[], shares: number[], water: number): Oklab => {
    const mixed = blend(model, idx.map((i) => encs[i].enc), shares);
    return model.decode(water > 0 ? model.dilute(mixed, water) : mixed);
  };

  const best = optimize(encs.length, {
    score(idx, x) {
      const k = idx.length;
      const shares = normalize(x.slice(0, k));
      if (shares.some((s) => s < MIN_SHARE)) return Infinity;
      return deltaE(predict(idx, shares, x[k]), target) + paintCost * k;
    },
    extraGrid: [[0, 0.2, 0.4, 0.6, 0.8, 0.9]],
    extraLo: [0],
    extraHi: [SCRATCH_WATER_MAX],
    allowNoPaint: false,
    goodEnough: (c) => c.score - paintCost * c.idx.length <= doneThreshold,
  });

  if (!best) {
    return {
      start: 'scratch',
      parts: [],
      steps: [],
      predictedHex: oklabToHex(PAPER_WHITE),
      predictedDeltaE: deltaE(PAPER_WHITE, target),
      outcome: 'stuck',
      modelId: model.id,
    };
  }

  const k = best.idx.length;
  // Best water for a given blend, refined from the optimizer's choice.
  const bestWater = (shares: number[], from: number) =>
    refine([from], [0], [SCRATCH_WATER_MAX], ([w]) => deltaE(predict(best.idx, shares, w), target));

  const parts = roundRatio(normalize(best.x.slice(0, k)), (s) => bestWater(s, best.x[k]).fx);
  const shares = normalize(parts);
  const { x: [water], fx: dE } = bestWater(shares, best.x[k]);
  const predicted = predict(best.idx, shares, water);

  return {
    start: 'scratch',
    parts: best.idx
      .map((i, j) => ({ paintId: encs[i].paint.id, name: encs[i].paint.name, parts: parts[j], share: shares[j] }))
      .sort((a, b) => b.parts - a.parts),
    waterFraction: water,
    wash: washOf(water),
    steps: [],
    predictedHex: oklabToHex(predicted),
    predictedDeltaE: dE,
    outcome: dE <= doneThreshold ? 'done' : 'stuck',
    modelId: model.id,
  };
}

/**
 * What to add to the current mix to reach the target: the best combination of
 * up to MAX_RECIPE_PAINTS paints plus water, all added together in one step.
 * No steps when already done or stuck.
 */
export function planFromCurrent(
  currentHex: string,
  targetHex: string,
  paints: readonly Paint[],
  options: SolverOptions = {},
): Recipe {
  const { model, doneThreshold, minImprovement, paintCost } = resolve(options);
  const current = hexToOklab(currentHex);
  const target = hexToOklab(targetHex);
  const currentDeltaE = deltaE(current, target);
  const empty = (outcome: Recipe['outcome']): Recipe => ({
    start: 'current',
    steps: [],
    predictedHex: currentHex,
    predictedDeltaE: currentDeltaE,
    outcome,
    modelId: model.id,
  });
  if (currentDeltaE <= doneThreshold) return empty('done');

  const encs = encodePaints(model, paints);
  const currentEnc = model.encode(current);

  // x = [...weights, f, water]: f is the share of the resulting puddle that is new paint.
  const predict = (idx: number[], shares: number[], f: number, water: number): Oklab => {
    const mixed = idx.length ? model.mix(currentEnc, blend(model, idx.map((i) => encs[i].enc), shares), f) : currentEnc;
    return model.decode(water > 0 ? model.dilute(mixed, water) : mixed);
  };

  const best = optimize(encs.length, {
    score(idx, x) {
      const k = idx.length;
      const shares = normalize(x.slice(0, k));
      const [f, water] = x.slice(k);
      if (k === 0 && water < MIN_FRACTION) return Infinity;
      if (shares.some((s) => s < MIN_SHARE || s * f < MIN_FRACTION)) return Infinity;
      return deltaE(predict(idx, shares, f, water), target) + paintCost * k;
    },
    extraGrid: [
      [0.05, 0.15, 0.3, 0.45],
      [0, 0.15, 0.3, 0.45, 0.6],
    ],
    extraLo: [MIN_FRACTION, 0],
    extraHi: [PAINT_MAX_FRACTION, CURRENT_WATER_MAX],
    allowNoPaint: true,
    goodEnough: (c) => c.score - paintCost * c.idx.length <= doneThreshold,
  });

  if (!best) return empty('stuck');
  const k = best.idx.length;
  const shares = normalize(best.x.slice(0, k));
  const [f, rawWater] = best.x.slice(k);
  const water = rawWater < MIN_FRACTION ? 0 : rawWater;
  const predicted = predict(best.idx, shares, f, water);
  const predictedDeltaE = deltaE(predicted, target);
  if (currentDeltaE - predictedDeltaE < minImprovement) return empty('stuck');

  const added: SuggestionPaint[] = best.idx
    .map((i, j) => {
      const fraction = shares[j] * f;
      const amount = paintAmount(fraction);
      return {
        id: encs[i].paint.id,
        name: encs[i].paint.name,
        // Rounding can leave a tiny share just under the "touch" cutoff.
        amount: (amount === 'none' ? 'touch' : amount) as Exclude<Amount, 'none'>,
        fraction,
      };
    })
    .sort((a, b) => b.fraction - a.fraction);

  const step: Suggestion = {
    status: 'adjust',
    currentDeltaE,
    paint: added[0],
    ...(added.length > 1 ? { paints: added } : {}),
    water: waterAmount(water),
    waterFraction: water,
    predictedHex: oklabToHex(predicted),
    predictedDeltaE,
    notes: describeDifference(current, target),
    modelId: model.id,
  };
  return {
    start: 'current',
    steps: [step],
    predictedHex: step.predictedHex!,
    predictedDeltaE,
    outcome: predictedDeltaE <= doneThreshold ? 'done' : 'stuck',
    modelId: model.id,
  };
}

/**
 * The next step to take: the recipe's step from the current mix. Falls back to the one-step solver when the recipe is done or stuck, so
 * those cases keep their usual notes.
 */
export function nextStepFromRecipe(
  currentHex: string,
  targetHex: string,
  paints: readonly Paint[],
  options: SolverOptions = {},
): { suggestion: Suggestion; recipe: Recipe } {
  const model = resolve(options).model;
  const opts = { ...options, model };
  const recipe = planFromCurrent(currentHex, targetHex, paints, opts);
  const suggestion = recipe.steps[0] ?? suggestNextStep(currentHex, targetHex, paints, opts);
  return { suggestion, recipe };
}

/** e.g. "3 parts Ultramarine and 1 part Lemon Yellow, as a medium wash." */
export function formatStartingMix(recipe: Recipe): string {
  const parts = recipe.parts ?? [];
  if (!parts.length) return "Add paints to get a starting mix.";
  const wash = WASH_LABELS[recipe.wash ?? 'medium'];
  if (parts.length === 1) return `${parts[0].name}, as ${wash}.`;
  const items = parts.map((p) => `${p.parts} part${p.parts === 1 ? '' : 's'} ${p.name}`);
  return `${listOf(items)}, as ${wash}.`;
}
