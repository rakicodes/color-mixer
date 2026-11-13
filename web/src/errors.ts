import * as Sentry from '@sentry/browser';

/*
 * Error reporting to Sentry (project rakicodes/color-mixer).
 * Sends: error message, stack trace, browser, release, and the `tab` and
 * `mixModel` tags. Never sends photos (they stay in a canvas) or user info.
 * Disabled when VITE_SENTRY_DSN is empty.
 */

const dsn = import.meta.env.VITE_SENTRY_DSN;
let enabled = false;

/** Call once, as early as possible. */
export function initErrorReporting(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    release: import.meta.env.VITE_RELEASE || undefined,
    // Errors only: no performance tracing (saves ~23 KB gzipped; the app has no backend).
    dataCollection: { userInfo: false },
  });
  enabled = true;
}

/** Report an error that the app caught (and showed to the user). */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  // Expected guidance (e.g. "tap the paper again") isn't a bug.
  if (err instanceof Error && err.name === 'CalibrationError') return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/** Attach a tag (e.g. current tab or mixing model) to future reports. */
export function setErrorContext(tag: string, value: string): void {
  if (enabled) Sentry.setTag(tag, value);
}
