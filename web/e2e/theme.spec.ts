import { expect, test } from '@playwright/test';
import { seed, stored } from './helpers';

const toggle = (page: import('@playwright/test').Page) => page.locator('#theme-toggle');
const themeAttr = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.dataset.theme ?? null);
const barColor = (page: import('@playwright/test').Page) =>
  page.locator('meta[name="theme-color"]').getAttribute('content');
const pageBg = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

const LIGHT_BG = 'rgb(251, 245, 238)';
const DARK_BG = 'rgb(36, 23, 25)';

test('THM-01: cycles System → Light → Dark and remembers the choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await seed(page, {}, '#paints');
  await expect(toggle(page)).toHaveText('◐');
  await expect(toggle(page)).toHaveAttribute('aria-label', 'Theme: System. Tap to change.');

  await toggle(page).click();
  await expect(toggle(page)).toHaveText('☀');
  expect(await themeAttr(page)).toBe('light');

  await toggle(page).click();
  await expect(toggle(page)).toHaveText('☾');
  await expect(toggle(page)).toHaveAttribute('title', 'Theme: Dark');
  expect(await themeAttr(page)).toBe('dark');
  expect(await pageBg(page)).toBe(DARK_BG);
  await expect.poll(async () => (await stored(page, 'settings'))?.theme).toBe('dark');

  await page.reload();
  await expect(toggle(page)).toHaveText('☾');

  await toggle(page).click();
  await expect(toggle(page)).toHaveText('◐');
  expect(await themeAttr(page)).toBeNull();
});

test('THM-02: a saved dark theme is applied before the app script runs (no flash)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await seed(page, { settings: { theme: 'dark' } });
  // Block the app bundle: only the inline script in index.html can set the theme.
  await page.route('**/src/main.ts*', (route) => route.abort());
  await page.reload();
  // Only the attribute is checked: in dev, the CSS is loaded by main.ts, which is blocked here.
  expect(await themeAttr(page)).toBe('dark');
});

test('THM-02: corrupt settings do not break the early theme script', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('color-mixer:settings', '{bad'));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await expect(toggle(page)).toHaveText('◐');
  expect(errors).toEqual([]);
});

test('THM-03: System follows the device, including live changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await seed(page, {}, '#paints');
  expect(await pageBg(page)).toBe(DARK_BG);
  expect(await barColor(page)).toBe('#241719');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => barColor(page)).toBe('#fbf5ee');
  expect(await pageBg(page)).toBe(LIGHT_BG);
});

test('THM-03: an explicit Light choice ignores a dark device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await seed(page, { settings: { theme: 'light' } }, '#paints');
  expect(await pageBg(page)).toBe(LIGHT_BG);
  expect(await barColor(page)).toBe('#fbf5ee');
});
