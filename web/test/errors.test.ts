import { CalibrationError } from '@color-mixer/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/browser', () => ({ init: vi.fn(), captureException: vi.fn(), setTag: vi.fn() }));
import * as Sentry from '@sentry/browser';

const DSN = 'https://public@o0.ingest.sentry.io/0';

async function load(dsn: string, release = '') {
  vi.resetModules();
  vi.stubEnv('VITE_SENTRY_DSN', dsn);
  vi.stubEnv('VITE_RELEASE', release);
  const mod = await import('../src/errors');
  mod.initErrorReporting();
  return mod;
}

beforeEach(() => vi.clearAllMocks());

describe('ERR-02: Sentry reporting', () => {
  it('ERR-02 / DEV-04: initializes with the DSN and release, without user info or tracing', async () => {
    await load(DSN, 'abc123');
    expect(Sentry.init).toHaveBeenCalledOnce();
    const opts = vi.mocked(Sentry.init).mock.calls[0][0]!;
    expect(opts).toMatchObject({ dsn: DSN, release: 'abc123', dataCollection: { userInfo: false } });
    // Only these options: no tracing, replay, or extra integrations that could capture page content.
    expect(Object.keys(opts).sort()).toEqual(['dataCollection', 'dsn', 'environment', 'release']);
  });

  it('DEV-04: no release when VITE_RELEASE is empty', async () => {
    await load(DSN, '');
    expect(vi.mocked(Sentry.init).mock.calls[0][0]!.release).toBeUndefined();
  });

  it('ERR-02: reports errors with context as extra data', async () => {
    const { reportError } = await load(DSN);
    const err = new Error('boom');
    reportError(err, { tab: 'mix' });
    expect(Sentry.captureException).toHaveBeenCalledWith(err, { extra: { tab: 'mix' } });
    reportError(err);
    expect(Sentry.captureException).toHaveBeenLastCalledWith(err, undefined);
  });

  it('ERR-02: tags tab and mixing model', async () => {
    const { setErrorContext } = await load(DSN);
    setErrorContext('tab', 'mix');
    setErrorContext('mixModel', 'km-spectral');
    expect(Sentry.setTag).toHaveBeenCalledWith('tab', 'mix');
    expect(Sentry.setTag).toHaveBeenCalledWith('mixModel', 'km-spectral');
  });
});

describe('ERR-03: expected guidance is not reported', () => {
  it('ERR-03: CalibrationError is skipped', async () => {
    const { reportError } = await load(DSN);
    reportError(new CalibrationError('Tap the paper again'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('ERR-04: turning reporting off', () => {
  it('ERR-04: an empty DSN disables everything', async () => {
    const { reportError, setErrorContext } = await load('');
    reportError(new Error('boom'));
    setErrorContext('tab', 'mix');
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.setTag).not.toHaveBeenCalled();
  });
});
