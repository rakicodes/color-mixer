import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works under any sub-path,
  // e.g. https://<user>.github.io/<repo>/ on GitHub Pages.
  base: './',
});
