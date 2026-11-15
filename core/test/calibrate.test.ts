import { describe, expect, it } from 'vitest';
import { CalibrationError, checkPaper, parseHex, rgbToHex, whiteBalance } from '../src';

describe('PIC-04: checkPaper', () => {
  it('PIC-04: accepts white, gray-ish and warm paper', () => {
    for (const hex of ['#ffffff', '#e8dcc0', '#b0b0b0', '#ffd4a0']) expect(() => checkPaper(parseHex(hex))).not.toThrow();
  });

  it('PIC-04: rejects a too-dark spot with guidance', () => {
    expect(() => checkPaper(parseHex('#303030'))).toThrow(
      'That spot is too dark for white paper. Tap a well-lit, blank area of paper.',
    );
  });

  it('PIC-04: rejects a too-colorful spot with guidance', () => {
    expect(() => checkPaper(parseHex('#ff8080'))).toThrow(
      'That spot is too colorful for blank paper. Tap an unpainted area.',
    );
  });

  it('ERR-03: throws CalibrationError, named so error reporting can skip it', () => {
    try {
      checkPaper(parseHex('#000000'));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CalibrationError);
      expect((e as Error).name).toBe('CalibrationError');
    }
  });
});

describe('PIC-07: whiteBalance', () => {
  it('PIC-07: allows a sample up to 5% brighter than the paper (noise)', () => {
    expect(() => whiteBalance(parseHex('#b2b2b2'), parseHex('#b0b0b0'))).not.toThrow();
  });

  it('PIC-07: rejects a sample much brighter than the paper', () => {
    expect(() => whiteBalance(parseHex('#d0d0d0'), parseHex('#b0b0b0'))).toThrow(
      'The color is brighter than the paper you tapped. Tap the paper again, choosing the brightest blank area.',
    );
  });

  it('PIC-06: corrects exposure: a gray half as bright as the paper stays gray', () => {
    const c = whiteBalance(parseHex('#606060'), parseHex('#c0c0c0'));
    expect(rgbToHex(c)).toMatch(/^#([0-9a-f]{2})\1\1$/);
  });

  it('PIC-06: output channels stay within 0..1', () => {
    const c = whiteBalance(parseHex('#ffd4a0'), parseHex('#ffd4a0'));
    for (const v of [c.r, c.g, c.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
