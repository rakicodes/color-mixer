import { describe, expect, it } from 'vitest';
import { rgbToHex, sampleRegion, type PixelBuffer } from '../src';

function buffer(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set([...fill(x, y), 255], (y * w + x) * 4);
  return { data, width: w, height: h };
}

describe('PIC-10: sampleRegion', () => {
  it('PIC-10: throws when the point is outside the image', () => {
    const buf = buffer(10, 10, () => [0, 0, 0]);
    expect(() => sampleRegion(buf, 100, 100, 4)).toThrow('Sample point is outside the image');
    expect(() => sampleRegion(buf, -50, 5, 4)).toThrow('Sample point is outside the image');
  });

  it('PIC-10: only samples within the radius (a circle, not a square)', () => {
    // Left half black, right half white; a small radius left of the edge sees only black.
    const buf = buffer(40, 40, (x) => (x < 20 ? [0, 0, 0] : [255, 255, 255]));
    expect(rgbToHex(sampleRegion(buf, 10, 20, 5))).toBe('#000000');
  });

  it('PIC-10: trims the brightest and darkest 15% per channel', () => {
    // 10% of pixels are glare (white): trimmed out entirely.
    const buf = buffer(21, 21, (x, y) => ((x + y * 21) % 10 === 0 ? [255, 255, 255] : [50, 100, 150]));
    const c = sampleRegion(buf, 10, 10, 10);
    expect(Math.round(c.r * 255)).toBe(50);
    expect(Math.round(c.g * 255)).toBe(100);
    expect(Math.round(c.b * 255)).toBe(150);
  });

  it('PIC-10: rounds fractional tap coordinates', () => {
    const buf = buffer(10, 10, () => [10, 20, 30]);
    expect(rgbToHex(sampleRegion(buf, 4.6, 4.4, 2))).toBe('#0a141e');
  });

  it('PIC-10: works with a single-pixel sample', () => {
    const buf = buffer(1, 1, () => [200, 100, 0]);
    expect(rgbToHex(sampleRegion(buf, 0, 0, 0))).toBe('#c86400');
  });
});
