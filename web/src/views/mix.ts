import {
  formatSuggestion,
  getMixModel,
  isMixModelId,
  MIX_MODELS,
  formatStartingMix,
  nextStepFromRecipe,
  planFromScratch,
  type MixModelId,
  type MixStep,
  type Paint,
  type Suggestion,
} from '@color-mixer/core';
import type { AppContext } from '../app';
import { h, swatch, withErrors } from '../dom';
import { setErrorContext } from '../errors';
import { pickColorFromPhoto } from '../picker';

const fmt = (n: number) => n.toFixed(1);

export async function renderMix(root: HTMLElement, ctx: AppContext): Promise<void> {
  const [session, paints, settings] = await Promise.all([ctx.sessions.load(), ctx.palette.list(), ctx.settings.load()]);

  if (!session) {
    root.append(
      h('section', { class: 'card' },
        h('h2', {}, 'No mix in progress'),
        h('p', { class: 'hint' }, 'Choose a target color to start.'),
        h('button', { class: 'primary', onclick: () => ctx.go('target') }, 'Choose target'),
      ),
    );
    return;
  }

  const last = session.steps.at(-1);
  const targetCalibrated = session.targetCalibrated !== false;
  const mixCalibrated = last?.calibrated !== false;
  const calibrationText = !last || (targetCalibrated && mixCalibrated)
    ? null
    : !targetCalibrated && !mixCalibrated
      ? 'Neither your target nor this mix was read with white paper, so colors may be off. Include blank paper in your photos.'
      : mixCalibrated
        ? 'Your target was picked without white paper but your mix was calibrated, so the comparison may be off.'
        : 'This mix photo was read without white paper, so the comparison to your target may be off. Include blank paper next time.';
  const calibrationWarning = calibrationText ? h('p', { class: 'error' }, calibrationText) : null;

  const check = async () => {
    const picked = await pickColorFromPhoto('Sample your current mix');
    if (!picked) return;
    const { suggestion } = nextStepFromRecipe(picked.hex, session.targetHex, paints, { model: settings.mixModel });
    await ctx.sessions.addStep({ measuredHex: picked.hex, calibrated: picked.calibrated, suggestion, ts: Date.now() });
    root.replaceChildren();
    await renderMix(root, ctx);
  };

  const rerender = async () => {
    root.replaceChildren();
    await renderMix(root, ctx);
  };

  // Switching models recalculates the latest suggestion, so you can compare
  // models on the same reading without taking a new photo.
  const onModelChange = async (id: MixModelId) => {
    await ctx.settings.update({ mixModel: id });
    setErrorContext('mixModel', id);
    if (last) {
      const { suggestion } = nextStepFromRecipe(last.measuredHex, session.targetHex, paints, { model: id });
      await ctx.sessions.replaceLastStep({ ...last, suggestion });
    }
    await rerender();
  };

  root.append(
    h('section', { class: 'card' },
      h('div', { class: 'swatch-row' },
        swatch(session.targetHex, 'Target'),
        last ? swatch(last.measuredHex, 'Your mix') : null,
        last?.suggestion.predictedHex ? swatch(last.suggestion.predictedHex, 'After next step') : null,
      ),
      last ? suggestionCard(last.suggestion) : firstStepHelp(),
      last ? null : startingMix(session.targetHex, paints, settings.mixModel),
      calibrationWarning,
      paints.length
        ? null
        : h('p', { class: 'error' }, 'You have no paints yet, so the app can only suggest water. ',
            h('a', { href: '#paints' }, 'Add paints')),
      h('button', { class: 'primary big', onclick: withErrors(check) },
        last ? (last.suggestion.status === 'done' ? 'Check again' : 'I did it: photograph the mix') : 'Photograph your mix'),
      h('p', { class: 'hint' },
        'For accurate readings, brush a test stroke on the same paper and let it dry (watercolor dries lighter). Photograph it in even light, without glare, with blank paper in view.'),
    ),
    modelPicker(settings.mixModel, last, withErrors(async (e: Event) => {
      const id = (e.target as HTMLSelectElement).value;
      if (isMixModelId(id)) await onModelChange(id);
    })),
  );

  if (session.steps.length) root.append(history(session.steps));

  root.append(
    h('div', { class: 'row end' },
      h('button', { onclick: () => ctx.go('target') }, 'Change target'),
      h('button', {
        class: 'danger',
        onclick: withErrors(async () => {
          if (!confirm('Clear this mix and its history?')) return;
          await ctx.sessions.clear();
          ctx.go('target');
        }),
      }, 'End mix'),
    ),
  );
}

function firstStepHelp(): HTMLElement {
  return h('div', { class: 'suggestion' },
    h('p', { class: 'suggestion-main' }, 'Mix a starting puddle, then photograph a test stroke.'),
    h('p', { class: 'hint' }, 'The app will tell you which of your paints to add next, and how much water.'),
  );
}

/** Before the first photo: which paints to start the puddle with. */
function startingMix(targetHex: string, paints: Paint[], model: MixModelId): HTMLElement | null {
  if (!paints.length) return null;
  const recipe = planFromScratch(targetHex, paints, { model });
  const detail = recipe.outcome === 'done'
    ? `Predicted difference from target: about ${fmt(recipe.predictedDeltaE)}.`
    : `This is the closest your paints get: about ${fmt(recipe.predictedDeltaE)} from the target.`;
  return h('div', { class: 'starting-mix' },
    h('span', { class: 'chip sm', style: { background: recipe.predictedHex }, title: recipe.predictedHex }),
    h('div', {},
      h('p', { class: 'starting-mix-main' }, `Starting mix: ${formatStartingMix(recipe)}`),
      h('p', { class: 'hint' }, detail),
    ),
  );
}

function suggestionCard(s: Suggestion): HTMLElement {
  const detail =
    s.status === 'adjust' && s.predictedDeltaE !== undefined
      ? `Difference from target: ${fmt(s.currentDeltaE)}, about ${fmt(s.predictedDeltaE)} after this step. Under 3 is a match.`
      : `Difference from target: ${fmt(s.currentDeltaE)}. Under 3 is a match.`;
  return h('div', { class: `suggestion ${s.status}` },
    h('p', { class: 'suggestion-main' }, formatSuggestion(s)),
    s.modelId ? h('span', { class: 'badge' }, getMixModel(s.modelId).shortLabel) : null,
    s.notes.length ? h('ul', { class: 'notes' }, ...s.notes.map((n) => h('li', {}, n))) : null,
    h('p', { class: 'hint' }, detail),
  );
}

function history(steps: MixStep[]): HTMLElement {
  return h('section', { class: 'card' },
    h('h2', {}, 'History'),
    h('ol', { class: 'history' },
      ...steps
        .map((step, i) =>
          h('li', {},
            h('span', { class: 'chip sm', style: { background: step.measuredHex } }),
            h('div', {},
              h('strong', {}, `#${i + 1} `),
              formatSuggestion(step.suggestion),
              h('small', { class: 'hint' }, ` ΔE ${fmt(step.suggestion.currentDeltaE)}`),
              step.suggestion.modelId
                ? h('span', { class: 'badge' }, getMixModel(step.suggestion.modelId).shortLabel)
                : null,
            ),
          ),
        )
        .reverse(),
    ),
  );
}

function modelPicker(current: MixModelId, last: MixStep | undefined, onchange: (e: Event) => void): HTMLElement {
  const select = h('select', { class: 'model-select', onchange, 'aria-label': 'Mixing model' },
    ...Object.values(MIX_MODELS).map((m) => h('option', { value: m.id, selected: m.id === current }, m.label)),
  );
  return h('section', { class: 'card' },
    h('h2', {}, 'Mixing model'),
    select,
    h('p', { class: 'hint' }, getMixModel(current).description),
    last ? h('p', { class: 'hint' }, 'Changing the model recalculates your latest suggestion.') : null,
  );
}
