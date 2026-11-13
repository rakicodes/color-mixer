import type { MixModelId } from './mix';

/** sRGB color with channels in 0..1 (gamma-encoded). */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** OKLab color. l is 0..1, a/b roughly -0.4..0.4. */
export interface Oklab {
  l: number;
  a: number;
  b: number;
}

/**
 * Platform-agnostic RGBA pixel buffer (8-bit per channel, row-major).
 * Canvas ImageData satisfies this shape; a native app can supply the same.
 */
export interface PixelBuffer {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** Qualitative quantity used for both paint and water. */
export type Amount = 'none' | 'touch' | 'some' | 'lot';

export interface Paint {
  id: string;
  name: string;
  /** Calibrated color of a full-strength swatch, as #rrggbb. */
  hex: string;
  source: 'photo' | 'manual';
}

export type SuggestionStatus = 'done' | 'adjust' | 'stuck';

export interface Suggestion {
  status: SuggestionStatus;
  /** CIEDE2000 difference between the measured current mix and the target. */
  currentDeltaE: number;
  /** Paint to add (absent when only water is suggested, or when done/stuck). */
  paint?: {
    id: string;
    name: string;
    amount: Exclude<Amount, 'none'>;
    /** Share of the resulting mix from this paint, as found by the solver. */
    fraction: number;
  };
  water: Amount;
  /** How far the solver moved the wash toward paper white (0..1). */
  waterFraction?: number;
  /** Predicted color after following the suggestion. */
  predictedHex?: string;
  predictedDeltaE?: number;
  /** Human-readable notes on how the current mix differs from the target. */
  notes: string[];
  /** Which mixing model produced this suggestion (absent in older saved data). */
  modelId?: MixModelId;
}

export interface MixStep {
  measuredHex: string;
  /** Whether the measurement was white-balanced against paper. */
  calibrated?: boolean;
  suggestion: Suggestion;
  ts: number;
}

export interface MixSession {
  targetHex: string;
  /**
   * Whether the target was picked from a paper-calibrated photo.
   * Hand-entered targets count as calibrated: they already assume white paper.
   */
  targetCalibrated?: boolean;
  steps: MixStep[];
}
