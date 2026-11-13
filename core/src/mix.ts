import type { Oklab } from './types';

/**
 * Predicts the color of mixing `added` into `base`, where `fraction` (0..1) is
 * the share of the result that comes from `added`.
 * A Kubelka-Munk model can replace this later without touching the solver.
 */
export interface MixModel {
  readonly name: string;
  mix(base: Oklab, added: Oklab, fraction: number): Oklab;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Linear interpolation in OKLab. Simple, but poor for complementary hues. */
export const oklabMixModel: MixModel = {
  name: 'oklab',
  mix(base, added, t) {
    return { l: lerp(base.l, added.l, t), a: lerp(base.a, added.a, t), b: lerp(base.b, added.b, t) };
  },
};
