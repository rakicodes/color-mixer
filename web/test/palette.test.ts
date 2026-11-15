import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/picker', () => ({ pickColorFromPhoto: vi.fn() }));
vi.mock('../src/errors', () => ({ reportError: vi.fn(), setErrorContext: vi.fn(), initErrorReporting: vi.fn() }));

import { pickColorFromPhoto } from '../src/picker';
import { renderPalette } from '../src/views/palette';
import { buttonByText, flush, makeCtx, makeRoot, PAINTS, text, typeInto } from './helpers';

const picker = vi.mocked(pickColorFromPhoto);

async function setup(paints = PAINTS) {
  const { ctx } = makeCtx();
  for (const p of paints) await ctx.palette.add(p);
  const root = makeRoot();
  await renderPalette(root, ctx);
  const nameInput = root.querySelector<HTMLInputElement>('form input[type="text"]:not(.hex-input)')!;
  const hexInput = root.querySelector<HTMLInputElement>('form .hex-input')!;
  const submit = async (name: string, hex?: string) => {
    nameInput.value = name;
    if (hex) typeInto(hexInput, hex);
    buttonByText(root, 'Add paint').click();
    await flush();
  };
  const items = () => [...root.querySelectorAll<HTMLLIElement>('.paint-item')];
  return { ctx, root, submit, items };
}

let confirmMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  picker.mockReset();
  confirmMock = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmMock);
});

describe('PAL-01: add a paint by hand', () => {
  it('PAL-01: saves name and color, trimmed, as manual', async () => {
    const { ctx, root, submit } = await setup([]);
    await submit('  Hansa Yellow  ', '#f4c20d');
    expect(await ctx.palette.list()).toEqual([
      expect.objectContaining({ name: 'Hansa Yellow', hex: '#f4c20d', source: 'manual' }),
    ]);
    expect(text(root)).toContain('Your paints (1)');
  });

  it('PAL-01: defaults the color to #1f3fa8', async () => {
    const { root } = await setup([]);
    expect(root.querySelector<HTMLInputElement>('form .hex-input')!.value).toBe('#1f3fa8');
  });

  it.each(['', '   '])('PAL-01: a blank name (%j) shows an error and saves nothing', async (name) => {
    const { ctx, root, submit } = await setup([]);
    await submit(name);
    expect(root.querySelector('form .error')?.textContent).toBe('Give the paint a name.');
    expect(await ctx.palette.list()).toEqual([]);
  });
});

describe('PAL-02: add a paint from a photo', () => {
  it('PAL-02: a calibrated pick fills the color and saves as photo', async () => {
    picker.mockResolvedValue({ hex: '#c2185b', calibrated: true });
    const { ctx, root, submit } = await setup([]);
    buttonByText(root, 'From photo…').click();
    await flush();
    expect(picker).toHaveBeenCalledWith('Sample your paint swatch');
    expect(root.querySelector<HTMLInputElement>('form .hex-input')!.value).toBe('#c2185b');
    expect(root.querySelector('form .error')?.textContent).toBe('');
    await submit('Rose');
    expect((await ctx.palette.list())[0]).toMatchObject({ hex: '#c2185b', source: 'photo' });
  });

  it('PAL-02: an uncalibrated pick shows a tip about white paper', async () => {
    picker.mockResolvedValue({ hex: '#c2185b', calibrated: false });
    const { root } = await setup([]);
    buttonByText(root, 'From photo…').click();
    await flush();
    expect(root.querySelector('form .error')?.textContent).toBe(
      'Tip: include white paper in the photo for more accurate color.',
    );
  });

  it('PAL-02: editing the color by hand after a photo saves as manual', async () => {
    picker.mockResolvedValue({ hex: '#c2185b', calibrated: true });
    const { ctx, root, submit } = await setup([]);
    buttonByText(root, 'From photo…').click();
    await flush();
    await submit('Rose', '#c2185c');
    expect((await ctx.palette.list())[0]).toMatchObject({ hex: '#c2185c', source: 'manual' });
  });

  it('PAL-02 / PIC-01: cancelling the photo changes nothing', async () => {
    picker.mockResolvedValue(null);
    const { root } = await setup([]);
    buttonByText(root, 'From photo…').click();
    await flush();
    expect(root.querySelector<HTMLInputElement>('form .hex-input')!.value).toBe('#1f3fa8');
  });

  it('PIC-02: a photo that fails to open shows the error as a toast', async () => {
    picker.mockRejectedValue(new Error("Couldn't open that photo. Try a JPEG or PNG image."));
    const { root } = await setup([]);
    buttonByText(root, 'From photo…').click();
    await flush();
    expect(document.querySelector('.toast')?.textContent).toBe("Couldn't open that photo. Try a JPEG or PNG image.");
  });
});

describe('PAL-03: paint list', () => {
  it('PAL-03: shows an empty state and no Next button', async () => {
    const { root } = await setup([]);
    expect(text(root)).toContain('Your paints (0)');
    expect(text(root)).toContain('No paints yet. Add the paints you own above.');
    expect(() => buttonByText(root, /Next: choose a target/)).toThrow();
  });

  it('PAL-03: lists paints in order with a photo/manual badge', async () => {
    const { root, items } = await setup([...PAINTS, { name: 'Sienna', hex: '#8a3b1e', source: 'photo' }]);
    expect(text(root)).toContain('Your paints (3)');
    expect(items().map((li) => li.querySelector<HTMLInputElement>('.inline-edit')!.value)).toEqual([
      'Ultramarine',
      'Quinacridone Rose',
      'Sienna',
    ]);
    expect(items().map((li) => li.querySelector('.badge')!.textContent)).toEqual(['manual', 'manual', 'photo']);
  });
});

describe('PAL-04: rename', () => {
  it('PAL-04: saves a trimmed new name', async () => {
    const { ctx, items } = await setup();
    typeInto(items()[0].querySelector('.inline-edit')!, '  French Ultramarine ');
    await flush();
    expect((await ctx.palette.list())[0].name).toBe('French Ultramarine');
  });

  it('PAL-04: a blank name keeps the saved name', async () => {
    const { ctx, items } = await setup();
    typeInto(items()[0].querySelector('.inline-edit')!, '   ');
    await flush();
    expect((await ctx.palette.list())[0].name).toBe('Ultramarine');
  });

  it('PAL-04 / ISS-02: a blank name shows "Give the paint a name." under that paint', async () => {
    const { items } = await setup();
    typeInto(items()[0].querySelector('.inline-edit')!, '   ');
    await flush();
    expect(items()[0].querySelector('.error')?.textContent).toBe('Give the paint a name.');
    expect(items()[1].querySelector('.error')?.textContent).toBe('');
  });

  it('PAL-04 / ISS-02: the message clears after a valid rename', async () => {
    const { ctx, items } = await setup();
    const input = items()[0].querySelector<HTMLInputElement>('.inline-edit')!;
    typeInto(input, '');
    await flush();
    typeInto(input, 'French Ultramarine');
    await flush();
    expect(items()[0].querySelector('.error')?.textContent).toBe('');
    expect((await ctx.palette.list())[0].name).toBe('French Ultramarine');
  });

  it('PAL-04: an unexpected save failure shows a toast', async () => {
    const { ctx, items } = await setup();
    vi.spyOn(ctx.palette, 'update').mockRejectedValue(new Error('Storage is full'));
    typeInto(items()[0].querySelector('.inline-edit')!, 'New name');
    await flush();
    expect(document.querySelector('.toast')?.textContent).toBe('Storage is full');
  });
});

describe('PAL-05: edit color', () => {
  it('PAL-05: saves a new color and marks it manual', async () => {
    const { ctx, items } = await setup([{ name: 'Sienna', hex: '#8a3b1e', source: 'photo' }]);
    typeInto(items()[0].querySelector('.hex-input')!, '#9a4b2e');
    await flush();
    expect((await ctx.palette.list())[0]).toMatchObject({ hex: '#9a4b2e', source: 'manual' });
  });

  it('PAL-05: an unchanged color is not saved again', async () => {
    const { ctx, items } = await setup([{ name: 'Sienna', hex: '#8a3b1e', source: 'photo' }]);
    const update = vi.spyOn(ctx.palette, 'update');
    typeInto(items()[0].querySelector('.hex-input')!, '#8a3b1e');
    await flush();
    expect(update).not.toHaveBeenCalled();
  });

  it('PAL-05: name and color edits do not overwrite each other', async () => {
    const { ctx, items } = await setup();
    const li = items()[0];
    typeInto(li.querySelector('.hex-input')!, '#2040b0');
    typeInto(li.querySelector('.inline-edit')!, 'French Ultramarine');
    await flush();
    expect((await ctx.palette.list())[0]).toMatchObject({ name: 'French Ultramarine', hex: '#2040b0' });
  });
});

describe('PAL-06: delete', () => {
  const del = (li: HTMLLIElement) => li.querySelector<HTMLButtonElement>('button.danger')!;

  it('PAL-06: asks to confirm, then removes the paint', async () => {
    const { ctx, root, items } = await setup();
    expect(del(items()[0]).getAttribute('aria-label')).toBe('Delete Ultramarine');
    del(items()[0]).click();
    await flush();
    expect(confirmMock).toHaveBeenCalledWith('Delete Ultramarine?');
    expect((await ctx.palette.list()).map((p) => p.name)).toEqual(['Quinacridone Rose']);
    expect(text(root)).toContain('Your paints (1)');
  });

  it('PAL-06: cancelling keeps the paint', async () => {
    confirmMock.mockReturnValue(false);
    const { ctx, items } = await setup();
    del(items()[0]).click();
    await flush();
    expect(await ctx.palette.list()).toHaveLength(2);
  });

  it('PAL-06: the confirmation uses the latest name', async () => {
    const { items } = await setup();
    typeInto(items()[0].querySelector('.inline-edit')!, 'Renamed');
    await flush();
    del(items()[0]).click();
    expect(confirmMock).toHaveBeenCalledWith('Delete Renamed?');
  });

  it('PAL-06 / ISS-03: a storage failure shows an error toast and keeps the paint', async () => {
    const { ctx, items } = await setup();
    vi.spyOn(ctx.palette, 'remove').mockRejectedValue(new Error('Storage is full'));
    del(items()[0]).click();
    await flush();
    expect(document.querySelector('.toast')?.textContent).toBe('Storage is full');
    expect(items()).toHaveLength(2);
    expect(del(items()[0]).disabled).toBe(false);
  });

  it('PAL-06 / ISS-03: the button is disabled while deleting (no double taps)', async () => {
    const { ctx, items } = await setup();
    vi.spyOn(ctx.palette, 'remove').mockReturnValue(new Promise(() => {}));
    const btn = del(items()[0]);
    btn.click();
    await flush();
    expect(btn.disabled).toBe(true);
  });
});

describe('PAL-07: no duplicate names', () => {
  it.each(['Ultramarine', 'ultramarine', '  ULTRAMARINE  '])(
    'PAL-07 / ISS-04: adding %j when Ultramarine exists is rejected with an error',
    async (name) => {
      const { ctx, root, submit } = await setup();
      await submit(name);
      expect(await ctx.palette.list()).toHaveLength(2);
      expect(root.querySelector('form .error')?.textContent).toBe('You already have a paint named Ultramarine.');
      expect(document.querySelector('.toast')).toBeNull();
    },
  );

  it('PAL-07 / ISS-04: renaming to an existing name (any case) is rejected; the field keeps the typed name', async () => {
    const { ctx, items } = await setup();
    const input = items()[1].querySelector<HTMLInputElement>('.inline-edit')!;
    typeInto(input, ' ultramarine ');
    await flush();
    expect((await ctx.palette.list())[1].name).toBe('Quinacridone Rose');
    expect(items()[1].querySelector('.error')?.textContent).toBe('You already have a paint named Ultramarine.');
    expect(input.value).toBe(' ultramarine ');
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('PAL-07: a rejected rename does not leak into a later color change', async () => {
    const { ctx, items } = await setup();
    typeInto(items()[1].querySelector('.inline-edit')!, 'Ultramarine');
    await flush();
    typeInto(items()[1].querySelector('.hex-input')!, '#d0206b');
    await flush();
    expect((await ctx.palette.list())[1]).toMatchObject({ name: 'Quinacridone Rose', hex: '#d0206b' });
  });

  it("PAL-07: changing only the case of a paint's own name is allowed", async () => {
    const { ctx, items } = await setup();
    typeInto(items()[0].querySelector('.inline-edit')!, 'ULTRAMARINE');
    await flush();
    expect((await ctx.palette.list())[0].name).toBe('ULTRAMARINE');
    expect(items()[0].querySelector('.error')?.textContent).toBe('');
  });

  it('PAL-07: different names are still accepted', async () => {
    const { ctx, submit } = await setup();
    await submit('Ultramarine Violet');
    expect(await ctx.palette.list()).toHaveLength(3);
  });
});

describe('PAL-08: next step', () => {
  it('PAL-08: "Next: choose a target" goes to the Target tab', async () => {
    const { ctx, root } = await setup();
    buttonByText(root, 'Next: choose a target →').click();
    expect(ctx.go).toHaveBeenCalledWith('target');
  });
});
