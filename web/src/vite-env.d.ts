/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry DSN (public by design). Empty disables error reporting. */
  readonly VITE_SENTRY_DSN?: string;
  /** Release identifier (git commit SHA), set by CI. */
  readonly VITE_RELEASE?: string;
  /** GoatCounter endpoint, e.g. https://<code>.goatcounter.com/count. Empty disables analytics. */
  readonly VITE_GOATCOUNTER_URL?: string;
}
