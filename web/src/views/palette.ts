import { DuplicatePaintError, type Paint } from '@color-mixer/core';
import type { AppContext } from '../app';
import { colorField, h, withErrors } from '../dom';
import { pickColorFromPhoto } from '../picker';
import { trackEvent } from '../analytics';

export async function renderPalette(root: HTMLElement, ctx: AppContext): Promise<void> {
  const paints = await ctx.palette.list();
  const rerender = async () => {
    root.replaceChildren();
    await renderPalette(root, ctx);
  };

  // Add form
  let source: Paint['source'] = 'manual';
  const name = h('input', { type: 'text', placeholder: 'Paint name, e.g. Ultramarine', class: 'grow' });
  const color = colorField('#1f3fa8', () => (source = 'manual'));
  const addError = h('p', { class: 'error' });

  const fromPhoto = async () => {
    const picked = await pickColorFromPhoto('Sample your paint swatch');
    if (!picked) return;
    color.set(picked.hex);
    source = 'photo';
    trackEvent('paint-from-photo');
    addError.textContent = picked.calibrated ? '' : 'Tip: include white paper in the photo for more accurate color.';
    name.focus();
  };

  const add = async (e: Event) => {
    e.preventDefault();
    if (!name.value.trim()) {
      addError.textContent = 'Give the paint a name.';
      name.focus();
      return;
    }
    try {
      await ctx.palette.add({ name: name.value.trim(), hex: color.value, source });
    } catch (err) {
      if (!(err instanceof DuplicatePaintError)) throw err;
      addError.textContent = err.message;
      name.focus();
      return;
    }
    trackEvent('paint-added');
    await rerender();
  };

  root.append(
    h('header', { class: 'page-head' },
      h('span', { class: 'eyebrow' }, `${paints.length} ${paints.length === 1 ? 'pan' : 'pans'}`),
      h('h2', { class: 'page-title' }, 'Your paints', h('span', { class: 'title-count' }, ` (${paints.length})`)),
    ),
    h('section', { class: 'card' },
      h('h2', {}, 'Add a paint'),
      h('p', { class: 'hint' },
        'Paint a strong, even swatch of each color on your paper. Then photograph it with some blank paper in view, or enter the color by hand.'),
      h('form', { class: 'stack', onsubmit: withErrors(add) },
        name,
        h('div', { class: 'row' }, color.el, h('button', { type: 'button', onclick: withErrors(fromPhoto) }, 'From photo…')),
        addError,
        h('button', { type: 'submit', class: 'primary' }, 'Add paint'),
      ),
    ),
  );

  // List
  const list = h('ul', { class: 'paint-list' });
  for (const paint of paints) {
    let current = paint; // kept up to date so name and color edits don't overwrite each other
    const save = async (changes: Partial<Paint>) => {
      const previous = current;
      current = { ...current, ...changes };
      try {
        await ctx.palette.update(current);
      } catch (err) {
        current = previous;
        throw err;
      }
    };
    const rowError = h('p', { class: 'error' });
    // A rejected name stays in the field so it can be corrected; storage keeps the old name.
    const rename = h('input', {
      type: 'text',
      value: paint.name,
      class: 'grow inline-edit',
      'aria-label': 'Paint name',
      onchange: withErrors(async () => {
        const next = rename.value.trim();
        if (!next) {
          rowError.textContent = 'Give the paint a name.';
          return;
        }
        try {
          await save({ name: next });
        } catch (err) {
          if (!(err instanceof DuplicatePaintError)) throw err;
          rowError.textContent = err.message;
          return;
        }
        rowError.textContent = '';
      }),
    });
    const strength = h('div', { class: 'strength', style: { background: strengthRamp(paint.hex) } });
    const hexLabel = h('span', { class: 'paint-hex hex' }, paint.hex);
    const editColor = colorField(paint.hex, (hex) => {
      strength.style.background = strengthRamp(hex);
      hexLabel.textContent = hex;
    });
    editColor.el.addEventListener(
      'change',
      withErrors(async () => {
        if (editColor.value !== current.hex) await save({ hex: editColor.value, source: 'manual' });
      }),
    );
    list.append(
      h('li', { class: 'paint-item' },
        editColor.el,
        strength,
        rename,
        h('div', { class: 'paint-meta' },
          hexLabel,
          h('span', { class: 'badge' }, paint.source === 'photo' ? 'photo' : 'manual'),
        ),
        h('div', { class: 'paint-corner' },
          h('button', {
            class: 'danger icon',
            'aria-label': `Delete ${current.name}`,
            title: 'Delete',
            onclick: withErrors(async () => {
              if (confirm(`Delete ${current.name}?`)) {
                await ctx.palette.remove(paint.id);
                await rerender();
              }
            }),
          }, '✕'),
        ),
        rowError,
      ),
    );
  }

  if (paints.length) {
    root.append(list, h('button', { class: 'primary', onclick: () => ctx.go('target') }, 'Next: choose a target →'));
  } else {
    root.append(h('p', { class: 'hint' }, 'No paints yet. Add the paints you own above.'));
  }
}

/** Full-strength colour fading to paper, like a wash swatch. */
const strengthRamp = (hex: string) => `linear-gradient(90deg, ${hex} 0%, ${hex} 25%, color-mix(in srgb, ${hex} 18%, transparent) 100%)`;
