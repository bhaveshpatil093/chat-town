# Asset credits and licenses

## Town tiles and scenery

- **Tiny Town 1.1** by Kenney: `public/assets/kenney-tiny-town/tilemap_packed.png`.
- The pack uses 16×16 pixel tiles in a 12×11 atlas.
- **License: Creative Commons Zero 1.0 (CC0 1.0).** The art may be used, modified, and redistributed without permission or attribution. The included [license copy](../public/assets/kenney-tiny-town/LICENSE.txt) records the pack's original terms. Kenney's [Tiny Town asset page](https://kenney.nl/assets/tiny-town) is the source.

## Audio credits

Chat Town's sound effects and ambient bed are original sounds synthesized at runtime with the Web Audio API in `public/overlay.html`.

- Ambient town loop: generated filtered noise and soft oscillator tones.
- Raid horn: synthesized oscillator and filter envelope.
- Firework pops: generated noise bursts through a band-pass filter.
- Coin sounds and level-up chime: synthesized oscillator tones.

No third-party audio recordings, samples, or sound libraries are used.

## Runtime library

PixiJS is loaded from jsDelivr by `public/overlay.html` and is distributed under the MIT License. See the [PixiJS license](https://github.com/pixijs/pixijs/blob/dev/LICENSE).
