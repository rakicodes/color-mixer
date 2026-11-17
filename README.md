# Watercolor Mixer

Tells you which of your paints to add, and how much water, to reach a target color.

1. **Paints**: add the paints you own (photograph a swatch, or enter a hex code).
2. **Target**: choose the color you want.
3. **Mix**: before your first photo, the app suggests a starting mix, e.g. "3 parts Ultramarine and 1 part Hansa Yellow, as a medium wash." Then photograph a test stroke of your mix. The app plans up to 3 paints plus water and tells you to add them together in one step, e.g. "Add some Quinacridone Rose, a touch of Ultramarine and some water." Repeat until it says you're close enough (CIEDE2000 difference under 3); each new photo is planned again from the real result.

Every photo is white-balanced: first tap blank white paper, then tap the color.

## Mixing models

Choose one under **Mixing model** on the Mix tab. Switching recalculates the latest suggestion, so you can compare models on the same reading.

| Model | How it works | Best for |
|---|---|---|
| Simple blend (OKLab) | Averages colors in OKLab; water fades toward white | Small adjustments within one hue. Default. Blue + yellow comes out gray |
| Transparent glaze (RGB) | Beer-Lambert per linear-RGB channel: paint absorbs light over white paper | Transparent paints; fast. Blue + yellow makes green, a bit dull |
| Transparent glaze (spectral) | Beer-Lambert over 38 wavelengths (380–750 nm) | Most transparent watercolors; most realistic hues |
| Opaque paint (Kubelka-Munk) | Single-constant K-M (absorption/scattering) over 38 wavelengths | Opaque paints (cadmiums, gouache). Treats every paint as opaque |

The spectral models estimate a spectrum from each RGB reading (the spectral.js method; tables in `core/src/spectral/data.ts`, MIT). Two paints that look identical will therefore mix identically, even if their pigments differ.

## Layout

- `core/`: platform-independent TypeScript (no DOM), reusable in a phone app.
  - `sample.ts`: averages the pixels around a tap point (trimmed mean)
  - `calibrate.ts`: white balance against the paper sample
  - `mix.ts`: `MixModel` interface (encode → mix / dilute → decode) and the OKLab blend
  - `models/`: Beer-Lambert (RGB and spectral) and Kubelka-Munk models, plus the `MIX_MODELS` registry
  - `spectral/`: RGB ↔ spectrum conversion and data tables from spectral.js (MIT)
  - `recipe.ts`: optimizer for whole recipes (up to 3 paints plus water), from scratch (parts ratio) or from the current mix (one combined step)
  - `solver.ts`: one-step search (one paint and/or water), used when the recipe is done or stuck; maps amounts to none / a touch / some / a lot
  - `storage.ts`: `KeyValueStore` interface plus palette, session and settings repos (async, so AsyncStorage works too)
- `web/`: Vite + TypeScript UI, canvas picker, localStorage.

## Error reporting

Errors are reported to Sentry (project `rakicodes/color-mixer`), set up in `web/src/errors.ts`.

- **Sent:** error message, stack trace, browser, release (git commit), and the current `tab` and `mixModel`.
- **Never sent:** photos (they stay in a canvas in your browser), user info, or saved paints.
- **Skipped:** expected guidance such as "tap the paper again" (`CalibrationError`).
- **Readable stack traces:** in CI, when the `SENTRY_AUTH_TOKEN` GitHub secret is set, `sentry-cli` injects debug IDs into the built files and uploads their source maps. The maps are then deleted from the published site.
- **Turning it off:** set `VITE_SENTRY_DSN=` (empty) in `web/.env`.

## Usage analytics

Anonymous usage counts go to [GoatCounter](https://www.goatcounter.com), set up in `web/src/analytics.ts`. GoatCounter uses no cookies, so no consent banner is needed.

- **Sent:** the tab name on each tab view (`paints`, `target`, `mix`) and a few action names: `paint-added`, `paint-from-photo`, `target-from-photo`, `mix-started`, `mix-checked`, `mix-cleared`, `model-<id>`. GoatCounter also records the referrer, browser, screen size and country of each visit.
- **Never sent:** colors, paint names, photos, or user info.
- **Only counted:** in production builds, and not on localhost.
- **Turning it on or off:** set `VITE_GOATCOUNTER_URL=https://<code>.goatcounter.com/count` in `web/.env`, or leave it empty to turn analytics off.

## Scripts

```sh
npm install
npm run dev        # http://localhost:5173, also on your LAN (open it on your phone)
npm test           # core unit tests (vitest)
npm run typecheck
npm run build
```

## Known limitations

- The default OKLab blend doesn't mix like real pigment. Pick a glaze or Kubelka-Munk model for mixes of very different hues.
- Spectra are estimated from RGB, not measured, and every paint is treated as equally strong (no tinting-strength factor).
- Recipes use at most 3 paints, and one step adds at most half the puddle in new paint, so big corrections can take a few photos.
