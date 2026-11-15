import { expect, test } from '@playwright/test';
import { balanced, choosePhoto, encodePng, PAPER, photo, seed, SWATCH, tap } from './helpers';

const instruction = (page: import('@playwright/test').Page) => page.locator('.picker-instruction');
const STEP1 = '1. Tap a blank patch of white paper. This corrects for the lighting.';
const STEP2 = '2. Tap the paint color. Tap again to try a different spot.';
const hexInput = (page: import('@playwright/test').Page) => page.locator('form .hex-input');

test.beforeEach(async ({ page }) => {
  await seed(page, {}, '#paints');
});

test('PIC-06: calibrated pick returns the white-balanced color', async ({ page }) => {
  const paper = '#f0e4cc'; // warm light
  const swatch = '#5a6aa0';
  await choosePhoto(page, 'From photo…', photo({ paper, swatch }));
  await expect(instruction(page)).toHaveText(STEP1);
  await expect(page.getByRole('button', { name: 'Use this color' })).toBeDisabled();
  await tap(page, PAPER);
  await expect(instruction(page)).toHaveText(STEP2);
  await tap(page, SWATCH);
  const expected = balanced(swatch, paper);
  await expect(page.locator('.picker-preview')).toHaveText(expected);
  await page.getByRole('button', { name: 'Use this color' }).click();
  await expect(page.locator('.picker')).toHaveCount(0);
  await expect(hexInput(page)).toHaveValue(expected);
});

test('PIC-06: tapping again picks a different spot', async ({ page }) => {
  await choosePhoto(page, 'From photo…', photo({ paper: '#ffffff', swatch: '#5a6aa0' }));
  await tap(page, PAPER);
  await tap(page, SWATCH);
  await expect(page.locator('.picker-preview')).toHaveText('#5a6aa0');
  await tap(page, { x: 0.1, y: 0.1 }); // the paper itself
  await expect(page.locator('.picker-preview')).toHaveText('#ffffff');
});

test('PIC-05: skipping the paper step reads the raw color and shows a tip', async ({ page }) => {
  await choosePhoto(page, 'From photo…', photo({ paper: '#f0e4cc', swatch: '#5a6aa0' }));
  await page.getByRole('button', { name: 'No white paper in photo' }).click();
  await expect(instruction(page)).toHaveText(STEP2);
  await expect(page.getByRole('button', { name: 'No white paper in photo' })).toBeHidden();
  await tap(page, SWATCH);
  await page.getByRole('button', { name: 'Use this color' }).click();
  await expect(hexInput(page)).toHaveValue('#5a6aa0');
  await expect(page.locator('form .error')).toHaveText('Tip: include white paper in the photo for more accurate color.');
});

test('PIC-04: a dark spot is rejected as paper and the step stays on paper', async ({ page }) => {
  await choosePhoto(page, 'From photo…', photo({ paper: '#303030', swatch: '#5a6aa0' }));
  await tap(page, PAPER);
  await expect(page.locator('.picker-error')).toHaveText(
    'That spot is too dark for white paper. Tap a well-lit, blank area of paper.',
  );
  await expect(instruction(page)).toHaveText(STEP1);
});

test('PIC-04: a colorful spot is rejected as paper', async ({ page }) => {
  // Bright enough to pass the darkness check, so only the colorfulness check can reject it.
  await choosePhoto(page, 'From photo…', photo({ paper: '#ffffff', swatch: '#ff8080' }));
  await tap(page, SWATCH); // tapping paint as if it were paper
  await expect(page.locator('.picker-error')).toHaveText('That spot is too colorful for blank paper. Tap an unpainted area.');
  await expect(instruction(page)).toHaveText(STEP1);
  // The error clears on the next tap.
  await tap(page, PAPER);
  await expect(page.locator('.picker-error')).toBeEmpty();
  await expect(instruction(page)).toHaveText(STEP2);
});

test('PIC-07: a color brighter than the paper resets to the paper step', async ({ page }) => {
  await choosePhoto(page, 'From photo…', photo({ paper: '#b0b0b0', swatch: '#ffffff' }));
  await tap(page, PAPER);
  await tap(page, SWATCH);
  await expect(page.locator('.picker-error')).toHaveText(
    'The color is brighter than the paper you tapped. Tap the paper again, choosing the brightest blank area.',
  );
  await expect(instruction(page)).toHaveText(STEP1);
  await expect(page.getByRole('button', { name: 'Use this color' })).toBeDisabled();
});

test('PIC-08: Redo paper goes back to step 1 and clears the color', async ({ page }) => {
  await choosePhoto(page, 'From photo…', photo({ paper: '#ffffff', swatch: '#5a6aa0' }));
  await tap(page, PAPER);
  await expect(page.getByRole('button', { name: 'Redo paper' })).toBeVisible();
  await tap(page, SWATCH);
  await page.getByRole('button', { name: 'Redo paper' }).click();
  await expect(instruction(page)).toHaveText(STEP1);
  await expect(page.getByRole('button', { name: 'Use this color' })).toBeDisabled();
  await expect(page.locator('.picker-preview')).toBeEmpty();
  await expect(page.getByRole('button', { name: 'Redo paper' })).toBeHidden();
});

test('PIC-10: glare pixels are ignored', async ({ page }) => {
  await choosePhoto(page, 'From photo…', photo({ paper: '#ffffff', swatch: '#5a6aa0', glareEvery: 11 }));
  await tap(page, PAPER);
  await tap(page, SWATCH);
  await expect(page.locator('.picker-preview')).toHaveText('#5a6aa0');
});

test('PIC-09: Cancel closes the picker and changes nothing', async ({ page }) => {
  await choosePhoto(page, 'From photo…', photo({ paper: '#ffffff', swatch: '#5a6aa0' }));
  await expect(page.locator('body')).toHaveClass(/no-scroll/);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.picker')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/no-scroll/);
  await expect(hexInput(page)).toHaveValue('#1f3fa8');
});

test('PIC-09 / NFR-03: the phone back button closes the picker', async ({ page }) => {
  await page.getByRole('button', { name: 'Target' }).click();
  await page.getByRole('button', { name: 'Paints' }).click();
  await choosePhoto(page, 'From photo…', photo({ paper: '#ffffff', swatch: '#5a6aa0' }));
  await page.goBack();
  await expect(page.locator('.picker')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/no-scroll/);
  await expect(page).toHaveURL(/#target$/);
});

test('PIC-09: a tab change closes the picker', async ({ page }) => {
  await choosePhoto(page, 'From photo…', photo({ paper: '#ffffff', swatch: '#5a6aa0' }));
  await page.evaluate(() => (location.hash = 'mix'));
  await expect(page.locator('.picker')).toHaveCount(0);
});

test('PIC-01: cancelling the file chooser does nothing', async ({ page }) => {
  await choosePhoto(page, 'From photo…', null);
  await expect(page.locator('.picker')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('PIC-01 / NFR-03: the file chooser accepts images and lets phones choose camera or library', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'From photo…' }).click();
  const fc = await chooser;
  const attrs = await fc.element().evaluate((el: HTMLInputElement) => ({ accept: el.accept, capture: el.hasAttribute('capture') }));
  expect(attrs).toEqual({ accept: 'image/*', capture: false });
  await fc.setFiles([]);
});

test('PIC-02: a file that is not an image shows an error', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'From photo…' }).click();
  await (await chooser).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.locator('.toast')).toHaveText("Couldn't open that photo. Try a JPEG or PNG image.");
  await expect(page.locator('.picker')).toHaveCount(0);
});

test('PIC-03: large photos are scaled so the longest side is 1600 px', async ({ page }) => {
  const big = encodePng(3200, 2000, (x) => (x < 1600 ? [255, 255, 255] : [90, 106, 160]));
  await choosePhoto(page, 'From photo…', big);
  const size = await page.locator('.picker canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  expect(size).toEqual([1600, 1000]);
  await tap(page, PAPER);
  await tap(page, SWATCH);
  await expect(page.locator('.picker-preview')).toHaveText('#5a6aa0');
});

test('PIC-03: small photos are not scaled up', async ({ page }) => {
  await choosePhoto(page, 'From photo…', photo({ paper: '#ffffff', swatch: '#5a6aa0', width: 200, height: 100 }));
  const size = await page.locator('.picker canvas').evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  expect(size).toEqual([200, 100]);
});
