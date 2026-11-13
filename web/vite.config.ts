import { defineConfig } from 'vite';

// In CI (when the SENTRY_AUTH_TOKEN secret is set) the build emits hidden
// source maps; the deploy workflow then runs sentry-cli to inject debug IDs,
// upload the maps to Sentry, and delete them before publishing. Local builds
// emit no maps.
const uploadingSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default defineConfig({
  // Relative asset paths so the build works under any sub-path,
  // e.g. https://<user>.github.io/<repo>/ on GitHub Pages.
  base: './',
  build: {
    sourcemap: uploadingSourceMaps ? 'hidden' : false,
  },
});
