# Use the kit in Godot

This is a static one-shot adapter, not a port of SoundRig's live JavaScript runtime. No wind, movement-driven cadence or live cue-focus ducking is included. Takes cycle in authored order; identical takes remain identical. Existing saved gameplay checks verify the JavaScript rig before rendering, not this engine's gameplay.

1. Extract the ZIP. Open `project.godot` in Godot and run the included cue-check scene.
2. To use it in your game, copy `soundrig.gd`, `manifest.json` and the entire `audio/` folder together into one folder, retaining source/license files for distribution.
3. Add a node with this script from your own scene:

```gdscript
var kit = preload("res://soundrig/soundrig.gd").new()
func _ready():
    add_child(kit)
    assert(kit.configure(), kit.last_error)
func collected_pickup():
    kit.play_cue("pickup")
```

Your game must call `land`, `pickup`, `hurt` and `footstep` at the appropriate moments. Configure loads eleven fixed-path PCM16 WAVs and verifies hashes before activating. Twelve reusable players bound overlap. `stop_all()` stops voices; freeing the node releases them. Replace the kit's audio and manifest together on the next revision; keep your game calls unchanged. Gain is already baked in; the optional second argument only attenuates playback.

Headless check (Godot 4.7.2 tested): `godot --headless --audio-driver Dummy --path . --script test_soundrig.gd`. This exercises engine loading/playback lifecycle and cleanup. It does not prove speaker output, preferred sound or another game's integration. Original recordings and user-declared source notes remain in `project.json`; declarations do not establish ownership. Supplied Kenney recordings are CC0. SoundRig adapter code is MIT, see `SOUNDRIG_LICENSE.txt`.
