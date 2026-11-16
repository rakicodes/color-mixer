import { MemoryStore, SettingsRepo } from '@color-mixer/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flush } from './helpers';

/** Controllable prefers-color-scheme media query. */
function fakeDarkQuery(matches: boolean) {
  const listeners: (() => void)[] = [];
  const mq = {
    matches,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: () => {},
    change(next: boolean) {
      mq.matches = next;
      listeners.forEach((fn) => fn());
    },
  };
  vi.stubGlobal('matchMedia', () => mq);
  return mq;
}

async function setup(darkDevice = false, saved?: object) {
  vi.resetModules();
  const mq = fakeDarkQuery(darkDevice);
  document.head.innerHTML = '<meta name="theme-color" content="#fbf5ee">';
  document.body.innerHTML = '<button id="theme-toggle">◐</button>';
  delete document.documentElement.dataset.theme;
  const store = new MemoryStore();
  if (saved) store.set('color-mixer:settings', JSON.stringify(saved));
  const settings = new SettingsRepo(store);
  const { initThemeToggle } = await import('../src/theme');
  await initThemeToggle(settings);
  const button = document.getElementById('theme-toggle') as HTMLButtonElement;
  const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content');
  return { mq, settings, button, meta };
}

beforeEach(() => vi.unstubAllGlobals());

describe('THM-01: theme toggle', () => {
  it('THM-01: starts on System with icon, title and label', async () => {
    const { button } = await setup();
    expect(button.textContent).toBe('◐');
    expect(button.title).toBe('Theme: System');
    expect(button.getAttribute('aria-label')).toBe('Theme: System. Tap to change.');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('THM-01: cycles System → Light → Dark → System and saves each choice', async () => {
    const { button, settings } = await setup();
    const expected = [
      ['☀', 'light', 'light'],
      ['☾', 'dark', 'dark'],
      ['◐', undefined, 'system'],
    ] as const;
    for (const [icon, dataTheme, saved] of expected) {
      button.click();
      await flush();
      expect(button.textContent).toBe(icon);
      expect(document.documentElement.dataset.theme).toBe(dataTheme);
      expect((await settings.load()).theme).toBe(saved);
    }
  });

  it('THM-01: restores a saved theme', async () => {
    const { button } = await setup(false, { theme: 'dark' });
    expect(button.textContent).toBe('☾');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('THM-01: keeps the mixing model when the theme changes', async () => {
    const { button, settings } = await setup(false, { mixModel: 'km-spectral' });
    button.click();
    await flush();
    expect(await settings.load()).toEqual({ mixModel: 'km-spectral', theme: 'light' });
  });
});

describe('THM-03: browser bar color and device changes', () => {
  it('THM-03: sets the browser bar color for the resolved theme', async () => {
    const { button, meta } = await setup(true);
    expect(meta()).toBe('#241719'); // System on a dark device
    button.click(); // Light
    expect(meta()).toBe('#fbf5ee');
    await flush(); // the button stays disabled until the choice is saved
    button.click(); // Dark
    expect(meta()).toBe('#241719');
  });

  it('THM-03: in System mode, follows the device switching while open', async () => {
    const { mq, meta } = await setup(false);
    expect(meta()).toBe('#fbf5ee');
    mq.change(true);
    expect(meta()).toBe('#241719');
  });

  it('THM-03: an explicit choice ignores device changes', async () => {
    const { mq, meta } = await setup(false, { theme: 'light' });
    mq.change(true);
    expect(meta()).toBe('#fbf5ee');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
