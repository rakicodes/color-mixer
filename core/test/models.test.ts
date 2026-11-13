import { describe, expect, it } from 'vitest';
import {
  deltaE,
  getMixModel,
  hexToOklab,
  linearRgbToSpectrum,
  MemoryStore,
  MIX_MODELS,
  oklabToHex,
  oklabToLinearRgb,
  SettingsRepo,
  spectrumToOklab,
  suggestNextStep,
  toOklch,
  type MixModel,
  type MixModelId,
  type Paint,
} from '../src';

const ids = Object.keys(MIX_MODELS) as MixModelId[];
const WHITE = { l: 1, a: 0, b: 0 };
const ULTRAMARINE = '#1f3fa8';
const HANSA_YELLOW = '#f4c20d';

// Round-trip through the model without mixing: decode(encode(c)).
const roundTrip = (m: MixModel, hex: string) => m.decode(m.encode(hexToOklab(hex)));
const mixHex = (m: MixModel, a: string, b: string, t: number) =>
  m.decode(m.mix(m.encode(hexToOklab(a)), m.encode(hexToOklab(b)), t));

describe.each(ids)('model %s', (id) => {
  const model = getMixModel(id);
  const samples = ['#1f3fa8', '#c2185b', '#f4c20d', '#8a3b1e', '#6a8caf', '#2e7d32', '#ffffff', '#202020'];

  it('round-trips colors (encode then decode)', () => {
    for (const hex of samples) expect(deltaE(roundTrip(model, hex), hexToOklab(hex))).toBeLessThan(1);
  });

  it('mix at 0 keeps the base and at 1 gives the added paint', () => {
    expect(deltaE(mixHex(model, ULTRAMARINE, HANSA_YELLOW, 0), hexToOklab(ULTRAMARINE))).toBeLessThan(1);
    expect(deltaE(mixHex(model, ULTRAMARINE, HANSA_YELLOW, 1), hexToOklab(HANSA_YELLOW))).toBeLessThan(1);
  });

  it('water: none keeps the color, all water gives white paper', () => {
    const enc = model.encode(hexToOklab(ULTRAMARINE));
    expect(deltaE(model.decode(model.dilute(enc, 0)), hexToOklab(ULTRAMARINE))).toBeLessThan(1);
    expect(deltaE(model.decode(model.dilute(enc, 1)), WHITE)).toBeLessThan(1);
  });

  it('water lightens steadily without a big hue shift', () => {
    const enc = model.encode(hexToOklab(ULTRAMARINE));
    const base = toOklch(hexToOklab(ULTRAMARINE));
    let lastL = base.l;
    for (const w of [0.2, 0.4, 0.6]) {
      const c = toOklch(model.decode(model.dilute(enc, w)));
      expect(c.l).toBeGreaterThan(lastL);
      lastL = c.l;
      const dh = Math.abs(((c.h! - base.h! + 540) % 360) - 180);
      expect(dh).toBeLessThan(25);
    }
  });

  it('solver suggests water only when the target is this model\'s dilution', () => {
    const current = '#1f3fa8';
    const target = oklabToHex(model.decode(model.dilute(model.encode(hexToOklab(current)), 0.3)));
    const paints: Paint[] = [
      { id: 'hy', name: 'Hansa Yellow', hex: HANSA_YELLOW, source: 'manual' },
      { id: 'qr', name: 'Quinacridone Rose', hex: '#c2185b', source: 'manual' },
    ];
    const s = suggestNextStep(current, target, paints, { model: id });
    expect(s.status).toBe('adjust');
    expect(s.paint).toBeUndefined();
    expect(s.water).not.toBe('none');
    expect(s.modelId).toBe(id);
  });

  it('is fast enough with 30 paints', () => {
    const paints: Paint[] = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      hex: '#' + (((i * 2654435761) >>> 8) & 0xffffff).toString(16).padStart(6, '0'),
      source: 'manual',
    }));
    const t = Date.now();
    suggestNextStep('#8fa3e0', '#7a6fb8', paints, { model: id });
    const ms = Date.now() - t;
    expect(ms).toBeLessThan(1500); // generous for slow CI machines; ~400 ms target locally
  });
});

describe('blue + yellow', () => {
  const hue = (id: MixModelId) => toOklch(mixHex(getMixModel(id), ULTRAMARINE, HANSA_YELLOW, 0.5)).h!;

  it.each(['bl-rgb', 'bl-spectral', 'km-spectral'] as MixModelId[])('%s makes green', (id) => {
    const h = hue(id);
    expect(h).toBeGreaterThan(110);
    expect(h).toBeLessThan(180);
  });

  it('the simple OKLab blend does not', () => {
    const h = hue('oklab');
    expect(h > 110 && h < 180).toBe(false);
  });
});

describe('spectral conversion', () => {
  it('round-trips RGB through a spectrum within ΔE 1', () => {
    let worst = 0;
    for (let r = 0; r <= 255; r += 51)
      for (let g = 0; g <= 255; g += 51)
        for (let b = 0; b <= 255; b += 51) {
          const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
          const c = hexToOklab(hex);
          worst = Math.max(worst, deltaE(spectrumToOklab(linearRgbToSpectrum(oklabToLinearRgb(c))), c));
        }
    expect(worst).toBeLessThan(1);
  });

  it('keeps reflectance within (0, 1]', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff']) {
      const R = linearRgbToSpectrum(oklabToLinearRgb(hexToOklab(hex)));
      for (const v of R) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('settings', () => {
  it('defaults to the OKLab model and persists a choice', async () => {
    const repo = new SettingsRepo(new MemoryStore());
    expect((await repo.load()).mixModel).toBe('oklab');
    await repo.update({ mixModel: 'bl-spectral' });
    expect((await repo.load()).mixModel).toBe('bl-spectral');
  });

  it('falls back to the default for unknown or corrupt values', async () => {
    const store = new MemoryStore();
    store.set('color-mixer:settings', JSON.stringify({ mixModel: 'nope' }));
    expect((await new SettingsRepo(store).load()).mixModel).toBe('oklab');
    store.set('color-mixer:settings', '{bad');
    expect((await new SettingsRepo(store).load()).mixModel).toBe('oklab');
  });
});
