# Audible transport repair — 2026-09-08

Classification: **INCREMENTAL**. Evidence: **EMPIRICAL**. Local implementation and
verification are complete; independent review and publication remain open.

## Defect and change

Baseline `904c0306f724aaeaa9c7911bb1bfad522880b3db` cleared display timers on Stop,
but retained scheduled Web Audio sources. Mute was checked only when constructing
voices. Executing the original handlers with a recording audio fixture reproduced
a future kick still connected and scheduled until 50.42 seconds after Mute and Stop.

[Playback ownership](../lib/playback.ts) gives each pass one output gain and owns
its current/future sources. Stop disconnects and cancels them; Mute and Unmute
change the running pass without dropping future hits. Ended voices release their
nodes, and partial scheduling failure cleans up already allocated nodes.

[The page](../app/page.tsx) uses the same cancellation path for Stop, successful
import, panic, tab suspension and unmount. A generation check prevents a delayed
audio resume from playing after cancellation or replacing a newer pass. Starting
audio exposes a Cancel control. Completion and the playhead follow the audio clock;
wall-clock drift remains a diagnostic. The existing voice formulas, event schedule,
JSON format and MIDI/WAV exports are preserved.

## Verification

- `npm run test:playback`: eight passing lifecycle tests, covering all scheduled
  sources, live mute/unmute, ended-node cleanup, partial failure, canceled resume,
  superseded starts, failed resume/retry, and mute changes during resume.
- `npm run test:timing` and `npm run test:hydration`: pass.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`: pass. Build emits the existing
  Node module-registration deprecation warning; no build failure.
- [Browser render probe](../scripts/playback-browser.html): real OfflineAudioContext,
  24 kHz mono, 2.4 seconds, with mute/unmute/stop during rendering and a hit after
  Stop. RMS before mute and after unmute: `0.04861312701734448`; muted and post-Stop
  samples: exactly zero. Chrome 152 in the Codex browser on macOS.
- Built static page at localhost: Play changes to Stop, Mute toggles its pressed
  state, Unmute restores the control, and Stop returns to idle with its message.
  The final build also returned to “Loop complete” after a natural pass; its
  displayed final clock drift was -21.5 ms (one session, not a performance bound).

To repeat the browser probe, transpile `lib/playback.ts` using the repository's
TypeScript `transpileModule` with ES2022 module/target, save as `playback.mjs` in a
temporary directory, copy `scripts/playback-browser.html` there as `index.html`,
serve that directory on loopback, and press **Run audio check**. This tests the
production scheduling module; the probe and temporary output are not client assets.

## Release limits and next check

Independent source review through the configured Luna L1 route is pending because
this Codex session has no `l1_session` tool. No substitute workers were launched.
The Sites read for the exact `.openai/hosting.json` project ID also returned
`SitesConnectorError: Sites project not found` on 2026-09-08. No hosting ID was
changed and no source push, saved version or deployment was attempted.

Before release: independent review, actual device listening and suspension/recovery,
pending-permission cancellation in a browser, narrow viewport, and deployed HTTPS
recheck. The offline waveform measurement does not establish hardware latency,
background performance, Safari compatibility, or independent acceptance. Broader
producer handoff validation remains governed by the product roadmap.
