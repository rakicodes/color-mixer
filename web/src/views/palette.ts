import type { Paint } from '@color-mixer/core';
import type { AppContext } from '../app';
import { colorField, h } from '../dom';
import { pickColorFromPhoto } from '../picker';

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
    await ctx.palette.add({ name: name.value.trim(), hex: color.value, source });
    await rerender();
  };

  root.append(
    h('section', { class: 'card' },
      h('h2', {}, 'Add a paint'),
      h('p', { class: 'hint' },
        'Paint a strong, even swatch of each color on your paper. Then photograph it with some blank paper in view, or enter the color by hand.'),
      h('form', { class: 'stack', onsubmit: add },
        name,
        h('div', { class: 'row' }, color.el, h('button', { type: 'button', onclick: fromPhoto }, 'From photo…')),
        addError,
        h('button', { type: 'submit', class: 'primary' }, 'Add paint'),
      ),
    ),
  );

  // List
  const list = h('ul', { class: 'paint-list' });
  for (const paint of paints) {
    let current = paint; // kept up to date so name and color edits don't overwrite each other
    const save = (changes: Partial<Paint>) => {
      current = { ...current, ...changes };
      return ctx.palette.update(current);
    };
    const rename = h('input', {
      type: 'text',
      value: paint.name,
      class: 'grow inline-edit',
      'aria-label': 'Paint name',
      onchange: () => rename.value.trim() && save({ name: rename.value.trim() }),
    });
    const editColor = colorField(paint.hex);
    editColor.el.addEventListener('change', () => {
      if (editColor.value !== current.hex) save({ hex: editColor.value, source: 'manual' });
    });
    list.append(
      h('li', { class: 'paint-item' },
        editColor.el,
        rename,
        h('span', { class: 'badge' }, paint.source === 'photo' ? 'photo' : 'manual'),
        h('button', {
          class: 'danger icon',
          'aria-label': `Delete ${current.name}`,
          title: 'Delete',
          onclick: async () => {
            if (confirm(`Delete ${current.name}?`)) {
              await ctx.palette.remove(paint.id);
              await rerender();
            }
          },
        }, '✕'),
      ),
    );
  }

  root.append(
    h('section', { class: 'card' },
      h('h2', {}, `Your paints (${paints.length})`),
      paints.length ? list : h('p', { class: 'hint' }, 'No paints yet. Add the paints you own above.'),
      paints.length ? h('button', { class: 'primary', onclick: () => ctx.go('target') }, 'Next: choose a target →') : null,
    ),
  );
}
