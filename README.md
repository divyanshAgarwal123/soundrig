# SoundRig Studio
Turn short game recordings into an editable, tested, portable sound kit. Meta Muse Glimmer configures sound behavior; deterministic code validates it and runs the audio. No model runs during gameplay.

## Run locally
Requires Python 3.10+ and Node (tested on Node 25.9/macOS arm64). No npm install or Python third-party package is required for the app or checks.

```sh
python3 server.py
```
Open http://127.0.0.1:8772/ then Studio → Load working example → Enable audio. The example includes actual Kenney CC0 imports and saved Meta edits. Import your own PCM16 WAVs, choose Classic or Studio playback, run saved gameplay checks and export.

Fresh authoring separately requires Ollama with `muse-glimmer:30b-mlx` available at 127.0.0.1:11434. This is roughly 19 GB of model weights. Saved examples, manual edits, playback and exports work without it. Hosted Meta credits are not used by this local path.

## Keep the result
- Game-ready WAV kit:11 static 48 kHz PCM16 cues, a Phaser audio sprite, source declarations, editable project, Phaser 3.90 consumer and font/licenses (24 files). Four setup steps are in guide.html and the kit README. Other engines need manual WAV import/wiring.
- Godot destination adds a fixed-path native adapter, cue scene and verifier (31 files total). It is static one-shot delivery, excluding wind/cadence/live ducking. Forward your game events; see GODOT_README.md in that kit. Godot 4.7.2 was tested under Dummy audio.
- Integration + checks: live component, raw-state adapter, editable project, saved scenarios, plain JavaScript runner and `node verify.mjs` (17 files). Exported runtime needs no model/authoring endpoint.
- Runnable project: simple live runner without saved-contract tooling (12 files).

Static cues do not reproduce dynamic wind, cadence, changing controls or cue-focus ducking. Takes may match when no variation is authored. Original WAV data and declarations travel in exports; declarations are not ownership verification.

## Verify
For a fresh checkout on macOS or Linux, this starts and stops its own offline server in a temporary source copy. Port 8772 must be free. Private history and Qodo credentials are excluded; the original source tree is left untouched. No fresh inference is performed.

```sh
python3 ci/test_check.py
python3 ci/check.py
```

The latest `.qa-output/latest/receipt.json` points to a unique run directory containing its receipts and logs. Earlier runs are preserved separately, so a failed rerun cannot reuse an older PASS. A failure or timeout returns nonzero. GitHub Actions runs the same suite on Ubuntu with Python 3.10 and Node 22, plus a separate official Godot 4.7.2 native job; the engine archive and Actions are pinned. Passing native Dummy audio checks does not establish listening quality.

Alternatively, with this studio server already running:

```sh
python3 run_checks.py
```
The suites listed in `run_checks.py` cover revision persistence, safe restore, portable-import boundaries, actual browser-session roundtrips, legacy compatibility, authoring failure/recovery, project inputs/staging, gameplay contracts, exports, local HTTP boundaries, Studio DSP, maximum validator workload, landing playback lifecycle, recording-preview races, checked cue edits/undo and sealed actual browser-downloaded artifacts. No new model call is made by this command. `evidence/final-checks.json` is the aggregate receipt.

For actual native-engine checks, supply an official Godot binary: `python3 verify-godot.py --godot /absolute/path/to/Godot`. Add `--archive fixtures/practical-godot-revision2.zip` to check the sealed browser download. The engine is not bundled. A separate existing-game integration proof is included in the practical source package, with its own upstream credits and test instructions.

Recording import now starts with Preview, then an explicit Use/Discard decision. Enabled saved checks protect recording replacements and direct event-cue edits. The original recording is retained; preview level matching is separate from actual-mix audition. `PRACTICAL_REVIEW.md` records the latest research, evidence, score and remaining user/listener gaps. Earlier Studio reports are historical snapshots.

`STUDIO_VERIFICATION.md` distinguishes automated checks, actual browser/model actions and unproven customer/listener benefits. Earlier VERIFICATION/WORKFLOW files and frozen export fixtures are historical baseline evidence. This directory is the new Studio build; project/8771 remains separate.

## Main files
`studio-dsp.mjs` is the optional renderer transform; classic core/player/samples/worklet files remain unchanged. `project-runtime.mjs` builds a project-specific runtime shared by checker, worklet and export. `delivery.py`/`delivery-cli.mjs` create fixed-path sound packs. `project_api.py` packages live exports. `index.html`, `site.css`, `studio.html`, `studio.css`, `landing.mjs` and `guide.html` implement the new website. `prepare_display_font.py` optionally reproduces the OFL derivative using FontTools; the prepared font is included and the app does not require FontTools.

The development server binds to loopback, restricts static files and excludes raw authoring journals. Use this local prototype within its documented input limits; public multi-user hosting is a separate deployment task. See THIRD_PARTY_NOTICES.md for source and asset credits.

The final source ZIP opens into `SoundRig/`. Run the commands above from that folder. SOURCE_MANIFEST.json lists the included file hashes; repeated generated exports, caches and the full development screenshot matrix are excluded. Tests retain the frozen browser artifacts they require and generate new outputs locally. The final archive and its separate extraction-verification receipt are in the original workspace's output folder.

## Studio and game refinement

`UI_UX_REVIEW.md` records the current 26-suite build, responsive inspection and actual keyboard completion of Pressing Room Run. The studio groups Cues, Recordings, Revisions, Meta edit and Delivery into keyboard-accessible tabs. Diagnostics remain available through disclosures; saved checks sit below the workspace. `game-controls.mjs` adds one-press jump buffering and coyote time; `studio-ux.mjs` changes presentation only. Earlier sealed source archives remain historical.

## Saved revision history

Use Revisions → give the current kit a name → Save checkpoint. Inspect shows exact differences before Restore. Restore first saves your current work, preserves enabled current checks and always marks restored results UNCHECKED. Rerun checks and re-export afterward. If protection is off, stored definitions/protection are restored instead. Portable download/import carries originals and source notes; import does not activate a version.

History is local to `.soundrig-revisions/history.sqlite3`, private and excluded from static serving/source packages. It is explicit saving, not autosave or cloud sync. Capacity is24 checkpoints/48 MiB serialized snapshots with no automatic eviction; SQLite/temp overhead is extra. A full history refuses save/restore. Eight runtime sound/mix loads per page remain enforced. Do not delete that private directory to update source.

`REVISION_REVIEW.md` is the latest rubric assessment; `REVISION_VERIFICATION.md` separates actual browser/model/native evidence from automated failure tests and unproven human benefits. Earlier review files retain their historical scores and counts.
