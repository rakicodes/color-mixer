import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/picker', () => ({ pickColorFromPhoto: vi.fn() }));
vi.mock('../src/errors', () => ({ reportError: vi.fn(), setErrorContext: vi.fn(), initErrorReporting: vi.fn() }));

import { pickColorFromPhoto } from '../src/picker';
import { renderTarget } from '../src/views/target';
import { buttonByText, flush, makeCtx, makeRoot, step, text, typeInto } from './helpers';

const picker = vi.mocked(pickColorFromPhoto);
const HINT =
  'This target was picked without white paper in the photo, so it may be off. Mix readings will be compared against it as-is.';

async function setup(prepare?: (ctx: ReturnType<typeof makeCtx>['ctx']) => Promise<unknown>) {
  const { ctx } = makeCtx();
  await prepare?.(ctx);
  const root = makeRoot();
  await renderTarget(root, ctx);
  const hex = root.querySelector<HTMLInputElement>('.hex-input')!;
  const preview = root.querySelector<HTMLElement>('.target-preview')!;
  const hint = () => root.querySelector('.error')!.textContent;
  return { ctx, root, hex, preview, hint };
}

let confirmMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  picker.mockReset();
  confirmMock = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmMock);
});

describe('TGT-01: choose a target', () => {
  it('TGT-01: defaults to #6a8caf with a matching preview', async () => {
    const { hex, preview, root } = await setup();
    expect(hex.value).toBe('#6a8caf');
    expect(preview.style.background).toMatch(/#6a8caf|rgb\(106, 140, 175\)/);
    expect(text(root)).toContain('What color do you want?');
    expect(() => buttonByText(root, 'Start mixing')).not.toThrow();
    expect(() => buttonByText(root, 'Back to current mix')).toThrow();
  });

  it('TGT-01: the preview follows typed colors', async () => {
    const { hex, preview } = await setup();
    typeInto(hex, '#c2185b');
    expect(preview.style.background).toMatch(/#c2185b|rgb\(194, 24, 91\)/);
  });

  it('TGT-01: shows the current target when a mix is in progress', async () => {
    const { hex, root } = await setup((ctx) => ctx.sessions.start('#336699'));
    expect(hex.value).toBe('#336699');
    expect(() => buttonByText(root, 'Start a new mix')).not.toThrow();
  });
});

describe('TGT-02: target from a photo', () => {
  it('TGT-02: an uncalibrated pick shows a warning; typing a color clears it', async () => {
    picker.mockResolvedValue({ hex: '#123456', calibrated: false });
    const { root, hex, hint } = await setup();
    buttonByText(root, 'From photo…').click();
    await flush();
    expect(picker).toHaveBeenCalledWith('Pick your target color');
    expect(hex.value).toBe('#123456');
    expect(hint()).toBe(HINT);
    typeInto(hex, '#654321');
    expect(hint()).toBe('');
  });

  it('TGT-02: a calibrated pick shows no warning', async () => {
    picker.mockResolvedValue({ hex: '#123456', calibrated: true });
    const { root, hint } = await setup();
    buttonByText(root, 'From photo…').click();
    await flush();
    expect(hint()).toBe('');
  });

  it('TGT-02: an uncalibrated saved target shows the warning on return', async () => {
    const { hint } = await setup((ctx) => ctx.sessions.start('#336699', false));
    expect(hint()).toBe(HINT);
  });

  it('TGT-02 / PIC-01: cancelling the photo keeps the color', async () => {
    picker.mockResolvedValue(null);
    const { root, hex } = await setup();
    buttonByText(root, 'From photo…').click();
    await flush();
    expect(hex.value).toBe('#6a8caf');
  });
});

describe('TGT-03: start mixing', () => {
  it('TGT-03: saves the target and opens the Mix tab', async () => {
    const { ctx, root, hex } = await setup();
    typeInto(hex, '#c2185b');
    buttonByText(root, 'Start mixing').click();
    await flush();
    expect(await ctx.sessions.load()).toEqual({ targetHex: '#c2185b', targetCalibrated: true, steps: [] });
    expect(ctx.go).toHaveBeenCalledWith('mix');
  });

  it('TGT-03: remembers that a photo target was uncalibrated', async () => {
    picker.mockResolvedValue({ hex: '#123456', calibrated: false });
    const { ctx, root } = await setup();
    buttonByText(root, 'From photo…').click();
    await flush();
    buttonByText(root, 'Start mixing').click();
    await flush();
    expect((await ctx.sessions.load())?.targetCalibrated).toBe(false);
  });
});

describe('TGT-04: replacing a mix in progress', () => {
  it('TGT-04: no confirmation when the current mix has no history', async () => {
    const { ctx, root } = await setup((ctx) => ctx.sessions.start('#336699'));
    buttonByText(root, 'Start a new mix').click();
    await flush();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(ctx.go).toHaveBeenCalledWith('mix');
  });

  it('TGT-04: asks before clearing history; cancel keeps it', async () => {
    confirmMock.mockReturnValue(false);
    const { ctx, root, hex } = await setup(async (ctx) => {
      await ctx.sessions.start('#336699');
      await ctx.sessions.addStep(step('#aabbcc'));
    });
    typeInto(hex, '#c2185b');
    buttonByText(root, 'Start a new mix').click();
    await flush();
    expect(confirmMock).toHaveBeenCalledWith('Start a new mix? Your current mixing history will be cleared.');
    expect((await ctx.sessions.load())?.steps).toHaveLength(1);
    expect(ctx.go).not.toHaveBeenCalled();
  });

  it('TGT-04: confirming starts fresh', async () => {
    const { ctx, root, hex } = await setup(async (ctx) => {
      await ctx.sessions.start('#336699');
      await ctx.sessions.addStep(step('#aabbcc'));
    });
    typeInto(hex, '#c2185b');
    buttonByText(root, 'Start a new mix').click();
    await flush();
    expect(await ctx.sessions.load()).toMatchObject({ targetHex: '#c2185b', steps: [] });
  });
});

describe('TGT-05: back to the current mix', () => {
  it('TGT-05: goes to the Mix tab without changing anything', async () => {
    const { ctx, root, hex } = await setup((ctx) => ctx.sessions.start('#336699'));
    typeInto(hex, '#c2185b');
    buttonByText(root, 'Back to current mix').click();
    expect(ctx.go).toHaveBeenCalledWith('mix');
    expect((await ctx.sessions.load())?.targetHex).toBe('#336699');
  });
});
