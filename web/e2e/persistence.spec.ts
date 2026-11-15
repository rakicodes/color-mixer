import { expect, test } from '@playwright/test';
import { PAINTS, seed } from './helpers';

test.describe('NAV-02: start tab', () => {
  test('NAV-02: first visit opens Paints', async ({ page }) => {
    await seed(page, {});
    await expect(page).toHaveURL(/#paints$/);
    await expect(page.locator('#tabs button.active')).toHaveText('Paints');
  });

  test('NAV-02: with paints, opens Target', async ({ page }) => {
    await seed(page, { paints: PAINTS });
    await expect(page).toHaveURL(/#target$/);
  });

  test('NAV-02: with a mix in progress, opens Mix', async ({ page }) => {
    await seed(page, { paints: PAINTS, session: { targetHex: '#336699' } });
    await expect(page).toHaveURL(/#mix$/);
  });
});

test('NAV-01: tabs switch views and highlight the current one', async ({ page }) => {
  await seed(page, {}, '#paints');
  for (const [name, heading] of [
    ['Target', 'What color do you want?'],
    ['Mix', 'No mix in progress'],
    ['Paints', 'Add a paint'],
  ]) {
    await page.locator('#tabs').getByRole('button', { name }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.locator('#tabs button.active')).toHaveText(name);
  }
});

test('NAV-01: an unknown hash shows Paints', async ({ page }) => {
  await seed(page, {}, '#whatever');
  await expect(page.getByRole('heading', { name: 'Add a paint' })).toBeVisible();
});

test('DAT-01: paints, mix and settings survive a reload', async ({ page }) => {
  await seed(page, {}, '#paints');
  await page.getByPlaceholder('Paint name, e.g. Ultramarine').fill('Ultramarine');
  await page.getByRole('button', { name: 'Add paint' }).click();
  await page.locator('#tabs').getByRole('button', { name: 'Target' }).click();
  await expect(page.getByRole('heading', { name: 'What color do you want?' })).toBeVisible();
  await page.locator('.hex-input').fill('#336699');
  await page.getByRole('button', { name: 'Start mixing' }).click();
  await page.getByRole('combobox', { name: 'Mixing model' }).selectOption('bl-rgb');
  await page.locator('#theme-toggle').click();

  await page.goto('/');
  await expect(page).toHaveURL(/#mix$/);
  await expect(page.locator('.swatch figcaption').first()).toHaveText('Target#336699');
  await expect(page.getByRole('combobox', { name: 'Mixing model' })).toHaveValue('bl-rgb');
  await expect(page.locator('#theme-toggle')).toHaveText('☀');
  await page.locator('#tabs').getByRole('button', { name: 'Paints' }).click();
  await expect(page.locator('.paint-item .inline-edit')).toHaveValue('Ultramarine');
});

test('DAT-02: corrupt stored data does not break the app', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('color-mixer:palette', '{oops');
    localStorage.setItem('color-mixer:session', '[1,2');
    localStorage.setItem('color-mixer:settings', 'null');
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Add a paint' })).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('DAT-02: invalid paints are dropped, valid ones kept', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem(
      'color-mixer:palette',
      JSON.stringify([{ id: 'a', name: 'Good', hex: '#112233' }, { id: 'b', name: 'Bad', hex: 'blue' }, 'junk']),
    ),
  );
  await page.goto('/#paints');
  await page.reload();
  await expect(page.locator('.paint-item')).toHaveCount(1);
  await expect(page.locator('.paint-item .inline-edit')).toHaveValue('Good');
});

test('ERR-04: with an empty DSN, nothing is sent to Sentry', async ({ page }) => {
  const sentry: string[] = [];
  await page.route(/sentry\.io/, (route) => {
    sentry.push(route.request().url());
    return route.abort();
  });
  await seed(page, { paints: PAINTS, session: { targetHex: '#336699' } });
  // Trigger a handled error: a photo that can't be opened.
  await page.goto('/#paints');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'From photo…' }).click();
  await (await chooser).setFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('nope') });
  await expect(page.locator('.toast')).toBeVisible();
  await page.waitForTimeout(500);
  expect(sentry).toEqual([]);
});
