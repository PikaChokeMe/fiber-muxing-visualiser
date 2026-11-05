# Prototype verification — 2026-11-05

## Automated

15 checks pass using Node's test runner. This environment requires running tests
in-process: `node --test --test-isolation=none tests/*.test.mjs`.
The regular `npm test` command works in environments allowing child processes.

Coverage includes the CIE source checksum, nearby-wavelength interpolation,
additive mixing, explicit invisible-light handling, MSB-first UTF-8 encoding,
provisional @ → H, delayed confirmation, edits preserving launched symbols,
arrival-only sequence resets, rapid edits, independent loops, incremental Unicode,
decoder reset during a partial emoji, speed changes, deletion with draining,
frame-size independence, retained-history bounds, and position-dependent signals.

## Browser

Checked in the in-app Chromium browser:

- Default three editable message channels and wavelength swatches.
- Pause, single-bit stepping, restart, speed control, and 256 bit/s playback.
- At 1 bit/s: @ after three received bits, H confirmed after eight.
- Edited H/emoji stream into é: old partial emoji bits continued arriving; the
  new first bit reset the receiver, and é decoded correctly after both bytes.
- Added a channel without disturbing existing text; entered an emoji and 1550 nm.
- Expanded component lanes and enabled the explicitly marked false-color view.
- Reload restored edited messages and preferences from browser storage.
- Narrow viewport (390 px requested, 375 px content with scrollbar): no horizontal
  overflow; controls and diagram stack above the message panels.
- Replaced native reset confirmation with an in-page modal after the preview
  browser stalled on the native dialog. Verified the replacement confirmation.
- Restored the three original examples and left playback running at 1 bit/s.
- No app warnings/errors observed during the final fast-playback check.

Desktop screenshot: `output/lumen-desktop.jpg` (ignored generated artifact).

## Limits

This is an idealized demonstration, not an optical link engineering simulator.
Color gamut mapping, false-color conventions, and framing metadata are explained
in the application and README. GitHub Pages compatibility is prepared through
relative static assets and `.nojekyll`; a live GitHub Pages deployment has not
been performed. Mobile checks used a resized browser viewport, not a physical phone.
