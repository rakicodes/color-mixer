import { describe, expect, it, vi } from 'vitest';
import { flush } from './helpers';

// Separate file: these scenarios replace the view renderers, and main.ts registers
// global listeners that would leak into other navigation tests.

vi.mock('../src/picker', () => ({ pickColorFromPhoto: vi.fn() }));
vi.mock('../src/errors', () => ({ reportError: vi.fn(), setErrorContext: vi.fn(), initErrorReporting: vi.fn() }));

let releaseTarget: (() => void) | undefined;
vi.mock('../src/views/target', () => ({
  renderTarget: vi.fn(async (root: HTMLElement) => {
    await new Promise<void>((r) => (releaseTarget = r));
    root.textContent = 'SLOW TARGET VIEW';
  }),
}));
vi.mock('../src/views/mix', () => ({
  renderMix: vi.fn(async () => {
    throw new Error('mix view exploded');
  }),
}));

import { reportError } from '../src/errors';

const PAGE = `<nav id="tabs"><button data-tab="paints">Paints</button><button data-tab="target">Target</button>
  <button data-tab="mix">Mix</button></nav><main id="view"></main>`;

describe('NAV-03: render failures and stale renders', () => {
  it('NAV-03: a view that fails to render shows a toast and is reported', async () => {
    vi.stubGlobal('scrollTo', vi.fn());
    history.replaceState(null, '', '/#paints');
    document.body.innerHTML = PAGE;
    await import('../src/main');
    await vi.waitFor(() => expect(document.getElementById('view')!.textContent).toContain('Add a paint'));

    location.hash = 'mix';
    await vi.waitFor(() =>
      expect(document.querySelector('.toast')?.textContent).toBe('Something went wrong showing this page. Try reloading.'),
    );
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'mix view exploded' }), { tab: 'mix' });
    // The previous view stays on screen.
    expect(document.getElementById('view')!.textContent).toContain('Add a paint');
  });

  it('NAV-03: a slow view that finishes after the user moved on does not replace the newer view', async () => {
    document.querySelector('.toast')?.remove();
    location.hash = 'target'; // slow render starts
    await flush();
    location.hash = 'paints'; // user moves on
    await vi.waitFor(() => expect(document.getElementById('view')!.textContent).toContain('Add a paint'));
    releaseTarget!();
    await flush();
    expect(document.getElementById('view')!.textContent).not.toContain('SLOW TARGET VIEW');
    expect(document.querySelector('#tabs button.active')?.getAttribute('data-tab')).toBe('paints');
  });
});
