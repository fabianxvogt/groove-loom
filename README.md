# Groove Loom

Groove Loom is a browser-first percussion instrument for expressive timing. It gives six synthetic drum voices a 64-step pattern surface, per-step velocity/probability/microtiming, swing, fills, deterministic seeds, variation chains, an event inspector, and local MIDI/WAV/JSON export.

## Try it locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vinext. Press **play** once to unlock browser audio. All synthesis, scheduling, persistence, and export stay on the device.

## Project boundaries

- Six procedural voices: kick, snare, closed hat, clap, perc, tom.
- Four-bar default chain built from four editable 64-step variations.
- Browser limits: JSON imports are capped at 500 KB; export is bounded by the current chain length.
- Background tabs are not assumed reliable. Visibility changes stop the transport and expose an explicit recovery action.
- Web MIDI hardware input is intentionally out of scope for v1; MIDI file export is included.

## Verification

```sh
npm run lint
npm run build
```

The browser journey covers fresh start, audio activation, step editing, local save/reload, portable JSON, malformed import rejection, and MIDI/WAV export. Desktop Chrome was exercised during implementation; Safari is untested.

## License

Original source is MIT licensed. See [LICENSE](./LICENSE).
