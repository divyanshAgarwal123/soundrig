SoundRig connected workflow. Serve with: python3 -m http.server 8780 --bind 127.0.0.1
Run checks: node verify.mjs
No model/authoring server or npm install required. Exit0 passes;1 is a failed check;2 is invalid input/runtime or artifact mismatch.
After changing sounds, recipe, mix or bindings in SoundRig, re-export the connected workflow; stale project/component combinations refuse verification. contract.json may be edited to tighten checks.
Use game-adapter.mjs with explicit raw-state fields and named event hooks; no automatic engine understanding.
The adapter stream has its own mute/volume, not Phaser global settings. Pause/suspension invalidates capture.
See project.json/provenance.json and licenses/ for recordings and declared sources.
