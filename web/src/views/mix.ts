import { formatSuggestion, suggestNextStep, type MixStep, type Suggestion } from '@color-mixer/core';
import type { AppContext } from '../app';
import { h, swatch, withErrors } from '../dom';
import { pickColorFromPhoto } from '../picker';

const fmt = (n: number) => n.toFixed(1);

export async function renderMix(root: HTMLElement, ctx: AppContext): Promise<void> {
  const [session, paints] = await Promise.all([ctx.sessions.load(), ctx.palette.list()]);

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
  const calibrationWarning =
    last && targetCalibrated !== mixCalibrated
      ? h('p', { class: 'error' },
          mixCalibrated
            ? 'Your target was picked without white paper but your mix was calibrated, so the comparison may be off.'
            : 'This mix photo was read without white paper, so the comparison to your target may be off. Include blank paper next time.')
      : null;

  const check = async () => {
    const picked = await pickColorFromPhoto('Sample your current mix');
    if (!picked) return;
    const suggestion = suggestNextStep(picked.hex, session.targetHex, paints);
    await ctx.sessions.addStep({ measuredHex: picked.hex, calibrated: picked.calibrated, suggestion, ts: Date.now() });
    root.replaceChildren();
    await renderMix(root, ctx);
  };

  root.append(
    h('section', { class: 'card' },
      h('div', { class: 'swatch-row' },
        swatch(session.targetHex, 'Target'),
        last ? swatch(last.measuredHex, 'Your mix') : null,
        last?.suggestion.predictedHex ? swatch(last.suggestion.predictedHex, 'After next step') : null,
      ),
      last ? suggestionCard(last.suggestion) : firstStepHelp(),
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

function suggestionCard(s: Suggestion): HTMLElement {
  const detail =
    s.status === 'adjust' && s.predictedDeltaE !== undefined
      ? `Difference from target: ${fmt(s.currentDeltaE)}, about ${fmt(s.predictedDeltaE)} after this step. Under 3 is a match.`
      : `Difference from target: ${fmt(s.currentDeltaE)}. Under 3 is a match.`;
  return h('div', { class: `suggestion ${s.status}` },
    h('p', { class: 'suggestion-main' }, formatSuggestion(s)),
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
            ),
          ),
        )
        .reverse(),
    ),
  );
}
