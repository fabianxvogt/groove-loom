# Groove Loom roadmap

State: verification

## Now

- Finish serialized desktop and narrow-mobile browser QA.
- Independent review of the exact source commit before publication or hosting deployment.
- Confirm static export archive contains only the public client output.

## Next

- Improve measured audio-clock drift reporting on long chains.
- Add a small documented preset library without changing the core schedule contract.
- Re-test deployed HTTPS audio and file downloads after release approval.

## Later

- Optional Web MIDI output after a separate browser-compatibility review.
- Optional AudioWorklet voice engine if measurements show main-thread scheduling is insufficient.

## Done

- Six procedural voices, 64-step editable patterns, four variations, chain editing, fills, swing, deterministic probability seed.
- Shared scheduled event list drives playback, event inspector, MIDI export, and WAV export.
- Local save, versioned JSON import/export, malformed/oversized input errors, panic, mute, and suspension recovery.
- Focused lint and production build passing at the implementation checkpoint.
