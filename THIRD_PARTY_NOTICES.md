# Reuse and original contributions

SoundRig's authoring server, bounded recipe validation, renderer, sample integration, layer locking, trace transport/replay, comparison/export tooling, UI and checks are project work. Earlier SoundRig prototypes are disclosed in the parent folder; the hybrid kit and trace workflow extend that work. No claim is made that every line originated in this build phase. Confirm the competition's event-period originality requirements before submission.

## Sound assets

Eight recordings come from Kenney's [Impact Sounds](https://kenney.nl/assets/impact-sounds) and [Interface Sounds](https://kenney.nl/assets/interface-sounds), under CC0 1.0. Copies of the actual archive licenses are in `licenses/`. Selected original OGGs and prepared WAVs are in `assets/`. `assets/provenance.json` records source/archive/PCM hashes, source paths and preparation; `prepare_assets.py` is the conversion recipe and requires ffmpeg only when regenerating assets. Runtime playback does not need ffmpeg. `samples.mjs` and the exported bundle embed the fixed bank and CC0 source information. Meta configures these assets; it does not create these recordings.

Two additional recordings in `fixtures/`, from the same Kenney Interface Sounds CC0 archive, are held-out import examples: `confirmation_004.ogg` and `error_004.ogg`, renamed `custom-pickup.ogg` and `custom-hurt.ogg`. Their 48kHz stereo WAV conversions and hashes are recorded in `fixtures/provenance.json`; the original OGGs are retained. The saved example and runnable project contain these imports. Other synthetic waveform/parser fixtures are authored validation data, not recordings of people or third-party sound packs.

Imported source/license notes are user declarations, retained as data. They do not certify ownership or grant rights to arbitrary uploaded recordings. The supplied Kenney fixtures have separately known CC0 provenance.

## Phaser and game

Phaser 3.90.0 is vendored under MIT; retain `vendor/PHASER-LICENSE.md`. `game.mjs` adapts the MIT-licensed [Phaser first-game tutorial, part 10](https://github.com/phaserjs/examples/blob/master/public/src/games/firstgame/part10.html). Upstream source, its README license statement and source record are retained under `upstream/`. The tutorial's gameplay is reused. SoundRig's game-state/event hooks and geometric textures are project contributions. No tutorial image assets are shipped. Upstream's README separately cautions that its other image assets are not all covered by the source-code MIT license.

The exported plain JavaScript runner in `standalone-host.html` and `standalone-host.mjs` is project work. It does not ship Phaser or the tutorial gameplay. Its two CC0 notices cover the embedded default sound bank and supplied example recordings; custom projects also retain their declared source notes in `project.json` and `provenance.json`.

`fixtures/frozen-baseline-component.mjs` is an unchanged regression artifact from the preserved earlier SoundRig build. It includes that build's default Kenney bank and project-generated renderer; its embedded source declarations and the retained CC0 notices apply. It is test evidence, not the new project's exported component.

## Meta model

The reusable raw-state adapter, saved-check evaluator, integrity/CLI tooling and connected workflow runner extend the original SoundRig project work. The Phaser bridge targets the vendored3.90 runtime; pinned upstream ScenePlugin/Systems sources informed the immediate pause and shutdown fixes. No additional framework or sound library is bundled. Current exported contracts contain actual input recordings plus explicitly labeled synthetic controls. Input traces are game state/events, not recordings of a person's voice.

Fresh recorded authoring uses local Muse Glimmer through Ollama. Model weights are installed separately and retain their own applicable license and use terms. They are not included in this source package or exported component. No speech, music, model-generated audio or executable model output is shipped.

## Studio website and optional renderer

The new landing/studio/guide UI, fixed cue delivery exporter, separate Phaser sprite consumer and opt-in Studio DSP transform are SoundRig project work. The original classic DSP/source files are unchanged. Studio uses authored windowed-sinc coefficients and a linear low-level/bounded-knee output stage; Meta emits recipe data, not this executable DSP. Static exports are a distinct baked delivery, not dynamic wind/cadence or verified arbitrary-engine integration.

Archivo Black and DM Sans are self-hosted from the Google Fonts repository under their included SIL Open Font License files in fonts/. fonts/provenance.json records the exact upstream URLs. The record illustration and paper texture were generated for this website. They are a visual metaphor, not photographs of a real physical product or customer evidence. Production PNGs embed their generation prompts; no third-party game character is depicted. Existing Phaser and Kenney notices continue to apply.

SoundRig Display is an OFL1.1 derivative of Archivo Black. Its i tittle and period are rounded; the original font, license, provenance and reproducible preparation script are retained. Portable hosts carry the derivative font and OFL notice.
