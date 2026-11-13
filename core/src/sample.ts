import type { PixelBuffer, Rgb } from './types';

/**
 * Average the pixels within `radius` of (x, y), dropping the brightest and
 * darkest `trim` fraction per channel to reject glare and paper texture.
 */
export function sampleRegion(buf: PixelBuffer, x: number, y: number, radius = 8, trim = 0.15): Rgb {
  const cx = Math.round(x);
  const cy = Math.round(y);
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const r2 = radius * radius;
  const yMin = Math.max(0, cy - radius);
  const yMax = Math.min(buf.height - 1, cy + radius);
  const xMin = Math.max(0, cx - radius);
  const xMax = Math.min(buf.width - 1, cx + radius);
  for (let py = yMin; py <= yMax; py++) {
    for (let px = xMin; px <= xMax; px++) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (py * buf.width + px) * 4;
      r.push(buf.data[i]);
      g.push(buf.data[i + 1]);
      b.push(buf.data[i + 2]);
    }
  }
  if (r.length === 0) throw new Error('Sample point is outside the image');
  return {
    r: trimmedMean(r, trim) / 255,
    g: trimmedMean(g, trim) / 255,
    b: trimmedMean(b, trim) / 255,
  };
}

function trimmedMean(values: number[], trim: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * trim);
  const kept = sorted.length - 2 * cut > 0 ? sorted.slice(cut, sorted.length - cut) : sorted;
  return kept.reduce((s, v) => s + v, 0) / kept.length;
}
