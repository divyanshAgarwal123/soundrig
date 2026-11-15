# Practical upgrade verification — November 4, 2026

Read `PRACTICAL_REVIEW.md` for the assessment and limits. Earlier Studio reports are historical snapshots. This pass adds recording inspection, protected replacement, precise cue edits and static Godot delivery without changing the preparation algorithm.

## Reproduce the 25-suite check

Use Python 3 and Node.js. From the extracted `SoundRig` folder start `python3 server.py`, then in another terminal run `python3 run_checks.py`. That copy must own port 8772. Results are written to `evidence/final-checks.json`. No model/API credit is required. VM tests use explicit DOM/network fixtures where stated; these are not all browser tests.

## Reproduce the seven native engine cases

```sh
python3 verify-godot.py --godot /absolute/path/to/godot --archive fixtures/practical-godot-revision2.zip
```

The run used official Godot `4.7.2.stable.official.ed1daf0bf` on macOS. The official download archive SHA256 was `c58a24e31d720be9d62f60cb5627c4e695fb72f21b0cfe1bc9ccaa9a3b3ba63e`; see the [official release](https://github.com/godotengine/godot/releases/tag/4.7.2-stable). Template bytes are checked before executing kit scripts.

Seven cases passed: native kit, relocated kit, native scene, altered hash, truncated WAV, oversized WAV and malformed manifest. Positive runs loaded eleven cues, started 34 events and reused twelve players, then stopped/freed without engine warnings. Dummy audio proves engine behavior, not speaker quality. Receipt: `evidence/practical-godot-engine.json`.

The final browser-downloaded 31-file kit is `fixtures/practical-godot-revision2.zip`, SHA256 `2c98d216a6fe3f69a2f9fe8970a4b5ad10f203465b061ddad37bdea090d0d617`. The workspace download copy is `output/soundrig-godot-cues-2026-11-04.zip`.

## Existing-game integration

The source package includes `integration-proof/godot-platformer/`, an attributed adaptation of Godot's official platformer at upstream `b761b4c`. From the package root:

```sh
godot --headless --audio-driver Dummy --path integration-proof/godot-platformer --editor --import
godot --headless --audio-driver Dummy --path integration-proof/godot-platformer --script test_soundrig_integration.gd
```

Two actual downloaded kit revisions each produced three real coin-physics signals and three SoundRig starts, with unchanged integration code. See `evidence/practical-platformer-integration.json`, the integration's provenance, licenses and results. This was our controlled integration into upstream code, not external customer use.

## Browser and prototype evidence

`evidence/practical-browser-observations.json` records successful cue changes/undo, rejected quiet edits, both A/B playback starts, stale-preview invalidation, invalid WAV rejection, protected import and downloads. A valid quiet recording reached preview but failed saved checks; a subsequent project download retained the original recording bytes. Discard was disabled during commitment.

Desktop 1440, tablet 768 and phone 390 had no document-width overflow; landing/guide also passed at phone width. Keyboard Enter activated preview, and Tab after pitch-rate reached Apply. No errors appeared in the inspected console. Long screenshots were proportionately reduced by the browser tool; the archive keeps selected final captures rather than intermediate/native duplicates.

Protection covers Meta, recording and cue edits when enabled. Other manual operations may invalidate checks and require rerunning them. RMS-matched A/B differs from actual-mix audition and perceptual loudness matching.

## Package integrity

`SOURCE_MANIFEST.json` lists included files with byte counts and SHA256, excluding itself to avoid circular hashing. The separate workspace receipt `output/soundrig-practical-source-verification.json` records a fresh extraction, manifest checks and the 25-suite check with a server started from that extraction. It stays outside the ZIP so the archive is not rewritten after verification. Generated exports, caches, binaries and intermediate screenshots are omitted; frozen fixtures needed by tests are included.

## Not established

No outside repeat-use study, blinded listening comparison, human time-saving measurement, physical-device deadline study or retained-browser-heap benchmark was performed. Fresh Meta authoring was not rerun in this pass; earlier receipts are regression fixtures. Godot delivers static one-shots, not the full browser DSP. Public repository, accessible demo video and submission remain outstanding.
