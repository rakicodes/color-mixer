import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import { defineConfig } from 'vite';

// Set in CI from the SENTRY_AUTH_TOKEN GitHub secret. Without it (e.g. local
// builds), source maps are not uploaded and the build still succeeds.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
  // Relative asset paths so the build works under any sub-path,
  // e.g. https://<user>.github.io/<repo>/ on GitHub Pages.
  base: './',
  build: {
    // Only when uploading: 'hidden' maps go to Sentry and are then deleted.
    sourcemap: sentryAuthToken ? 'hidden' : false,
  },
  plugins: [
    // Must stay last in the plugins array.
    sentryAuthToken
      ? sentryVitePlugin({
          org: 'rakicodes',
          project: 'color-mixer',
          authToken: sentryAuthToken,
          release: { name: process.env.VITE_RELEASE },
          sourcemaps: {
            // Upload to Sentry, then remove so the maps aren't published on the site.
            filesToDeleteAfterUpload: ['./dist/**/*.map'],
          },
        })
      : null,
  ],
});
