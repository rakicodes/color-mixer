import {
  formatSuggestion,
  getMixModel,
  isMixModelId,
  MIX_MODELS,
  formatStartingMix,
  listOf,
  nextStepFromRecipe,
  planFromScratch,
  suggestionPaints,
  type Amount,
  type MixModelId,
  type MixStep,
  type Paint,
  type Recipe,
  type Suggestion,
  type Wash,
} from '@color-mixer/core';
import type { AppContext } from '../app';
import { h, swatch, withErrors } from '../dom';
import { setErrorContext } from '../errors';
import { pickColorFromPhoto } from '../picker';
import { trackEvent } from '../analytics';

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
  // The from-scratch recipe: shown before the first photo, and as the start of the final recipe.
  const needsStart = !last || last.suggestion.status !== 'adjust';
  const start = needsStart && paints.length ? planFromScratch(session.targetHex, paints, { model: settings.mixModel }) : null;
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
    trackEvent('mix-checked');
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
    trackEvent(`model-${id}`);
    if (last) {
      const { suggestion } = nextStepFromRecipe(last.measuredHex, session.targetHex, paints, { model: id });
      await ctx.sessions.replaceLastStep({ ...last, suggestion });
    }
    await rerender();
  };

  root.append(
    h('div', { class: 'swatch-stage' },
      h('div', { class: 'swatch-row' },
        swatch(session.targetHex, 'Target'),
        last ? swatch(last.measuredHex, 'Your mix') : null,
        last?.suggestion.predictedHex ? swatch(last.suggestion.predictedHex, 'After next step') : null,
      ),
      last ? matchNote(last.suggestion) : null,
    ),
    h('section', { class: 'card' },
      h('h2', {}, 'Your recipe'),
      ...(last
        ? [suggestionCard(last.suggestion, paints, finalRecipe(session.steps, start, paints))]
        : firstRecipe(start, paints)),
      calibrationWarning,
      paints.length
        ? null
        : h('p', { class: 'error' }, 'You have no paints yet, so the app can only suggest water. ',
            h('a', { href: '#paints' }, 'Add paints')),
    ),
    h('button', { class: 'primary big', onclick: withErrors(check) },
      last ? (last.suggestion.status === 'done' ? 'Check again' : 'I did it: photograph the mix') : 'Photograph your mix'),
    h('p', { class: 'hint' },
      'For accurate readings, brush a test stroke on the same paper and let it dry (watercolor dries lighter). Photograph it in even light, without glare, with blank paper in view.'),
    modelPicker(settings.mixModel, last, withErrors(async (e: Event) => {
      const id = (e.target as HTMLSelectElement).value;
      if (isMixModelId(id)) await onModelChange(id);
    })),
  );

  if (session.steps.length) root.append(history(session.steps));

  root.append(
    h('div', { class: 'row end' },
      h('button', { class: 'secondary', onclick: () => ctx.go('target') }, 'Change target'),
      h('button', {
        class: 'secondary danger',
        onclick: withErrors(async () => {
          if (!confirm('Clear this mix and its history?')) return;
          await ctx.sessions.clear();
          trackEvent('mix-cleared');
          ctx.go('target');
        }),
      }, 'End mix'),
    ),
  );
}

/** Before the first photo: an intro, then the starting recipe as ingredients and method. */
function firstRecipe(start: Recipe | null, paints: Paint[]): HTMLElement[] {
  const parts = start?.parts ?? [];
  const intro = parts.length
    ? `Take a picture of your colour, or use ${listOf(parts.map((p) => p.name))} to create it.`
    : 'Take a picture of your colour to get started.';
  const out = [h('div', { class: 'suggestion' }, h('p', { class: 'suggestion-main' }, intro))];
  if (start && parts.length) {
    out.push(
      h('div', { class: 'starting-mix' },
        recipeSection('Ingredients', recipeBars(startRows(start, paints))),
        recipeSection('Method', method(
          h('li', { class: 'starting-mix-main' }, `Mix ${formatStartingMix(start)}`),
          'Brush a test stroke on the same paper and let it dry (watercolour dries lighter).',
          'Photograph it with blank paper in view.',
        )),
      ),
    );
  }
  return out;
}

/** Ingredient rows for a from-scratch recipe: its paints in parts, then water. */
function startRows(start: Recipe, paints: Paint[]): BarRow[] {
  const byId = new Map(paints.map((p) => [p.id, p]));
  const rows: BarRow[] = (start.parts ?? []).map((part) => ({
    hex: byId.get(part.paintId)?.hex ?? start.predictedHex,
    name: part.name,
    amount: partsLabel(part.parts),
    width: part.share,
  }));
  if (start.wash) {
    rows.push({ name: 'Water', amount: WASH_SHORT[start.wash], width: start.waterFraction ?? 0.5, water: true });
  }
  return rows;
}

const partsLabel = (n: number) => `${n} part${n === 1 ? '' : 's'}`;

/**
 * Everything that went into a finished mix: the starting recipe plus every
 * adjustment, assuming each was followed. Amounts are joined ("4 parts + some");
 * bar lengths are a rough total, scaled so the most-used paint fills its bar.
 */
export function finalRecipe(steps: MixStep[], start: Recipe | null, paints: Paint[]): { rows: BarRow[]; method: string[] } {
  const byId = new Map(paints.map((p) => [p.id, p]));
  const used = new Map<string, { hex?: string; name: string; amounts: string[]; total: number }>();
  const water = { amounts: [] as string[], total: 0 };
  const method: string[] = [];
  const use = (id: string, name: string, amount: string, weight: number) => {
    const entry = used.get(id) ?? { hex: byId.get(id)?.hex, name, amounts: [], total: 0 };
    entry.amounts.push(amount);
    entry.total += weight;
    used.set(id, entry);
  };

  if (start?.parts?.length) {
    for (const part of start.parts) use(part.paintId, part.name, partsLabel(part.parts), part.share);
    if (start.wash) {
      water.amounts.push(WASH_SHORT[start.wash]);
      water.total += start.waterFraction ?? 0.5;
    }
    method.push(`Mix ${formatStartingMix(start)}`);
  }
  for (const { suggestion: s } of steps) {
    if (s.status !== 'adjust') continue;
    const added = suggestionPaints(s);
    if (!added.length && s.water === 'none') continue;
    for (const p of added) use(p.id, p.name, AMOUNT_SHORT[p.amount].label, p.fraction ?? AMOUNT_SHORT[p.amount].width);
    if (s.water !== 'none') {
      water.amounts.push(AMOUNT_SHORT[s.water].label);
      water.total += AMOUNT_SHORT[s.water].width;
    }
    method.push(formatSuggestion(s));
  }

  const max = Math.max(0, ...[...used.values()].map((u) => u.total));
  const rows: BarRow[] = [...used.values()].map((u) => ({
    hex: u.hex,
    name: u.name,
    amount: u.amounts.join(' + '),
    width: max ? u.total / max : 0,
  }));
  if (water.amounts.length) {
    rows.push({ name: 'Water', amount: water.amounts.join(' + '), width: Math.min(1, water.total), water: true });
  }
  return { rows, method };
}

/** A small-caps heading ("INGREDIENTS", "METHOD") over its content. */
function recipeSection(title: string, content: HTMLElement): HTMLElement {
  return h('section', { class: 'recipe-section' }, h('h3', { class: 'label recipe-heading' }, title), content);
}

/** Numbered method steps; strings become list items. */
function method(...steps: (string | HTMLLIElement)[]): HTMLElement {
  return h('ol', { class: 'method' }, ...steps.map((st) => (typeof st === 'string' ? h('li', {}, st) : st)));
}

const WASH_SHORT: Record<Wash, string> = {
  strong: 'a little',
  medium: 'some',
  pale: 'lots — very wet',
};

const AMOUNT_SHORT: Record<Exclude<Amount, 'none'>, { label: string; width: number }> = {
  touch: { label: 'a touch', width: 0.12 },
  some: { label: 'some', width: 0.45 },
  lot: { label: 'a lot', width: 0.8 },
};

export interface BarRow {
  hex?: string;
  name: string;
  amount: string;
  /** Bar length, 0..1. */
  width: number;
  water?: boolean;
}

/** Paint-by-paint breakdown: a blob, the name, an amount and a proportion bar. */
function recipeBars(rows: BarRow[]): HTMLElement {
  return h('ul', { class: 'recipe-bars' },
    ...rows.map((row) =>
      h('li', { class: 'recipe-bar' },
        h('span', { class: row.water ? 'chip sm water' : 'chip sm', style: row.hex ? { background: row.hex } : {} }),
        h('span', { class: 'recipe-bar-name' }, row.name),
        h('span', { class: 'recipe-bar-amount' }, row.amount),
        h('span', { class: 'recipe-bar-track', 'aria-hidden': 'true' },
          h('span', {
            class: 'recipe-bar-fill',
            style: {
              width: `${Math.round(Math.min(1, Math.max(0.04, row.width)) * 100)}%`,
              background: row.water ? 'var(--water)' : row.hex,
            },
          }),
        ),
      ),
    ),
  );
}

/** Handwritten aside next to the swatches. */
function matchNote(s: Suggestion): HTMLElement | null {
  const note = s.status === 'done' ? 'a match!' : s.status === 'adjust' && s.currentDeltaE < 6 ? 'so close…' : null;
  return note ? h('span', { class: 'swatch-note hand' }, note) : null;
}

function suggestionCard(s: Suggestion, paints: Paint[], final: { rows: BarRow[]; method: string[] }): HTMLElement {
  const byId = new Map(paints.map((p) => [p.id, p]));
  const rows: BarRow[] = s.status === 'adjust'
    ? suggestionPaints(s).map((p) => ({
        hex: byId.get(p.id)?.hex,
        name: p.name,
        amount: AMOUNT_SHORT[p.amount].label,
        width: AMOUNT_SHORT[p.amount].width,
      }))
    : [];
  if (s.status === 'adjust' && s.water !== 'none') {
    rows.push({ name: 'Water', amount: AMOUNT_SHORT[s.water].label, width: AMOUNT_SHORT[s.water].width, water: true });
  }
  return h('div', { class: `suggestion ${s.status}` },
    h('p', { class: 'suggestion-main' }, formatSuggestion(s)),
    s.modelId ? h('span', { class: 'badge' }, getMixModel(s.modelId).shortLabel) : null,
    ...(s.status === 'adjust'
      ? [
          rows.length ? recipeSection('Ingredients', recipeBars(rows)) : null,
          recipeSection('Method', method(
            'Add these to your puddle and mix well.',
            'Brush a test stroke, let it dry, then photograph it.',
          )),
        ]
      : [
          final.rows.length ? recipeSection('Ingredients', recipeBars(final.rows)) : null,
          final.method.length ? recipeSection('Method', method(...final.method)) : null,
        ]),
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
