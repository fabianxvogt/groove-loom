# Groove Loom roadmap

State: transport repair verified locally / independent review and hosting access pending

## Now

- Review the [audible transport repair](docs/transport-repair.md) independently, resolve the saved Site lookup failure, then verify and publish the exact reviewed source. Current/future voice cancellation, live Mute/Unmute and deferred-start cancellation pass local tests.

- Recheck the public v2 page for the app-origin React hydration error after the deterministic bootstrap fix.
- Finish serialized desktop and narrow-mobile browser QA, including the documented grid scroll.

## Next

- Add a small documented preset library without changing the core schedule contract.
- Re-test deployed HTTPS audio and file downloads after release approval.

## Later

- Optional Web MIDI output after a separate browser-compatibility review.
- Optional AudioWorklet voice engine if measurements show main-thread scheduling is insufficient.

## Done

- 2026-09-08: repaired Stop/Mute ownership of scheduled voices, pending audio cancellation and teardown. Completion/playhead use the audio clock. Eight lifecycle tests, timing/hydration regressions, lint, typecheck and production build pass; a browser render measured exact silence during Mute and after Stop. This repair has not been published.

- Six procedural voices, 64-step editable patterns, four variations, chain editing, fills, swing, deterministic probability seed.
- Shared scheduled event list drives playback, event inspector, MIDI export, and WAV export.
- Local save, versioned JSON import/export, malformed/oversized input errors, panic, mute, and suspension recovery.
- Focused lint and production build passing at the implementation checkpoint.
- Long-chain timing, swing-tick export, zero-probability exclusion, checksum sensitivity, and JSON round-trip regressions passing in the focused timing suite.
- Live transport exposes measured audio-clock drift and peak drift against the wall clock; this is a device/session diagnostic, not a hardware-latency claim.
- Static public preview deployed at the existing Groove Loom Site version 2 from source `031a750f8cd9f9f137df13366a7e8222253b231f`; the archive contains only public client output.
- Transport status layout now allows the narrow-mobile message to shrink and wrap without changing scheduling or export behavior; the fresh 390px browser recheck follows the new public version.
- Hydration bootstrap now renders the deterministic default project first and restores local saved state in a mount effect; the focused source regression passes, while browser confirmation remains open.
