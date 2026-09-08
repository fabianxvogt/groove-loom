<!-- portfolio
{
  "title": "Groove Loom",
  "topic": "Music/Sound & rhythm",
  "type": "product",
  "description": "Compose percussion patterns in a browser sequencer.",
  "demo": "https://groove-loom.fabian523417.chatgpt.site"
}
-->

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
- The shared event timeline uses a documented 24-tick pre-roll, so the full -24…+24 tick microtiming range survives live playback, MIDI, and WAV export without clamping.
- Swing is converted into the same 120-tick MIDI grid used by the live/WAV event list; the transport reports measured audio-clock drift against the wall clock while running.

## Verification

```sh
npm run lint
npm run build
npm run test:timing
npm run test:hydration
```

The browser journey covers fresh start, audio activation, step editing, local save/reload, portable JSON, malformed import rejection, and MIDI/WAV export. Desktop Chrome was exercised during implementation; Safari is untested.

## License

Original source is MIT licensed. See [LICENSE](./LICENSE).
