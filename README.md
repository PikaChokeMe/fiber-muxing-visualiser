# Lumen — a multiplexing playground

A local-first, static interactive prototype: editable UTF-8 messages become bit
streams, share a wavelength-multiplexed fiber, and reconstruct at the receiver.
No dependencies, backend, accounts, external fonts, or build step.

## Run locally

With Node.js installed, run `npm start` (or `node server.mjs`) in this folder,
then open http://127.0.0.1:4173. Stop the server with Ctrl+C.

Run `npm test` for simulation and color checks. Browser modules need an HTTP
server; opening index.html directly with a file URL is not supported.

## GitHub Pages

The repository root is the publishable site. Commit these files into a GitHub
repository, then use **Settings → Pages → Deploy from a branch**, select the
desired branch and **/(root)**, and save. `.nojekyll` is included. All application
assets use relative paths, so repository subpaths work. Nothing needs compiling.
The prototype has not been uploaded or published by this local setup.

## Controls

- Add unlimited editable channel rows; each message is UTF-8 encoded, MSB first.
- Enter wavelengths from 200–1600 nm. Visible defaults are 630, 460, 530 and 590 nm.
- Transmission rate: 1–4,096 bits per second **per nonempty channel**. New sessions and Restore examples default to 4; returning visitors retain their saved rate.
- Pause / Play, Step one bit interval, or explicitly Restart the demonstration.
- Sender readouts highlight the current character and its most recently transmitted bit. UTF-8 byte groups stay together for emoji and combining characters; pause and step to inspect them.
- Separate view exposes each channel inside the shared fiber. At high rates, visual samples are bounded by screen resolution; every bit is still transmitted and decoded.
- Show invisible wavelengths opts into UV/IR false colors.
- Messages, wavelength choices, speed, and view preferences persist in localStorage.
- Restore examples explicitly replaces local messages after confirmation.

## Agreed behavior

1. Channels transmit concurrently and loop independently.
2. Editing restarts that channel at its next scheduled transmission. Already
   launched pulses retain their bit, wavelength, duration, and arrival time.
3. A non-optical sequence-start marker travels with each sequence's first bit,
   including zero bits. It uses no extra transmission time.
4. Only arrival of that marker clears the receiver's confirmed text, partial byte,
   and incremental UTF-8 decoder. The binary ribbon retains recent history.
5. Confirmed characters stay stable. A provisional trailing byte is zero-filled
   for display and may flicker through ASCII, control names, and hex values.
   Multibyte UTF-8 characters wait for their complete encoding.
6. Clearing an input stops future transmission. Existing data drains; the receiver
   stays visible until a later nonempty sequence begins. Removing a channel drains
   it before removing its receiver.
7. Hidden tabs pause the simulation. Visible frame delays are processed by elapsed
   simulation time, not counted animation frames.

## Color model and deliberate simplifications

`color.js` uses bundled official CIE 1931 2° standard observer data. Each on-channel
has equal optical power. XYZ contributions are added before conversion to linear
sRGB, with fixed exposure 0.62. Negative primaries are clipped to zero. If the
largest positive primary exceeds 1, all positive components share a common scale.
Finally sRGB transfer encoding produces the display color. This display mapping
loses spectral colors outside sRGB; it is not an exact spectral reproduction.
Decorative glow does not change the underlying sum.

The shared beam is sampled over emission history, so different positions really
represent different transmitted times. The midpoint swatch reads that same model.
There is an illustrative four-second transit delay with no modeled attenuation,
dispersion, noise, carrier oscillation, or real-world distance. MUX input/output
branches are schematic; the shared fiber owns the transmission delay. Channel
separation is ideal. Duplicate wavelengths are flagged but remain independently
identified for the demonstration. False color changes display only, not bit data.

Color data and its JS format conversion: CIE (2019), CC BY-SA 4.0.
See [data attribution](data/README.md). The in-app explanation includes the source.

## Files

- `simulation.js` — deterministic clock, immutable emitted symbols, receiver state.
- `sender.js` — displayed characters mapped to their UTF-8 bits and sender position.
- `color.js` and `data/` — spectral data and color conversion.
- `app.js` — editable controls and Canvas visualization.
- `index.html`, `style.css` — layout and presentation.
- `tests/` — decoding, causality, timing, loop and color checks.
- `server.mjs` — loopback-only local preview server.
