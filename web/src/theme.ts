import { THEMES, type SettingsRepo, type Theme } from '@color-mixer/core';
import { withErrors } from './dom';

const ICONS: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' };
const NAMES: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };
/** Browser bar color per resolved theme; matches --bg in style.css. */
const BAR_COLORS = { light: '#fbf5ee', dark: '#241719' };

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

const resolve = (theme: Theme): 'light' | 'dark' =>
  theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : theme;

/**
 * Sets data-theme on <html> ('system' removes it so CSS follows the device)
 * and updates the browser bar color. The inline script in index.html does the
 * same before first paint.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLORS[resolve(theme)]);
}

/** Wire up the header button: cycles System → Light → Dark and saves the choice. */
export async function initThemeToggle(settings: SettingsRepo): Promise<void> {
  const button = document.getElementById('theme-toggle') as HTMLButtonElement | null;
  let theme = (await settings.load()).theme;

  const show = () => {
    applyTheme(theme);
    if (!button) return;
    const label = `Theme: ${NAMES[theme]}`;
    button.textContent = ICONS[theme];
    button.title = label;
    button.setAttribute('aria-label', `${label}. Tap to change.`);
  };

  button?.addEventListener(
    'click',
    withErrors(async () => {
      theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      show();
      await settings.update({ theme });
    }),
  );
  // In System mode, follow the device if it switches while the app is open.
  darkQuery.addEventListener('change', () => theme === 'system' && show());
  show();
}
