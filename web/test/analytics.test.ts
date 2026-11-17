// happy-dom can't fetch count.js; treat that as loaded instead of logging an error. The tests stand in for it.
// @vitest-environment-options {"settings":{"handleDisabledFileLoadingAsSuccess":true}}
import { afterEach, describe, expect, it, vi } from 'vitest';

const URL = 'https://example.goatcounter.com/count';

async function load(url: string, prod = true) {
  vi.resetModules();
  vi.stubEnv('VITE_GOATCOUNTER_URL', url);
  vi.stubEnv('PROD', prod);
  const mod = await import('../src/analytics');
  mod.initAnalytics();
  return mod;
}

const script = () => document.querySelector<HTMLScriptElement>('script[data-goatcounter]');

afterEach(() => {
  vi.unstubAllEnvs();
  script()?.remove();
  delete window.goatcounter;
});

describe('GoatCounter analytics', () => {
  it('loads count.js with the endpoint and turns off automatic page views', async () => {
    await load(URL);
    expect(script()?.src).toBe('https://gc.zgo.at/count.js');
    expect(script()?.dataset.goatcounter).toBe(URL);
    expect(window.goatcounter).toEqual({ no_onload: true });
  });

  it('counts tab views and events once count.js is ready', async () => {
    const { trackView, trackEvent } = await load(URL);
    const count = vi.fn();
    window.goatcounter!.count = count;
    trackView('mix');
    trackEvent('paint-added');
    expect(count).toHaveBeenCalledWith({ path: 'mix', title: 'mix' });
    expect(count).toHaveBeenCalledWith({ path: 'paint-added', event: true });
  });

  it('queues counts made before count.js loads and sends them on load', async () => {
    const { trackView } = await load(URL);
    trackView('paints');
    const count = vi.fn();
    window.goatcounter!.count = count;
    script()!.dispatchEvent(new Event('load'));
    expect(count).toHaveBeenCalledWith({ path: 'paints', title: 'paints' });
  });

  it('does nothing without an endpoint', async () => {
    const { trackView } = await load('');
    trackView('mix');
    expect(script()).toBeNull();
    expect(window.goatcounter).toBeUndefined();
  });

  it('does nothing outside production builds', async () => {
    await load(URL, false);
    expect(script()).toBeNull();
    expect(window.goatcounter).toBeUndefined();
  });
});
