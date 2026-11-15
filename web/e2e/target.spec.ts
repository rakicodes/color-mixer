import { expect, test, type Page } from '@playwright/test';
import { PAINTS, pickFromPhoto, seed, stored } from './helpers';

const hexInput = (page: Page) => page.locator('.hex-input');
const UNCAL_HINT =
  'This target was picked without white paper in the photo, so it may be off. Mix readings will be compared against it as-is.';

test('TGT-01 / TGT-03: choose a target by hex and start mixing', async ({ page }) => {
  await seed(page, { paints: PAINTS }, '#target');
  await expect(page.getByRole('heading', { name: 'What color do you want?' })).toBeVisible();
  await expect(hexInput(page)).toHaveValue('#6a8caf');
  await hexInput(page).fill('#a98fd0');
  await expect(page.locator('.target-preview')).toHaveCSS('background-color', 'rgb(169, 143, 208)');
  await page.getByRole('button', { name: 'Start mixing' }).click();
  await expect(page).toHaveURL(/#mix$/);
  await expect(page.locator('.swatch figcaption').first()).toHaveText('Target#a98fd0');
  expect(await stored(page, 'session')).toEqual({ targetHex: '#a98fd0', targetCalibrated: true, steps: [] });
});

test('TGT-02: an uncalibrated photo target warns, and is stored as uncalibrated', async ({ page }) => {
  await seed(page, { paints: PAINTS }, '#target');
  await pickFromPhoto(page, 'From photo…', { paper: '#ffffff', swatch: '#a98fd0' }, false);
  await expect(page.getByText(UNCAL_HINT)).toBeVisible();
  await page.getByRole('button', { name: 'Start mixing' }).click();
  expect((await stored(page, 'session')).targetCalibrated).toBe(false);
  await page.locator('#tabs').getByRole('button', { name: 'Target' }).click();
  await expect(page.getByText(UNCAL_HINT)).toBeVisible();
});

test('TGT-02: typing a color clears the uncalibrated warning', async ({ page }) => {
  await seed(page, {}, '#target');
  await pickFromPhoto(page, 'From photo…', { paper: '#ffffff', swatch: '#a98fd0' }, false);
  await hexInput(page).fill('#a98fd1');
  await expect(page.getByText(UNCAL_HINT)).toHaveCount(0);
});

test.describe('with a mix in progress', () => {
  const step = {
    measuredHex: '#8fa3e0',
    suggestion: { status: 'adjust', currentDeltaE: 9, water: 'none', notes: [] },
    ts: 1,
  };

  test('TGT-01 / TGT-05: shows the current target; Back returns to the mix unchanged', async ({ page }) => {
    await seed(page, { session: { targetHex: '#336699' } }, '#target');
    await expect(hexInput(page)).toHaveValue('#336699');
    await hexInput(page).fill('#c2185b');
    await page.getByRole('button', { name: 'Back to current mix' }).click();
    await expect(page).toHaveURL(/#mix$/);
    expect((await stored(page, 'session')).targetHex).toBe('#336699');
  });

  test('TGT-04: starting a new mix over history asks first; Cancel keeps it', async ({ page }) => {
    await seed(page, { session: { targetHex: '#336699', steps: [step] } }, '#target');
    page.once('dialog', (d) => {
      expect(d.message()).toBe('Start a new mix? Your current mixing history will be cleared.');
      void d.dismiss();
    });
    await page.getByRole('button', { name: 'Start a new mix' }).click();
    await expect(page).toHaveURL(/#target$/);
    expect((await stored(page, 'session')).steps).toHaveLength(1);
  });

  test('TGT-04: confirming clears the history', async ({ page }) => {
    await seed(page, { session: { targetHex: '#336699', steps: [step] } }, '#target');
    await hexInput(page).fill('#c2185b');
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Start a new mix' }).click();
    await expect(page).toHaveURL(/#mix$/);
    expect(await stored(page, 'session')).toMatchObject({ targetHex: '#c2185b', steps: [] });
  });
});
