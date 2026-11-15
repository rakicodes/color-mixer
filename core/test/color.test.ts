import { describe, expect, it } from 'vitest';
import { hexToOklab, isValidHex, normalizeHex, oklabToHex, parseHex, rgbToHex } from '../src';

describe('COL: hex handling', () => {
  it.each(['#1f3fa8', '1f3fa8', '#1F3FA8', ' #1f3fa8 '])('COL: %j is valid', (hex) => {
    expect(isValidHex(hex)).toBe(true);
  });

  it.each(['#fff', '#1f3fa', '#1f3fa88', 'blue', '#gggggg', ''])('COL: %j is invalid', (hex) => {
    expect(isValidHex(hex)).toBe(false);
  });

  it('COL: normalizes to lowercase with #', () => {
    expect(normalizeHex(' 1F3FA8 ')).toBe('#1f3fa8');
    expect(normalizeHex('#ABCDEF')).toBe('#abcdef');
  });

  it('COL: parseHex throws on garbage', () => {
    expect(() => parseHex('not a color')).toThrow('Invalid color: not a color');
  });

  it('COL: rgbToHex clamps out-of-range channels', () => {
    expect(rgbToHex({ r: 1.5, g: -0.2, b: 0.5 })).toBe('#ff0080');
  });

  it('COL: hex round-trips through OKLab', () => {
    for (const hex of ['#000000', '#ffffff', '#1f3fa8', '#c2185b', '#f4c20d']) {
      expect(oklabToHex(hexToOklab(hex))).toBe(hex);
    }
  });
});
