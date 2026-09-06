# Groove Loom roadmap

State: verification / responsive follow-up

## Now

- Recheck the narrow-mobile transport status after the responsive wrapping patch.
- Finish serialized desktop and narrow-mobile browser QA, including the documented grid scroll.
- Confirm static export archive contains only the public client output.

## Next

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
- Long-chain timing, swing-tick export, zero-probability exclusion, checksum sensitivity, and JSON round-trip regressions passing in the focused timing suite.
- Live transport exposes measured audio-clock drift and peak drift against the wall clock; this is a device/session diagnostic, not a hardware-latency claim.
- Transport status layout now allows the narrow-mobile message to shrink and wrap without changing scheduling or export behavior; a fresh 390px browser recheck remains open.
