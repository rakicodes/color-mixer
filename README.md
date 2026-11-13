# Watercolor Mixer

Tells you which of your paints to add, and how much water, to reach a target color.

1. **Paints**: add the paints you own (photograph a swatch, or enter a hex code).
2. **Target**: choose the color you want.
3. **Mix**: photograph a test stroke of your mix. The app suggests one step, e.g. "Add a touch of Ultramarine and some water." Repeat until it says you're close enough (CIEDE2000 difference under 3).

Every photo is white-balanced: first tap blank white paper, then tap the color.

## Layout

- `core/`: platform-independent TypeScript (no DOM), reusable in a phone app.
  - `sample.ts`: averages the pixels around a tap point (trimmed mean)
  - `calibrate.ts`: white balance against the paper sample
  - `mix.ts`: `MixModel` interface. The current model is a simple OKLab blend; Kubelka-Munk can be dropped in here.
  - `water.ts`: dilution toward paper white
  - `solver.ts`: searches paint and water amounts, then maps them to none / a touch / some / a lot
  - `storage.ts`: `KeyValueStore` interface plus palette and session repos (async, so AsyncStorage works too)
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

- An OKLab blend doesn't mix like real pigment. Blue + yellow comes out grayish instead of green, so suggestions are least reliable for mixes of very different hues.
- Each suggestion adds one paint at a time.
