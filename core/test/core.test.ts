import { describe, expect, it } from 'vitest';
import {
  deltaE,
  dilute,
  hexToOklab,
  oklabToHex,
  MemoryStore,
  PaletteRepo,
  parseHex,
  rgbToHex,
  sampleRegion,
  SessionRepo,
  suggestNextStep,
  whiteBalance,
  type Paint,
  type PixelBuffer,
} from '../src';

function solidBuffer(w: number, h: number, rgb: [number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { data, width: w, height: h };
}

const paints: Paint[] = [
  { id: 'ub', name: 'Ultramarine', hex: '#1f3fa8', source: 'manual' },
  { id: 'qr', name: 'Quinacridone Rose', hex: '#c2185b', source: 'manual' },
  { id: 'hy', name: 'Hansa Yellow', hex: '#f4c20d', source: 'manual' },
  { id: 'bs', name: 'Burnt Sienna', hex: '#8a3b1e', source: 'manual' },
];

describe('sampleRegion', () => {
  it('averages a solid region', () => {
    const c = sampleRegion(solidBuffer(20, 20, [255, 0, 128]), 10, 10, 4);
    expect(rgbToHex(c)).toBe('#ff0080');
  });

  it('rejects outliers with the trimmed mean', () => {
    const buf = solidBuffer(21, 21, [100, 100, 100]);
    const d = buf.data as Uint8ClampedArray;
    d.set([255, 255, 255, 255], (10 * 21 + 10) * 4); // one glare pixel at the center
    const c = sampleRegion(buf, 10, 10, 5);
    expect(Math.round(c.r * 255)).toBe(100);
  });

  it('clips at image edges', () => {
    expect(() => sampleRegion(solidBuffer(4, 4, [1, 2, 3]), 0, 0, 8)).not.toThrow();
  });
});

describe('whiteBalance', () => {
  it('maps the paper sample to white', () => {
    const paper = parseHex('#e8dcc0'); // warm, underexposed paper
    expect(rgbToHex(whiteBalance(paper, paper))).toBe('#ffffff');
  });

  it('removes a color cast from a gray', () => {
    const paper = parseHex('#f0e0c0');
    const castGray = whiteBalance(parseHex('#787060'), paper);
    expect(Math.abs(castGray.r - castGray.b)).toBeLessThan(0.02);
  });

  it('rejects a paper sample that is too dark', () => {
    expect(() => whiteBalance(parseHex('#808080'), parseHex('#020202'))).toThrow();
  });
});

describe('suggestNextStep', () => {
  it('reports done when the colors are within the threshold', () => {
    const s = suggestNextStep('#3366cc', '#3467cb', paints);
    expect(s.status).toBe('done');
  });

  it.each([0.1, 0.2, 0.3, 0.45])('suggests water only when the target is the mix diluted by %s', (f) => {
    const current = hexToOklab('#1f3fa8');
    const target = dilute(current, f);
    const s = suggestNextStep('#1f3fa8', oklabToHex(target), paints);
    expect(s.status).toBe('adjust');
    expect(s.paint).toBeUndefined();
    expect(s.water).not.toBe('none');
  });

  it('picks the obvious paint to shift the hue', () => {
    // Pale blue mix; target is a pale violet, so the rose should help.
    const s = suggestNextStep('#8fa3e0', '#a98fd0', paints);
    expect(s.status).toBe('adjust');
    expect(s.paint?.name).toBe('Quinacridone Rose');
    expect(s.predictedDeltaE!).toBeLessThan(s.currentDeltaE);
  });

  it('picks the paint itself when the target is that paint and the mix is a pale wash of it', () => {
    const s = suggestNextStep('#a9b6e3', '#1f3fa8', paints);
    expect(s.paint?.name).toBe('Ultramarine');
    expect(s.water).toBe('none');
  });

  it('is stuck when nothing in the palette helps', () => {
    const s = suggestNextStep('#ffffff', '#00aa44', [paints[3]]);
    expect(s.status).toBe('stuck');
    expect(s.notes.length).toBeGreaterThan(0);
  });
});

describe('repos', () => {
  it('persists paints and sessions', async () => {
    const store = new MemoryStore();
    const palette = new PaletteRepo(store);
    const p = await palette.add({ name: 'Ultramarine', hex: '#1f3fa8', source: 'manual' });
    expect(await palette.list()).toHaveLength(1);
    await palette.remove(p.id);
    expect(await palette.list()).toHaveLength(0);

    const sessions = new SessionRepo(store);
    await sessions.start('#336699');
    const s = suggestNextStep('#aabbcc', '#336699', paints);
    const after = await sessions.addStep({ measuredHex: '#aabbcc', suggestion: s, ts: 1 });
    expect(after.steps).toHaveLength(1);
    expect((await sessions.load())?.targetHex).toBe('#336699');
  });
});

describe('deltaE', () => {
  it('is zero for identical colors', () => {
    const c = hexToOklab('#123456');
    expect(deltaE(c, c)).toBeCloseTo(0);
  });
});
