# Real photos for smoke tests

`e2e/real-photos.spec.ts` runs one test per photo listed in `photos.json` in this folder. With no `photos.json`, those tests are skipped.

## What to photograph

A few photos taken with your phone, the way you'd use the app:

1. **Swatch with paper, daylight.** A strong, even swatch of a paint you know (e.g. Ultramarine), with blank paper in view.
2. **Same swatch, warm indoor light.** This checks that white balance removes the color cast.
3. **A dried test stroke of a mix**, with paper in view.
4. *(Optional)* **A swatch with no paper in view**, to check the uncalibrated path.

JPEG or PNG. Any size works (the app scales photos down to 1600 px).

## photos.json

```json
[
  {
    "file": "ultramarine-daylight.jpg",
    "paper": { "x": 0.15, "y": 0.2 },
    "color": { "x": 0.6, "y": 0.5 },
    "expectedHex": "#1f3fa8",
    "maxDeltaE": 6
  }
]
```

- `paper` / `color`: where to tap, as fractions of the photo's width and height (0 = left/top, 1 = right/bottom). Leave `paper` out for a photo with no paper; the test then taps "No white paper in photo".
- `expectedHex`: the color you expect, for example from a scan of the swatch.
- `maxDeltaE`: allowed CIEDE2000 difference (default 6, since real photos vary). Under 3 is what the app counts as a match.

Each reading is attached to its test result as a `reading` annotation, so you can tune tolerances.
