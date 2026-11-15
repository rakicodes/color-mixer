import { formatSuggestion, MIX_MODELS, planFromCurrent, type MixModelId, type Paint } from '@color-mixer/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/picker', () => ({ pickColorFromPhoto: vi.fn() }));
vi.mock('../src/errors', () => ({ reportError: vi.fn(), setErrorContext: vi.fn(), initErrorReporting: vi.fn() }));

import { setErrorContext } from '../src/errors';
import { pickColorFromPhoto } from '../src/picker';
import { renderMix } from '../src/views/mix';
import { buttonByText, flush, makeCtx, makeRoot, PAINTS, step, text } from './helpers';

const picker = vi.mocked(pickColorFromPhoto);
type Ctx = ReturnType<typeof makeCtx>['ctx'];

async function setup(prepare?: (ctx: Ctx) => Promise<unknown>, withPaints = true) {
  const { ctx } = makeCtx();
  if (withPaints) for (const p of PAINTS) await ctx.palette.add(p);
  await prepare?.(ctx);
  const root = makeRoot();
  await renderMix(root, ctx);
  const swatches = () => [...root.querySelectorAll('.swatch figcaption')].map((f) => f.firstChild?.textContent);
  return { ctx, root, swatches };
}

const started = (target = '#a98fd0', calibrated = true) => (ctx: Ctx) => ctx.sessions.start(target, calibrated);
const withStep = (s = step('#8fa3e0'), target = '#a98fd0', calibrated = true) => async (ctx: Ctx) => {
  await ctx.sessions.start(target, calibrated);
  await ctx.sessions.addStep(s);
};

let confirmMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  picker.mockReset();
  vi.mocked(setErrorContext).mockClear();
  confirmMock = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmMock);
});

describe('MIX-01: no mix in progress', () => {
  it('MIX-01: explains and links to the Target tab', async () => {
    const { ctx, root } = await setup();
    expect(text(root)).toContain('No mix in progress');
    expect(text(root)).toContain('Choose a target color to start.');
    buttonByText(root, 'Choose target').click();
    expect(ctx.go).toHaveBeenCalledWith('target');
  });
});

describe('MIX-02: first step', () => {
  it('MIX-02: shows starting help, the target swatch and no history', async () => {
    const { root, swatches } = await setup(started());
    expect(text(root)).toContain('Mix a starting puddle, then photograph a test stroke.');
    expect(swatches()).toEqual(['Target']);
    expect(text(root)).not.toContain('History');
    expect(() => buttonByText(root, 'Photograph your mix')).not.toThrow();
  });
});

describe('MIX-03: photograph the mix', () => {
  it('MIX-03: saves a step with the reading and a suggestion, then shows it', async () => {
    picker.mockResolvedValue({ hex: '#8fa3e0', calibrated: true });
    const { ctx, root, swatches } = await setup(started());
    buttonByText(root, 'Photograph your mix').click();
    await flush(20);
    expect(picker).toHaveBeenCalledWith('Sample your current mix');
    const steps = (await ctx.sessions.load())!.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ measuredHex: '#8fa3e0', calibrated: true, suggestion: { status: 'adjust', modelId: 'oklab' } });
    expect(typeof steps[0].ts).toBe('number');
    expect(swatches()).toEqual(['Target', 'Your mix', 'After next step']);
    expect(text(root)).toContain('Add ');
  });

  it('MIX-03 / PIC-01: cancelling the photo adds nothing', async () => {
    picker.mockResolvedValue(null);
    const { ctx, root } = await setup(started());
    buttonByText(root, 'Photograph your mix').click();
    await flush();
    expect((await ctx.sessions.load())!.steps).toEqual([]);
  });

  it('MOD-01: uses the saved mixing model', async () => {
    picker.mockResolvedValue({ hex: '#8fa3e0', calibrated: true });
    const { ctx, root } = await setup(async (ctx) => {
      await ctx.settings.update({ mixModel: 'bl-rgb' });
      await ctx.sessions.start('#a98fd0');
    });
    buttonByText(root, 'Photograph your mix').click();
    await flush(20);
    expect((await ctx.sessions.load())!.steps[0].suggestion.modelId).toBe('bl-rgb');
  });
});

describe('MIX-06: difference details', () => {
  it('MIX-06: adjust shows current and predicted difference', async () => {
    const s = step('#8fa3e0', { suggestion: { status: 'adjust', currentDeltaE: 12.34, predictedDeltaE: 4.56, water: 'some', notes: [] } });
    const { root } = await setup(withStep(s));
    expect(text(root)).toContain('Difference from target: 12.3, about 4.6 after this step. Under 3 is a match.');
  });

  it('MIX-06: done and stuck show only the current difference', async () => {
    const s = step('#8fa3e0', { suggestion: { status: 'done', currentDeltaE: 2.04, water: 'none', notes: [] } });
    const { root } = await setup(withStep(s));
    expect(text(root)).toContain('Difference from target: 2.0. Under 3 is a match.');
    expect(text(root)).toContain('Close enough. This matches your target!');
  });

  it('MIX-07: lists the difference notes', async () => {
    const s = step('#8fa3e0', {
      suggestion: { status: 'adjust', currentDeltaE: 9, water: 'none', notes: ['Your mix is lighter than the target.'] },
    });
    const { root } = await setup(withStep(s));
    expect([...root.querySelectorAll('.notes li')].map((li) => li.textContent)).toEqual(['Your mix is lighter than the target.']);
  });
});

describe('MIX-10: calibration warnings', () => {
  const TARGET_UNCAL = 'Your target was picked without white paper but your mix was calibrated, so the comparison may be off.';
  const MIX_UNCAL = 'This mix photo was read without white paper, so the comparison to your target may be off. Include blank paper next time.';
  const BOTH_UNCAL =
    'Neither your target nor this mix was read with white paper, so colors may be off. Include blank paper in your photos.';

  it('MIX-10: none when both are calibrated, or before the first reading', async () => {
    expect(text((await setup(withStep(step('#8fa3e0', { calibrated: true })))).root)).not.toMatch(/without white paper/);
    expect(text((await setup(started('#a98fd0', false))).root)).not.toMatch(/without white paper/);
  });

  it('MIX-10: warns when only the mix was uncalibrated', async () => {
    const { root } = await setup(withStep(step('#8fa3e0', { calibrated: false })));
    expect(text(root)).toContain(MIX_UNCAL);
  });

  it('MIX-10: warns when only the target was uncalibrated', async () => {
    const { root } = await setup(withStep(step('#8fa3e0', { calibrated: true }), '#a98fd0', false));
    expect(text(root)).toContain(TARGET_UNCAL);
  });

  it('MIX-10: a step saved without the flag counts as calibrated', async () => {
    const { root } = await setup(withStep(step('#8fa3e0'), '#a98fd0', false));
    expect(text(root)).toContain(TARGET_UNCAL);
  });

  it('MIX-10 / ISS-05: warns when both target and mix were uncalibrated', async () => {
    const { root } = await setup(withStep(step('#8fa3e0', { calibrated: false }), '#a98fd0', false));
    expect(text(root)).toContain(BOTH_UNCAL);
  });
});

describe('MIX-11: no paints', () => {
  it('MIX-11: warns that only water can be suggested, with a link to add paints', async () => {
    const { root } = await setup(started(), false);
    expect(text(root)).toContain('You have no paints yet, so the app can only suggest water.');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('#paints');
  });

  it('MIX-11: no warning with paints', async () => {
    const { root } = await setup(started());
    expect(text(root)).not.toContain('You have no paints yet');
  });
});

describe('MIX-12: history', () => {
  it('MIX-12: lists readings newest first with number, sentence, ΔE and model badge', async () => {
    const { root } = await setup(async (ctx) => {
      await ctx.sessions.start('#a98fd0');
      await ctx.sessions.addStep(step('#111111', { suggestion: { status: 'adjust', currentDeltaE: 20, water: 'some', notes: [], modelId: 'oklab' } }));
      await ctx.sessions.addStep(step('#222222', { suggestion: { status: 'stuck', currentDeltaE: 8.25, water: 'none', notes: [], modelId: 'km-spectral' } }));
      await ctx.sessions.addStep(step('#333333', { suggestion: { status: 'done', currentDeltaE: 1, water: 'none', notes: [] } }));
    });
    const items = [...root.querySelectorAll('.history li')].map((li) => li.textContent);
    expect(items).toEqual([
      "#3 Close enough. This matches your target! ΔE 1.0",
      "#2 Your paints can't get this mix any closer. ΔE 8.3K-M",
      '#1 Add some water. ΔE 20.0Blend',
    ]);
  });
});

describe('MIX-13: main button label', () => {
  it.each([
    ['adjust', 'I did it: photograph the mix'],
    ['stuck', 'I did it: photograph the mix'],
    ['done', 'Check again'],
  ] as const)('MIX-13: after %s it says "%s"', async (status, label) => {
    const s = step('#8fa3e0', { suggestion: { status, currentDeltaE: 5, water: 'none', notes: [] } });
    const { root } = await setup(withStep(s));
    expect(root.querySelector('button.primary.big')?.textContent).toBe(label);
  });
});

describe('MIX-14: change target and end mix', () => {
  it('MIX-14: Change target goes to the Target tab', async () => {
    const { ctx, root } = await setup(started());
    buttonByText(root, 'Change target').click();
    expect(ctx.go).toHaveBeenCalledWith('target');
  });

  it('MIX-14: End mix asks, clears the session and goes to Target', async () => {
    const { ctx, root } = await setup(withStep());
    buttonByText(root, 'End mix').click();
    await flush();
    expect(confirmMock).toHaveBeenCalledWith('Clear this mix and its history?');
    expect(await ctx.sessions.load()).toBeNull();
    expect(ctx.go).toHaveBeenCalledWith('target');
  });

  it('MIX-14: cancelling End mix keeps everything', async () => {
    confirmMock.mockReturnValue(false);
    const { ctx, root } = await setup(withStep());
    buttonByText(root, 'End mix').click();
    await flush();
    expect((await ctx.sessions.load())?.steps).toHaveLength(1);
    expect(ctx.go).not.toHaveBeenCalled();
  });
});

describe('MOD-01 / MOD-02: mixing model picker', () => {
  const select = (root: HTMLElement) => root.querySelector<HTMLSelectElement>('select.model-select')!;
  const choose = async (root: HTMLElement, id: MixModelId) => {
    select(root).value = id;
    select(root).dispatchEvent(new Event('change', { bubbles: true }));
    await flush(20);
  };

  it('MOD-01: lists all four models with the saved one selected and its description', async () => {
    const { root } = await setup(async (ctx) => {
      await ctx.settings.update({ mixModel: 'bl-spectral' });
      await ctx.sessions.start('#a98fd0');
    });
    expect([...select(root).options].map((o) => o.textContent)).toEqual([
      'Simple blend (OKLab)',
      'Transparent glaze (RGB)',
      'Transparent glaze (spectral)',
      'Opaque paint (Kubelka-Munk)',
    ]);
    // Which option is selected is checked in E2E (mix.spec.ts): happy-dom mis-selects options
    // that were marked selected before being appended (off by one), unlike real browsers.
    expect(text(root)).toContain(MIX_MODELS['bl-spectral'].description);
    expect(select(root).getAttribute('aria-label')).toBe('Mixing model');
  });

  it('MOD-01: choosing a model saves it, tags error reports and shows its description', async () => {
    const { ctx, root } = await setup(started());
    expect(text(root)).not.toContain('Changing the model recalculates your latest suggestion.');
    await choose(root, 'km-spectral');
    expect((await ctx.settings.load()).mixModel).toBe('km-spectral');
    expect(setErrorContext).toHaveBeenCalledWith('mixModel', 'km-spectral');
    expect(text(root)).toContain(MIX_MODELS['km-spectral'].description);
    expect((await ctx.sessions.load())!.steps).toEqual([]);
  });

  it('MOD-02: recalculates the latest step in place with the new model', async () => {
    const { ctx, root } = await setup(async (ctx) => {
      await ctx.sessions.start('#a98fd0');
      await ctx.sessions.addStep(step('#111111'));
      await ctx.sessions.addStep(step('#8fa3e0', { ts: 42, calibrated: false }));
    });
    expect(text(root)).toContain('Changing the model recalculates your latest suggestion.');
    await choose(root, 'bl-spectral');
    const steps = (await ctx.sessions.load())!.steps;
    expect(steps).toHaveLength(2);
    expect(steps[0].measuredHex).toBe('#111111');
    expect(steps[1]).toMatchObject({ measuredHex: '#8fa3e0', ts: 42, calibrated: false, suggestion: { modelId: 'bl-spectral' } });
    expect(root.querySelector('.suggestion .badge')?.textContent).toBe('Glaze spectral');
  });
});

describe('REC-03: starting mix before the first photo', () => {
  it('REC-03: suggests a starting mix from your paints, as parts and a wash', async () => {
    const { root, swatches } = await setup(started());
    const main = root.querySelector('.starting-mix-main')?.textContent ?? '';
    expect(main).toMatch(/^Starting mix: .*(Ultramarine|Quinacridone Rose).*, as a (strong|medium|pale) wash/);
    expect(root.querySelector('.starting-mix .chip')).not.toBeNull();
    expect(text(root)).toMatch(/difference from target: about \d+\.\d|closest your paints get/);
    // Still the first-step help, and no extra swatch.
    expect(text(root)).toContain('Mix a starting puddle, then photograph a test stroke.');
    expect(swatches()).toEqual(['Target']);
  });

  it('REC-03: not shown without paints, or once there is a reading', async () => {
    expect((await setup(started(), false)).root.querySelector('.starting-mix')).toBeNull();
    expect((await setup(withStep())).root.querySelector('.starting-mix')).toBeNull();
  });
});

describe('REC-01 / REC-02: next step from the recipe', () => {
  // From plain paper to a violet needs both paints.
  const WHITE = '#ffffff';
  const VIOLET = '#a179a9';
  const savedPaints = async (ctx: Ctx) => (await ctx.palette.list()) as Paint[];

  it('REC-01: after a photo, one step adds every paint the recipe needs', async () => {
    picker.mockResolvedValue({ hex: WHITE, calibrated: true });
    const { ctx, root } = await setup(started(VIOLET));
    buttonByText(root, 'Photograph your mix').click();
    await flush(20);
    const [expected] = planFromCurrent(WHITE, VIOLET, await savedPaints(ctx)).steps;
    const saved = (await ctx.sessions.load())!.steps[0].suggestion;
    expect(saved).toEqual(expected);
    expect(saved.paints?.map((p) => p.name).sort()).toEqual(['Quinacridone Rose', 'Ultramarine']);
    const main = root.querySelector('.suggestion-main')?.textContent ?? '';
    expect(main).toBe(formatSuggestion(expected));
    expect(main).toContain('Ultramarine');
    expect(main).toContain('Quinacridone Rose');
    expect(root.querySelector('.history li')?.textContent).toContain(main);
  });

  it('REC-01: there is no separate recipe card', async () => {
    const { root } = await setup(withStep(step(WHITE), VIOLET));
    expect(text(root)).not.toContain('Full recipe');
    expect(root.querySelector('.recipe')).toBeNull();
  });

  it('REC-02: switching the model recomputes the step', async () => {
    picker.mockResolvedValue({ hex: WHITE, calibrated: true });
    const { ctx, root } = await setup(started(VIOLET));
    buttonByText(root, 'Photograph your mix').click();
    await flush(20);
    const select = root.querySelector<HTMLSelectElement>('select.model-select')!;
    select.value = 'km-spectral';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(20);
    const [km] = planFromCurrent(WHITE, VIOLET, await savedPaints(ctx), { model: 'km-spectral' }).steps;
    expect((await ctx.sessions.load())!.steps[0].suggestion).toEqual(km);
    expect(root.querySelector('.suggestion-main')?.textContent).toBe(formatSuggestion(km));
  });
});
