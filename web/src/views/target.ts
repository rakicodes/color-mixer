import type { AppContext } from '../app';
import { colorField, h, withErrors } from '../dom';
import { pickColorFromPhoto } from '../picker';

export async function renderTarget(root: HTMLElement, ctx: AppContext): Promise<void> {
  const session = await ctx.sessions.load();
  const preview = h('div', { class: 'target-preview' });
  const uncalibratedHint = h('p', { class: 'error' });
  // Hand-entered colors count as calibrated: they already assume white paper.
  let calibrated = session?.targetCalibrated ?? true;
  const setCalibrated = (value: boolean) => {
    calibrated = value;
    uncalibratedHint.textContent = value
      ? ''
      : 'This target was picked without white paper in the photo, so it may be off. Mix readings will be compared against it as-is.';
  };
  const field = colorField(session?.targetHex ?? '#6a8caf', (hex) => {
    preview.style.background = hex;
    setCalibrated(true);
  });
  preview.style.background = field.value;
  setCalibrated(calibrated);

  const fromPhoto = async () => {
    const picked = await pickColorFromPhoto('Pick your target color');
    if (!picked) return;
    field.set(picked.hex);
    setCalibrated(picked.calibrated);
  };

  const start = async () => {
    if (session?.steps.length && !confirm('Start a new mix? Your current mixing history will be cleared.')) return;
    await ctx.sessions.start(field.value, calibrated);
    ctx.go('mix');
  };

  root.append(
    h('header', { class: 'page-head' },
      h('h2', { class: 'page-title' }, 'What color do you want?'),
    ),
    h('section', { class: 'card target-panel' },
      h('span', { class: 'label' }, 'Target'),
      preview,
      h('span', { class: 'hint' }, 'Hex code'),
      h('div', { class: 'row' }, field.el, h('button', { onclick: withErrors(fromPhoto) }, 'From photo…')),
      uncalibratedHint,
      h('p', { class: 'hint' },
        'Picking from a photo of a reference (like a painting or a color card) works best with white paper in the shot.'),
    ),
    h('button', { class: 'primary big', onclick: withErrors(start) }, session ? 'Start a new mix' : 'Start mixing'),
  );
  if (session) root.append(h('button', { class: 'secondary', onclick: () => ctx.go('mix') }, 'Back to current mix'));
}
