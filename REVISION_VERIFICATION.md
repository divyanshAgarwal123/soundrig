# Revision workflow verification

## Reproduce

From the extracted SoundRig directory, run `python3 server.py`, then `python3 run_checks.py` in a second terminal. The runner contains 30 suites and makes no fresh model call. Its aggregate receipt is `evidence/final-checks.json`. The separate archive verification receipt beside the ZIP is authoritative for the fresh-extraction run; it is outside the immutable ZIP to avoid a self-hash dependency.

Native engine checks require an official binary: `python3 verify-godot.py --godot /absolute/path/to/Godot --archive fixtures/revision-browser-godot.zip`. Godot 4.7.2 is the executed version. It is not bundled. Run the credited existing-game proof using its README under `integration-proof/godot-platformer` in the source archive.

## Automated boundary and failure evidence

- `test-revision-store.py`: 15 cases including real snapshot validation, restart, private permissions, metadata-only listing, count/byte quotas without eviction, concurrent insertion, injected write failure, interrupted SQLite transaction, checksum corruption, invalid IDs/labels, malformed/deep/oversize input, symlinks and a large valid snapshot. Tests use isolated temporary databases and do not delete live history.
- `test-revision-activation.mjs`: 14 cases covering snapshot/diff checks, real ProjectLoader candidate disposal/backup/commit/cleanup ordering, old active player preservation and stale asynchronous project/check/trace/baseline reads. Audio objects are test doubles; actual audio lifecycle is a separate browser observation.
- `test-revision-api.py`: 6 cases for origin/header enforcement, private files404, public module delivery, malformed/deep/oversize requests, metadata/model-call counters and injected local revision verification timeout messaging.
- `test-revision-e2e.py`: actual portable browser snapshot reopened through isolated SQLite; original WAV/source notes exact; regenerated and downloaded workflow verifiers both pass all 4 cases with identical component hash; actual browser Phaser/Godot ZIPs pass integrity checks.
- Existing recording-apply checks now cover rejected quality/cue-focus UI reset and material/project/rig/player rollback on injected synchronous commit failure. Existing 26 suites still cover DSP, authoring failure, worklet/runtime, exports, input/race guards, landing and studio/game controls.

## Actual browser and model evidence

`evidence/revision-browser-observations.json` records the root-operated end-to-end path and explicit unverified items. A real WAV was previewed in both comparison modes and applied. An impossible current check refused restore, preserving gain/history; successful recovery, current-protection ON/OFF rules, UNCHECKED state, portable import, project reopen, eight-load limit and invalid files were exercised. Remove was cancelled; live history was not deleted. Ten saved IDs survived an actual source-server restart. Later test checkpoints add to that count.

A fresh actual local `muse-glimmer:30b-mlx` patch took 45.365 seconds (`evidence/revision-fresh-meta.json`, `patch-9363f96f2442.json`). It changed pickup gain to0.30 after three checks passed, retained four locked layers and original WAV data. It was one accepted request, not a broad prompt-success benchmark. Compile 0 / patch 1 / upstream 1 counters were captured before server restart; reset counters are not lifetime totals. No hosted API credits were used by this local path.

A six-second native-keyboard run captured 19 commands. Independent game outcomes were 0 landings, 3 pickups, 1 damage. That run joined three existing checks; all 4 passed with browser/export PCM matching. The final actual downloads are `fixtures/revision-browser-workflow.zip`, `revision-browser-phaser.zip` (24 files), `revision-browser-godot.zip` (31 files) and portable `revision-browser-session.json`. `revision-e2e.json` preserves exported component hashes. Pressing Room's prior 8/8 completion remains earlier UI evidence; this pass did not repeat that full route.

The latest Godot download was inserted into the credited official platformer without changing its game integration script. Three actual physics-overlap coin signals produced three SoundRig starts with a twelve-voice pool. `revision-native-game.json` records this under Dummy audio. This is native integration evidence, not a human listening result. Fresh extraction repeats both the seven native kit cases and that existing-game proof.

1280×800 and390×844 views had no horizontal document overflow; five 46px tabs fit, Inspect focused the selected heading and Restore was reachable. Screenshots: `revision-workspace-desktop.png`, `revision-history-desktop.png`, `revision-history-phone.png`. Viewport overrides were reset. Inspected console logs had no errors. Initial disabled tab controls now enable only once their listeners are installed.

One inspection attempt timed out at the existing 15-second subprocess budget and preserved the active session. Retry succeeded; a later direct validated load took 3.79 seconds on that host. Its misleading generic Meta error was replaced with a specific local verification timeout and covered by an injected handler test. The UI still relies on explicit retry; low-latency performance on every machine is unproven.

## Storage measurements

`revision-storage-performance.json`: 24 prevalidated checkpoints, 4,358,160 logical bytes, 4,386,816 physical DB bytes; insertion of 24 took 0.071 seconds; metadata median 0.224ms. This measures storage, not full repeated validation.

`revision-large-performance.json`: 3,102,172-byte synthetic stereo/eight-slot snapshot; actual validated save 0.572s/load 0.562s in that run. Sixteen prevalidated records reached 49,634,752 logical bytes and 49,704,960 physical DB bytes; metadata 0.224ms. Process high-water RSS was 143,753,216 bytes on macOS. These bounded synthetic timings are not browser incremental heap, general performance guarantees or developer time savings. Validation stays 15s per subprocess and runtime activations eight per page.

## Design and external boundaries

One static Impeccable scan is preserved in `revision-design-detector.json`: 26 findings, including 7 primary style/layout/copy warnings and 19 type-ramp advisories. Warm cream is the user's approved direction. Existing workflow border/overflow warnings were judged against rendered layouts; no custom escaping menu was added. White native inputs/sage accents and the historical design sidecar explain token warnings; the scan is not a clean-design certificate. No detector ignore was added and no score-chasing loop was run.

No outside developer adoption, comparative task time, listening preference, physical-device touch/audio, full nonvisual canvas access, public repository or final video/submission is claimed. Private `.soundrig-revisions` contents must never enter the source archive.
