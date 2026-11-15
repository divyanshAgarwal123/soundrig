# SoundRig integration proof

This adapts Godot's official platformer. It is not a new SoundRig game or an outside-customer integration. See `SOUNDRIG_PROVENANCE.json`, the original README, music credits and `UPSTREAM_LICENSE.txt`.

With Godot installed, run from this folder:

```sh
godot --headless --audio-driver Dummy --path . --editor --import
godot --headless --audio-driver Dummy --path . --script test_soundrig_integration.gd
```

For interactive play, open `project.godot` and run the single-player scene. SoundRig attaches its adapter to the original game and forwards the original coin signal. The old pickup audio animation track is disabled to avoid double playback. Other upstream audio remains credited upstream work.

The controlled test moves the player into existing coins and asserts three coin signals and three SoundRig starts. Two exported kit revisions passed with unchanged event-connection code. Dummy audio verifies engine behavior, not listening quality. The kit supplies static one-shots, not browser live DSP. To update, copy `soundrig.gd`, `manifest.json`, the entire `audio/` folder and source/license files from the newly exported ZIP into `soundrig/`, retaining their structure. See `soundrig/GODOT_README.md` for layout and limits.
