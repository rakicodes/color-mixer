/*
 * Privacy-friendly usage counts via GoatCounter (no cookies, no personal data).
 * Sends: the tab name on each tab view, and the names of a few actions
 * (e.g. `paint-added`, `mix-started`), plus what GoatCounter collects from any
 * page load (referrer, browser, screen size, country). Never sends colors,
 * paint names, photos or user info.
 * Disabled when VITE_GOATCOUNTER_URL is empty, outside production builds, and
 * on localhost (GoatCounter's own default).
 */

interface CountVars {
  path: string;
  title?: string;
  event?: boolean;
}

declare global {
  interface Window {
    goatcounter?: { no_onload?: boolean; count?: (vars: CountVars) => void };
  }
}

let enabled = false;
const queue: CountVars[] = []; // counts made before count.js finished loading

/** Call once at startup. */
export function initAnalytics(): void {
  const endpoint = import.meta.env.VITE_GOATCOUNTER_URL;
  if (!endpoint || !import.meta.env.PROD) return;
  enabled = true;
  // Tabs are hash routes, which GoatCounter doesn't see, so count views by hand.
  window.goatcounter = { no_onload: true };
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://gc.zgo.at/count.js';
  script.dataset.goatcounter = endpoint;
  script.addEventListener('load', () => {
    for (const vars of queue.splice(0)) send(vars);
  });
  document.head.append(script);
}

function send(vars: CountVars): void {
  if (!enabled) return;
  const count = window.goatcounter?.count;
  if (count) count(vars);
  else queue.push(vars);
}

/** Count a view of a tab, e.g. `mix`. */
export function trackView(tab: string): void {
  send({ path: tab, title: tab });
}

/** Count an action, e.g. `paint-added`. */
export function trackEvent(name: string): void {
  send({ path: name, event: true });
}
