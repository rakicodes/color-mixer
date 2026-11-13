import type { AppContext } from '../app';
import { colorField, h } from '../dom';
import { pickColorFromPhoto } from '../picker';

export async function renderTarget(root: HTMLElement, ctx: AppContext): Promise<void> {
  const session = await ctx.sessions.load();
  const preview = h('div', { class: 'target-preview' });
  const field = colorField(session?.targetHex ?? '#6a8caf', (hex) => (preview.style.background = hex));
  preview.style.background = field.value;

  const fromPhoto = async () => {
    const picked = await pickColorFromPhoto('Pick your target color');
    if (picked) field.set(picked.hex);
  };

  const start = async () => {
    if (session?.steps.length && !confirm('Start a new mix? Your current mixing history will be cleared.')) return;
    await ctx.sessions.start(field.value);
    ctx.go('mix');
  };

  root.append(
    h('section', { class: 'card' },
      h('h2', {}, 'What color do you want?'),
      preview,
      h('div', { class: 'row' }, field.el, h('button', { onclick: fromPhoto }, 'From photo…')),
      h('p', { class: 'hint' },
        'Picking from a photo of a reference (like a painting or a color card) works best with white paper in the shot.'),
      h('button', { class: 'primary', onclick: start }, session ? 'Start a new mix' : 'Start mixing'),
      session ? h('button', { onclick: () => ctx.go('mix') }, 'Back to current mix') : null,
    ),
  );
}
