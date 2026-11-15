import { expect, type Page } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';
import { parseHex, rgbToHex, whiteBalance } from '../../core/src/index';

type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Minimal PNG encoder (RGB, 8-bit, no color profile, so browsers decode it exactly). */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => Rgb): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), row + 1 + x * 3);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolor
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export interface PhotoSpec {
  /** Left half of the photo. */
  paper: string;
  /** Right half of the photo. */
  swatch: string;
  width?: number;
  height?: number;
  /** Every n-th swatch pixel is pure white, like glare. */
  glareEvery?: number;
}

/** Tap positions (fractions of the photo) for the two halves of a generated photo. */
export const PAPER = { x: 0.25, y: 0.5 };
export const SWATCH = { x: 0.75, y: 0.5 };

export function photo({ paper, swatch, width = 400, height = 300, glareEvery }: PhotoSpec): Buffer {
  const p = hexToRgb(paper);
  const s = hexToRgb(swatch);
  return encodePng(width, height, (x, y) => {
    if (x < width / 2) return p;
    if (glareEvery && (y * width + x) % glareEvery === 0) return [255, 255, 255];
    return s;
  });
}

/** What the app should read for `swatch` after white-balancing against `paper`. */
export const balanced = (swatch: string, paper: string) => rgbToHex(whiteBalance(parseHex(swatch), parseHex(paper)));

/** Clicks the button that opens the file chooser and supplies the photo. */
export async function choosePhoto(page: Page, buttonName: string | RegExp, png: Buffer | null) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: buttonName }).click();
  const fc = await chooser;
  await fc.setFiles(png ? { name: 'photo.png', mimeType: 'image/png', buffer: png } : []);
  if (png) await expect(page.locator('.picker canvas')).toBeVisible();
}

/** Taps the picker canvas at a fractional position. */
export async function tap(page: Page, at: { x: number; y: number }) {
  const box = (await page.locator('.picker canvas').boundingBox())!;
  await page.mouse.click(box.x + at.x * box.width, box.y + at.y * box.height);
}

/** Full calibrated pick: photo → tap paper → tap color → Use this color. */
export async function pickFromPhoto(page: Page, buttonName: string | RegExp, spec: PhotoSpec, calibrate = true) {
  await choosePhoto(page, buttonName, photo(spec));
  if (calibrate) await tap(page, PAPER);
  else await page.getByRole('button', { name: 'No white paper in photo' }).click();
  await tap(page, SWATCH);
  await page.getByRole('button', { name: 'Use this color' }).click();
  await expect(page.locator('.picker')).toHaveCount(0);
}

export interface Seed {
  paints?: { id?: string; name: string; hex: string; source?: 'photo' | 'manual' }[];
  session?: { targetHex: string; targetCalibrated?: boolean; steps?: unknown[] };
  settings?: { mixModel?: string; theme?: string };
}

/** Writes app data to localStorage before the app starts, then opens `hash`. */
export async function seed(page: Page, data: Seed, hash = '') {
  await page.goto('/');
  await page.evaluate((d) => {
    localStorage.clear();
    if (d.paints)
      localStorage.setItem(
        'color-mixer:palette',
        JSON.stringify(d.paints.map((p, i) => ({ id: `p${i}`, source: 'manual', ...p }))),
      );
    if (d.session) localStorage.setItem('color-mixer:session', JSON.stringify({ steps: [], ...d.session }));
    if (d.settings) localStorage.setItem('color-mixer:settings', JSON.stringify(d.settings));
  }, data);
  await page.goto(`/${hash}`);
  await page.reload();
}

export const PAINTS = [
  { name: 'Ultramarine', hex: '#1f3fa8' },
  { name: 'Quinacridone Rose', hex: '#c2185b' },
];

export const stored = (page: Page, key: 'palette' | 'session' | 'settings') =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(`color-mixer:${k}`) ?? 'null'), key);
