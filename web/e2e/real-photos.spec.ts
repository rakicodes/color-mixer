import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaE, hexToOklab } from '../../core/src/index';
import { seed, tap } from './helpers';

/*
 * Smoke tests with real photos of swatches on paper. They skip until
 * e2e/fixtures/real/photos.json exists; see the README in that folder.
 */

interface RealPhoto {
  file: string;
  /** Where to tap blank paper, as fractions of width/height; omit to skip calibration. */
  paper?: { x: number; y: number };
  /** Where to tap the paint. */
  color: { x: number; y: number };
  /** Color you expect, e.g. from a scanner or the paint maker's chart. */
  expectedHex: string;
  /** Allowed CIEDE2000 difference. Defaults to 6. */
  maxDeltaE?: number;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'real');
const manifestPath = join(dir, 'photos.json');
const photos: RealPhoto[] = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic' };

test.describe('real photos (smoke)', () => {
  if (photos.length === 0) {
    // Shows up as "skipped" in the report, as a reminder.
    test('PIC-06: real photos read close to their expected colors', () => {
      test.skip(true, 'No real photos yet: add them to e2e/fixtures/real/ (see README.md there)');
    });
  }

  for (const p of photos) {
    test(`PIC-06: ${p.file} reads close to ${p.expectedHex}`, async ({ page }) => {
      await seed(page, {}, '#paints');
      const buffer = readFileSync(join(dir, p.file));
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'From photo…' }).click();
      await (await chooser).setFiles({ name: p.file, mimeType: MIME[extname(p.file).toLowerCase()] ?? 'image/jpeg', buffer });
      await expect(page.locator('.picker canvas')).toBeVisible();
      if (p.paper) await tap(page, p.paper);
      else await page.getByRole('button', { name: 'No white paper in photo' }).click();
      await tap(page, p.color);
      await page.getByRole('button', { name: 'Use this color' }).click();
      const hex = await page.locator('form .hex-input').inputValue();
      const d = deltaE(hexToOklab(hex), hexToOklab(p.expectedHex));
      test.info().annotations.push({ type: 'reading', description: `${hex} (ΔE ${d.toFixed(1)})` });
      expect(d).toBeLessThanOrEqual(p.maxDeltaE ?? 6);
    });
  }
});
