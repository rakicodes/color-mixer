import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, PAINTS } from './helpers';

vi.mock('../src/picker', () => ({ pickColorFromPhoto: vi.fn() }));
vi.mock('../src/errors', () => ({ reportError: vi.fn(), setErrorContext: vi.fn(), initErrorReporting: vi.fn() }));

const PAGE = `
  <header>
    <button id="theme-toggle">◐</button>
    <nav id="tabs">
      <button data-tab="paints">Paints</button>
      <button data-tab="target">Target</button>
      <button data-tab="mix">Mix</button>
    </nav>
  </header>
  <main id="view"></main>`;

/** Boots main.ts like a fresh page load with the given storage and URL hash. */
async function boot(storage: Record<string, unknown> = {}, hash = '') {
  vi.resetModules();
  localStorage.clear();
  for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, JSON.stringify(v));
  history.replaceState(null, '', `/${hash}`);
  document.body.innerHTML = PAGE;
  const errors = await import('../src/errors');
  vi.mocked(errors.reportError).mockClear();
  vi.mocked(errors.setErrorContext).mockClear();
  await import('../src/main');
  await vi.waitFor(() => expect(view().childElementCount).toBeGreaterThan(0));
  return errors;
}

const view = () => document.getElementById('view')!;
const activeTab = () => document.querySelector('#tabs button.active')?.getAttribute('data-tab');
const paints = PAINTS.map((p, i) => ({ ...p, id: `p${i}` }));
const session = { targetHex: '#336699', steps: [] };

beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()));

describe('NAV-02: start tab', () => {
  it('NAV-02: a first visit opens Paints', async () => {
    await boot();
    expect(location.hash).toBe('#paints');
    expect(activeTab()).toBe('paints');
    expect(view().textContent).toContain('Add a paint');
  });

  it('NAV-02: with paints but no mix, opens Target', async () => {
    await boot({ 'color-mixer:palette': paints });
    expect(location.hash).toBe('#target');
    expect(view().textContent).toContain('What color do you want?');
  });

  it('NAV-02: with a mix in progress, opens Mix', async () => {
    await boot({ 'color-mixer:palette': paints, 'color-mixer:session': session });
    expect(location.hash).toBe('#mix');
    expect(activeTab()).toBe('mix');
  });

  it('NAV-02: an explicit hash wins', async () => {
    await boot({ 'color-mixer:session': session }, '#paints');
    expect(location.hash).toBe('#paints');
    expect(view().textContent).toContain('Add a paint');
  });
});

describe('NAV-01: tabs', () => {
  it('NAV-01: clicking a tab switches view and highlights it', async () => {
    await boot();
    document.querySelector<HTMLButtonElement>('[data-tab="target"]')!.click();
    await vi.waitFor(() => expect(view().textContent).toContain('What color do you want?'));
    expect(location.hash).toBe('#target');
    expect(activeTab()).toBe('target');
    expect(document.querySelectorAll('#tabs button.active')).toHaveLength(1);
  });

  it('NAV-01: an unknown hash shows Paints', async () => {
    await boot({}, '#nonsense');
    expect(activeTab()).toBe('paints');
    expect(view().textContent).toContain('Add a paint');
  });

  it('NAV-01 / ERR-02: tags error reports with the current tab', async () => {
    const errors = await boot({}, '#target');
    expect(errors.setErrorContext).toHaveBeenCalledWith('tab', 'target');
  });

  it('NAV-01: scrolls to the top on each view', async () => {
    await boot();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe('DAT-02: corrupt storage', () => {
  it('DAT-02: the app still starts when stored data is garbage', async () => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem('color-mixer:palette', '{oops');
    localStorage.setItem('color-mixer:session', 'not json');
    localStorage.setItem('color-mixer:settings', '[');
    history.replaceState(null, '', '/');
    document.body.innerHTML = PAGE;
    await import('../src/main');
    await vi.waitFor(() => expect(view().textContent).toContain('Add a paint'));
    await flush();
    expect(document.querySelector('.toast')).toBeNull();
  });
});
