import {
  MIN_FRACTION,
  PAINT_MAX_FRACTION,
  paintAmount,
  WATER_MAX_FRACTION,
  waterAmount,
} from './amounts';
import { deltaE, hexToOklab, oklabToHex } from './color';
import { describeDifference } from './describe';
import type { MixModel, MixModelId } from './mix';
import { getMixModel } from './models';
import type { Amount, Oklab, Paint, Suggestion } from './types';

export interface SolverOptions {
  /** Mixing model, or its id. Defaults to the simple OKLab blend. */
  model?: MixModel | MixModelId;
  /** At or below this difference the mix counts as done. */
  doneThreshold?: number;
  /** A suggestion must reduce the difference by at least this much. */
  minImprovement?: number;
  /**
   * Extra score for suggestions that add a paint, so plain water wins when it
   * does about as well. Units are CIEDE2000.
   */
  paintCost?: number;
}

interface Candidate {
  score: number;
  dE: number;
  paint?: Paint;
  paintFraction: number;
  waterFraction: number;
  predicted: Oklab;
}

const STEP = 0.02;

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = Math.round(from / STEP); i * STEP <= to + 1e-9; i++) out.push(i * STEP);
  return out;
}

const PAINT_STEPS = range(MIN_FRACTION, PAINT_MAX_FRACTION);
const WATER_STEPS = range(0, WATER_MAX_FRACTION);

/**
 * Suggests one next step (one paint and/or water) that brings the current mix
 * closest to the target. Call it again after each new photo.
 */
export function suggestNextStep(
  currentHex: string,
  targetHex: string,
  paints: readonly Paint[],
  options: SolverOptions = {},
): Suggestion {
  const model = typeof options.model === 'object' ? options.model : getMixModel(options.model);
  const doneThreshold = options.doneThreshold ?? 3;
  const minImprovement = options.minImprovement ?? 0.5;
  const paintCost = options.paintCost ?? 0.5;

  const current = hexToOklab(currentHex);
  const target = hexToOklab(targetHex);
  const currentDeltaE = deltaE(current, target);
  if (currentDeltaE <= doneThreshold) {
    // No difference notes here: they'd contradict "close enough".
    return { status: 'done', currentDeltaE, water: 'none', notes: [], modelId: model.id };
  }
  const notes = describeDifference(current, target);

  let best: Candidate | undefined;
  const consider = (c: Candidate) => {
    if (!best || c.score < best.score) best = c;
  };

  // Convert everything into the model's space once, then mix and dilute there.
  const currentEnc = model.encode(current);
  const evaluate = (mixed: unknown, w: number) => {
    const predicted = model.decode(w > 0 ? model.dilute(mixed, w) : mixed);
    return { predicted, dE: deltaE(predicted, target) };
  };

  // Water only.
  for (const w of WATER_STEPS) {
    if (w < MIN_FRACTION) continue;
    const { predicted, dE } = evaluate(currentEnc, w);
    consider({ score: dE, dE, paintFraction: 0, waterFraction: w, predicted });
  }

  // One paint, optionally with water.
  for (const paint of paints) {
    const paintEnc = model.encode(hexToOklab(paint.hex));
    for (const f of PAINT_STEPS) {
      const mixed = model.mix(currentEnc, paintEnc, f);
      for (const w of WATER_STEPS) {
        const { predicted, dE } = evaluate(mixed, w);
        consider({ score: dE + paintCost, dE, paint, paintFraction: f, waterFraction: w, predicted });
      }
    }
  }

  const chosen = best as Candidate | undefined;
  if (!chosen || currentDeltaE - chosen.dE < minImprovement) {
    const tooLight = target.l < current.l - 0.02;
    notes.push(
      tooLight
        ? "Water can't make a wash darker. Add more of your main pigment, or start a stronger puddle."
        : "None of your paints brings this mix closer. You may need a paint you haven't added yet.",
    );
    return { status: 'stuck', currentDeltaE, water: 'none', notes, modelId: model.id };
  }

  return {
    status: 'adjust',
    currentDeltaE,
    paint: chosen.paint
      ? {
          id: chosen.paint.id,
          name: chosen.paint.name,
          amount: paintAmount(chosen.paintFraction) as Exclude<Amount, 'none'>,
          fraction: chosen.paintFraction,
        }
      : undefined,
    water: waterAmount(chosen.waterFraction),
    waterFraction: chosen.waterFraction,
    predictedHex: oklabToHex(chosen.predicted),
    predictedDeltaE: chosen.dE,
    notes,
    modelId: model.id,
  };
}
