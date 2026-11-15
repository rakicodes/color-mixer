import { expect, test, type Page } from '@playwright/test';
import { balanced, PAINTS, pickFromPhoto, seed, stored } from './helpers';

const nameInput = (page: Page) => page.getByPlaceholder('Paint name, e.g. Ultramarine');
const hexInput = (page: Page) => page.locator('form .hex-input');
const items = (page: Page) => page.locator('.paint-item');
const item = (page: Page, i: number) => items(page).nth(i);

async function addPaint(page: Page, name: string, hex?: string) {
  await nameInput(page).fill(name);
  if (hex) await hexInput(page).fill(hex);
  await page.getByRole('button', { name: 'Add paint' }).click();
}

test.describe('empty palette', () => {
  test.beforeEach(async ({ page }) => seed(page, {}, '#paints'));

  test('PAL-03: shows the empty state and no Next button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Your paints (0)' })).toBeVisible();
    await expect(page.getByText('No paints yet. Add the paints you own above.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Next: choose a target/ })).toHaveCount(0);
  });

  test('PAL-01: adds a paint by hand and keeps it after reload', async ({ page }) => {
    await addPaint(page, '  Hansa Yellow ', '#f4c20d');
    await expect(page.getByRole('heading', { name: 'Your paints (1)' })).toBeVisible();
    await expect(item(page, 0).locator('.inline-edit')).toHaveValue('Hansa Yellow');
    await expect(item(page, 0).locator('.badge')).toHaveText('manual');
    await page.reload();
    await expect(item(page, 0).locator('.color-input')).toHaveValue('#f4c20d');
  });

  test('PAL-01: a paint needs a name', async ({ page }) => {
    await addPaint(page, '   ');
    await expect(page.locator('form .error')).toHaveText('Give the paint a name.');
    await expect(nameInput(page)).toBeFocused();
    await expect(items(page)).toHaveCount(0);
  });

  test('COL: the color picker and hex box stay in sync', async ({ page }) => {
    await hexInput(page).fill('C2185B');
    await expect(page.locator('form .color-input')).toHaveValue('#c2185b');
    await page.locator('form .color-input').fill('#123456');
    await expect(hexInput(page)).toHaveValue('#123456');
  });

  test('PAL-02: adds a paint from a photo, white-balanced, marked photo', async ({ page }) => {
    const paper = '#ece0c8';
    const swatch = '#7a4a30';
    await pickFromPhoto(page, 'From photo…', { paper, swatch });
    await expect(nameInput(page)).toBeFocused();
    await expect(hexInput(page)).toHaveValue(balanced(swatch, paper));
    await addPaint(page, 'Burnt Sienna');
    await expect(item(page, 0).locator('.badge')).toHaveText('photo');
    expect((await stored(page, 'palette'))[0]).toMatchObject({ hex: balanced(swatch, paper), source: 'photo' });
  });

  test('NFR-02: works where crypto.randomUUID is unavailable (plain-http LAN)', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined });
    });
    await page.reload();
    await addPaint(page, 'Ultramarine', '#1f3fa8');
    await expect(items(page)).toHaveCount(1);
  });
});

test.describe('existing palette', () => {
  test.beforeEach(async ({ page }) => seed(page, { paints: PAINTS }, '#paints'));

  test('PAL-03: lists paints with count and badge', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Your paints (2)' })).toBeVisible();
    await expect(item(page, 0).locator('.inline-edit')).toHaveValue('Ultramarine');
    await expect(item(page, 1).locator('.inline-edit')).toHaveValue('Quinacridone Rose');
    await expect(item(page, 0).locator('.badge')).toHaveText('manual');
  });

  test('PAL-04: renames a paint', async ({ page }) => {
    await item(page, 0).locator('.inline-edit').fill('French Ultramarine');
    await item(page, 0).locator('.inline-edit').blur();
    await page.reload();
    await expect(item(page, 0).locator('.inline-edit')).toHaveValue('French Ultramarine');
  });

  test('PAL-04 / ISS-02: clearing the name shows "Give the paint a name."', async ({ page }) => {
    await item(page, 0).locator('.inline-edit').fill('');
    await item(page, 0).locator('.inline-edit').blur();
    await expect(item(page, 0).locator('.error')).toHaveText('Give the paint a name.');
    await page.reload();
    await expect(item(page, 0).locator('.inline-edit')).toHaveValue('Ultramarine');
  });

  test('PAL-05: edits a color; it becomes manual and keeps the name', async ({ page }) => {
    await seed(page, { paints: [{ name: 'Sienna', hex: '#8a3b1e', source: 'photo' }] }, '#paints');
    // In the list only the native color input is shown.
    await item(page, 0).locator('.color-input').fill('#9a4b2e');
    await page.reload();
    await expect(item(page, 0).locator('.color-input')).toHaveValue('#9a4b2e');
    await expect(item(page, 0).locator('.inline-edit')).toHaveValue('Sienna');
    await expect(item(page, 0).locator('.badge')).toHaveText('manual');
  });

  test('PAL-06: deleting asks first; Cancel keeps the paint', async ({ page }) => {
    page.once('dialog', (d) => {
      expect(d.message()).toBe('Delete Ultramarine?');
      void d.dismiss();
    });
    await page.getByRole('button', { name: 'Delete Ultramarine' }).click();
    await expect(items(page)).toHaveCount(2);
  });

  test('PAL-06: confirming deletes the paint', async ({ page }) => {
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Delete Ultramarine' }).click();
    await expect(items(page)).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Your paints (1)' })).toBeVisible();
  });

  test('PAL-06 / ISS-03: a storage failure while deleting shows an error', async ({ page }) => {
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error('Storage is full');
      };
    });
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Delete Ultramarine' }).click();
    await expect(page.locator('.toast')).toHaveText('Storage is full');
    await expect(items(page)).toHaveCount(2);
  });

  test('PAL-07 / ISS-04: adding a duplicate name (any case, extra spaces) is rejected', async ({ page }) => {
    await addPaint(page, '  ultramarine ');
    await expect(page.locator('form .error')).toHaveText('You already have a paint named Ultramarine.');
    await expect(items(page)).toHaveCount(2);
  });

  test('PAL-07 / ISS-04: renaming to an existing name is rejected', async ({ page }) => {
    await item(page, 1).locator('.inline-edit').fill('ULTRAMARINE');
    await item(page, 1).locator('.inline-edit').blur();
    await expect(item(page, 1).locator('.error')).toHaveText('You already have a paint named Ultramarine.');
    await expect(item(page, 1).locator('.inline-edit')).toHaveValue('ULTRAMARINE');
    await page.reload();
    await expect(item(page, 1).locator('.inline-edit')).toHaveValue('Quinacridone Rose');
  });

  test('PAL-08: Next goes to the Target tab', async ({ page }) => {
    await page.getByRole('button', { name: 'Next: choose a target →' }).click();
    await expect(page).toHaveURL(/#target$/);
  });
});
