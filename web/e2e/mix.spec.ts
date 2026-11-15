import { expect, test, type Page } from '@playwright/test';
import { PAINTS, pickFromPhoto, seed, stored } from './helpers';

const TARGET = '#a98fd0';
const MIX = '#8fa3e0';
const mainButton = (page: Page) => page.locator('button.primary.big');
const suggestion = (page: Page) => page.locator('.suggestion-main');
const select = (page: Page) => page.getByRole('combobox', { name: 'Mixing model' });

async function photographMix(page: Page, swatch: string, calibrate = true) {
  await pickFromPhoto(page, /photograph/i, { paper: '#ffffff', swatch }, calibrate);
}

test('MIX-01: with no mix in progress, points to the Target tab', async ({ page }) => {
  await seed(page, { paints: PAINTS }, '#mix');
  await expect(page.getByRole('heading', { name: 'No mix in progress' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose target' }).click();
  await expect(page).toHaveURL(/#target$/);
});

test('MIX-02 → MIX-13: full mixing loop down to "Close enough"', async ({ page }) => {
  await seed(page, { paints: PAINTS, session: { targetHex: TARGET } }, '#mix');
  await expect(suggestion(page)).toHaveText('Mix a starting puddle, then photograph a test stroke.');
  await expect(mainButton(page)).toHaveText('Photograph your mix');

  // Reading 1: a pale blue; the target is a pale violet, so the rose should help.
  await photographMix(page, MIX);
  await expect(suggestion(page)).toContainText('Quinacridone Rose');
  await expect(suggestion(page)).toHaveText(/^Add .+\.$/);
  await expect(page.locator('.swatch figcaption')).toHaveText(['Target' + TARGET, 'Your mix' + MIX, /^After next step#[0-9a-f]{6}$/]);
  await expect(page.locator('.suggestion .hint')).toHaveText(
    /^Difference from target: \d+\.\d, about \d+\.\d after this step\. Under 3 is a match\.$/,
  );
  await expect(mainButton(page)).toHaveText('I did it: photograph the mix');

  // Reading 2: now it matches.
  await photographMix(page, TARGET);
  await expect(suggestion(page)).toHaveText('Close enough. This matches your target!');
  await expect(page.locator('.suggestion.done')).toBeVisible();
  await expect(mainButton(page)).toHaveText('Check again');

  // History, newest first.
  const history = page.locator('.history li');
  await expect(history).toHaveCount(2);
  await expect(history.nth(0)).toContainText('#2 Close enough.');
  await expect(history.nth(1)).toContainText('#1 Add');
  await expect(history.nth(1)).toContainText('Blend');

  // Persists across reload.
  await page.reload();
  await expect(history).toHaveCount(2);
});

test('REC-01 / REC-03: starting mix before the first photo, then all paints in one step', async ({ page }) => {
  // From plain paper to a violet takes both paints.
  await seed(page, { paints: PAINTS, session: { targetHex: '#a179a9' } }, '#mix');
  await expect(page.locator('.starting-mix-main')).toHaveText(/^Starting mix: .+, as a (strong|medium|pale) wash/);

  await photographMix(page, '#ffffff');
  await expect(page.locator('.starting-mix')).toHaveCount(0);
  await expect(suggestion(page)).toContainText('Ultramarine');
  await expect(suggestion(page)).toContainText('Quinacridone Rose');
  await expect(suggestion(page)).toHaveText(/^Add .+\.$/);
  await expect(page.locator('.recipe')).toHaveCount(0);
  const session = await stored(page, 'session');
  expect(session.steps[0].suggestion.paints).toHaveLength(2);
});

test('MIX-08: stuck when nothing can get closer', async ({ page }) => {
  await seed(page, { paints: [{ name: 'Burnt Sienna', hex: '#8a3b1e' }], session: { targetHex: '#00aa44' } }, '#mix');
  // Same case as the core solver test: sienna can't turn white into green.
  await photographMix(page, '#ffffff');
  await expect(suggestion(page)).toHaveText("Your paints can't get this mix any closer.");
  await expect(page.locator('.suggestion.stuck .notes')).toBeVisible();
});

test('MIX-11: with no paints, warns and links to Paints', async ({ page }) => {
  await seed(page, { session: { targetHex: TARGET } }, '#mix');
  await expect(page.getByText('You have no paints yet, so the app can only suggest water.')).toBeVisible();
  await page.getByRole('link', { name: 'Add paints' }).click();
  await expect(page).toHaveURL(/#paints$/);
});

test.describe('MIX-10: calibration warnings', () => {
  test('MIX-10: an uncalibrated mix reading against a calibrated target warns', async ({ page }) => {
    await seed(page, { paints: PAINTS, session: { targetHex: TARGET } }, '#mix');
    await photographMix(page, MIX, false);
    await expect(
      page.getByText('This mix photo was read without white paper, so the comparison to your target may be off. Include blank paper next time.'),
    ).toBeVisible();
  });

  test('MIX-10: a calibrated reading against an uncalibrated target warns', async ({ page }) => {
    await seed(page, { paints: PAINTS, session: { targetHex: TARGET, targetCalibrated: false } }, '#mix');
    await photographMix(page, MIX);
    await expect(
      page.getByText('Your target was picked without white paper but your mix was calibrated, so the comparison may be off.'),
    ).toBeVisible();
  });

  test('MIX-10 / ISS-05: both uncalibrated warns', async ({ page }) => {
    await seed(page, { paints: PAINTS, session: { targetHex: TARGET, targetCalibrated: false } }, '#mix');
    await photographMix(page, MIX, false);
    await expect(
      page.getByText('Neither your target nor this mix was read with white paper, so colors may be off. Include blank paper in your photos.'),
    ).toBeVisible();
  });
});

test.describe('MOD: mixing model', () => {
  test('MOD-01: defaults to the simple blend; a choice persists after reload', async ({ page }) => {
    await seed(page, { paints: PAINTS, session: { targetHex: TARGET } }, '#mix');
    await expect(select(page)).toHaveValue('oklab');
    await expect(select(page).locator('option')).toHaveText([
      'Simple blend (OKLab)',
      'Transparent glaze (RGB)',
      'Transparent glaze (spectral)',
      'Opaque paint (Kubelka-Munk)',
    ]);
    await select(page).selectOption('km-spectral');
    await expect(page.getByText(/^Kubelka-Munk across 38 wavelengths/)).toBeVisible();
    await page.reload();
    await expect(select(page)).toHaveValue('km-spectral');
  });

  test('MOD-02: switching recalculates the latest suggestion without adding a step', async ({ page }) => {
    await seed(page, { paints: PAINTS, session: { targetHex: TARGET } }, '#mix');
    await photographMix(page, MIX);
    await expect(page.locator('.suggestion .badge')).toHaveText('Blend');
    await expect(page.getByText('Changing the model recalculates your latest suggestion.')).toBeVisible();
    await select(page).selectOption('bl-spectral');
    await expect(page.locator('.suggestion .badge')).toHaveText('Glaze spectral');
    await expect(page.locator('.history li')).toHaveCount(1);
    const session = await stored(page, 'session');
    expect(session.steps).toHaveLength(1);
    expect(session.steps[0].suggestion.modelId).toBe('bl-spectral');
  });
});

test.describe('MIX-14: change target / end mix', () => {
  test.beforeEach(async ({ page }) => seed(page, { paints: PAINTS, session: { targetHex: TARGET } }, '#mix'));

  test('MIX-14: Change target opens the Target tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Change target' }).click();
    await expect(page).toHaveURL(/#target$/);
  });

  test('MIX-14: End mix, cancelled, keeps the mix', async ({ page }) => {
    page.once('dialog', (d) => {
      expect(d.message()).toBe('Clear this mix and its history?');
      void d.dismiss();
    });
    await page.getByRole('button', { name: 'End mix' }).click();
    await expect(page).toHaveURL(/#mix$/);
    expect(await stored(page, 'session')).not.toBeNull();
  });

  test('MIX-14: End mix, confirmed, clears it and opens Target', async ({ page }) => {
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'End mix' }).click();
    await expect(page).toHaveURL(/#target$/);
    expect(await stored(page, 'session')).toBeNull();
    await expect(page.getByRole('button', { name: 'Start mixing' })).toBeVisible();
  });
});
