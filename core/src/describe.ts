import { AMOUNT_LABELS } from './amounts';
import { toOklch } from './color';
import type { Oklab, Suggestion } from './types';

/** One-line instruction for a suggestion, e.g. "Add a touch of Ultramarine and some water." */
export function formatSuggestion(s: Suggestion): string {
  if (s.status === 'done') return 'Close enough. This matches your target!';
  if (s.status === 'stuck') return "Your paints can't get this mix any closer.";
  const water = s.water === 'none' ? '' : `${AMOUNT_LABELS[s.water]} water`;
  if (!s.paint) return `Add ${water}.`;
  const paint = `${AMOUNT_LABELS[s.paint.amount]} ${s.paint.name}`;
  return water ? `Add ${paint} and ${water}.` : `Add ${paint}.`;
}

const HUE_ANCHORS: [number, string][] = [
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
];

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function hueName(h: number): string {
  let best = HUE_ANCHORS[0];
  for (const anchor of HUE_ANCHORS) {
    if (hueDistance(h, anchor[0]) < hueDistance(h, best[0])) best = anchor;
  }
  return best[1];
}

/** Plain-language notes on how `current` differs from `target`. */
export function describeDifference(current: Oklab, target: Oklab): string[] {
  const c = toOklch(current);
  const t = toOklch(target);
  const notes: string[] = [];

  if (t.l - c.l > 0.03) notes.push('Your mix is darker than the target.');
  else if (c.l - t.l > 0.03) notes.push('Your mix is lighter than the target.');

  if (c.c - t.c > 0.02) notes.push('Your mix is more vivid than the target.');
  else if (t.c - c.c > 0.02) notes.push('Your mix is duller than the target.');

  const chromatic = 0.03;
  if (c.c > chromatic && t.c > chromatic && c.h !== undefined && t.h !== undefined) {
    if (hueDistance(c.h, t.h) > 8) {
      const cn = hueName(c.h);
      const tn = hueName(t.h);
      notes.push(
        cn === tn
          ? `The hue is a little off (about ${Math.round(hueDistance(c.h, t.h))}°).`
          : `Your mix leans ${cn}; the target is more ${tn}.`,
      );
    }
  }
  return notes;
}
