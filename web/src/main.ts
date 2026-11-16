import { initErrorReporting, reportError, setErrorContext } from './errors';
initErrorReporting(); // as early as possible

import '@fontsource/bodoni-moda/400.css';
import '@fontsource/bodoni-moda/500.css';
import '@fontsource/bodoni-moda/500-italic.css';
import '@fontsource/jost/400.css';
import '@fontsource/jost/500.css';
import '@fontsource/jost/600.css';
import '@fontsource/jost/600-italic.css';
import '@fontsource/caveat/400.css';
import { palette, sessions, settings, type AppContext, type Tab } from './app';
import { renderMix } from './views/mix';
import { renderPalette } from './views/palette';
import { renderTarget } from './views/target';
import { toast } from './dom';
import { initThemeToggle } from './theme';

const view = document.getElementById('view')!;
const tabs = document.getElementById('tabs')!;
const renderers: Record<Tab, (root: HTMLElement, ctx: AppContext) => Promise<void>> = {
  paints: renderPalette,
  target: renderTarget,
  mix: renderMix,
};

const ctx: AppContext = { palette, sessions, settings, go };

function go(tab: Tab) {
  location.hash = tab;
}

let renderId = 0;

async function render() {
  const id = ++renderId;
  const tab = (location.hash.slice(1) as Tab) || 'paints';
  const current = tab in renderers ? tab : 'paints';
  for (const btn of tabs.querySelectorAll<HTMLButtonElement>('button')) {
    btn.classList.toggle('active', btn.dataset.tab === current);
  }
  // Build into a detached container and only show it if no newer render has
  // started meanwhile. Matters once storage is truly async (e.g. a phone app).
  setErrorContext('tab', current);
  const container = document.createElement('div');
  container.className = 'view-content';
  try {
    await renderers[current](container, ctx);
  } catch (err) {
    console.error(err);
    reportError(err, { tab: current });
    if (id === renderId) toast("Something went wrong showing this page. Try reloading.");
    return;
  }
  if (id !== renderId) return;
  view.replaceChildren(container);
  window.scrollTo(0, 0);
}

tabs.addEventListener('click', (e) => {
  const tab = (e.target as HTMLElement).closest('button')?.dataset.tab as Tab | undefined;
  if (tab) go(tab);
});
window.addEventListener('hashchange', render);

void initThemeToggle(settings);
void settings.load().then((s) => setErrorContext('mixModel', s.mixModel));

// Start on the Mix tab when there is a session in progress.
(async () => {
  if (!location.hash) {
    const [paints, session] = await Promise.all([palette.list(), sessions.load()]);
    const start: Tab = session ? 'mix' : paints.length ? 'target' : 'paints';
    history.replaceState(null, '', `#${start}`); // no hashchange, so no double render
  }
  await render();
})();
