# Audible transport repair — 2026-09-08

Classification: **INCREMENTAL**. Evidence: **EMPIRICAL**. Local implementation and
verification are complete; independent review is accepted for code revision
`904f92474a69c81346c3de7129e42402bca1f3d2`. GitHub source publication is
complete; Site publication remains open.

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
- Browser lifecycle pass at `http://localhost:48103/`: a live pass changed Play to
  Stop; Mute and Unmute worked while it was running; importing the exported JSON
  during playback returned the transport to idle and reported “Imported portable
  project.”; and Panic returned idle with “Panic cleared the audio graph.” Browser
  console warnings and errors were empty.
- Portable/native artifacts from the same browser pass were written locally. The
  native open handoff completed for the MIDI file in FL Studio 21 and the WAV
  file in Preview; both apps were running afterward. This verifies native app
  launch handoff only, not DAW ingestion, track rendering, or audible native-app
  playback. JSON import restored the Night Transit project and deterministic
  seed; MIDI was recognized as a 1-track format-0 Standard MIDI file (1,501
  bytes); WAV was recognized as RIFF PCM, mono, 44.1 kHz, 16-bit (3,105,846
  bytes; 35.213175 seconds).
- Responsive pass used the temporary narrow viewport `480 × 844` CSS pixels. The
  controls and pattern surface remained rendered; the 64-step timing grid keeps
  its intended horizontal scroll surface at that width. The normal viewport was
  restored afterward (`2560 × 1440`, no document overflow).
- A browser permission-pending state was not reproducible in this harness because
  `AudioContext.resume()` settled immediately; cancellation is covered by the
  playback regression suite and independent source review. Likewise, the
  in-app-browser tab stayed `visible` when a second tab was opened, so true
  `visibilitychange` suspension/recovery was not claimed from this pass.

To repeat the browser probe, transpile `lib/playback.ts` using the repository's
TypeScript `transpileModule` with ES2022 module/target, save as `playback.mjs` in a
temporary directory, copy `scripts/playback-browser.html` there as `index.html`,
serve that directory on loopback, and press **Run audio check**. This tests the
production scheduling module; the probe and temporary output are not client assets.

## Release limits and next check

The dedicated independent source review accepted the exact code revision
`904f92474a69c81346c3de7129e42402bca1f3d2`, with independent lifecycle probes.
The Sites read for the exact `.openai/hosting.json` project ID also returned
`SitesConnectorError: Sites project not found` on 2026-09-08. No hosting ID was
changed, saved version or Site deployment was attempted. GitHub source
publication was completed on branch `codex/audible-transport-repair-20260908`;
the local and remote branch heads were verified equal at
`252c9b626d8ae5241e2f77bccb5124f1dea2f25d`.

Before release: actual device listening and suspension/recovery, pending-permission
cancellation in a browser, and deployed HTTPS recheck remain open. The offline
waveform measurement does not establish hardware latency, background performance,
Safari compatibility, or a deployed-site result. Broader producer handoff
validation remains governed by the product roadmap.
