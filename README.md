# Watercolor Mixer

Tells you which of your paints to add, and how much water, to reach a target color.

1. **Paints**: add the paints you own (photograph a swatch, or enter a hex code).
2. **Target**: choose the color you want.
3. **Mix**: photograph a test stroke of your mix. The app suggests one step, e.g. "Add a touch of Ultramarine and some water." Repeat until it says you're close enough (CIEDE2000 difference under 3).

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
  - `solver.ts`: searches paint and water amounts, then maps them to none / a touch / some / a lot
  - `storage.ts`: `KeyValueStore` interface plus palette, session and settings repos (async, so AsyncStorage works too)
- `web/`: Vite + TypeScript UI, canvas picker, localStorage.

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
- Each suggestion adds one paint at a time.
