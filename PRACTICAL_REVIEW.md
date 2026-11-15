# SoundRig: practical workflow reassessment — November 4, 2026

**Local prototype estimate: 8.4/10. Impact: 8.2/10, previously 8.0.** These are judgments about the demonstrated product, not organizer scores, calibrated measurements or winning probabilities. The modest impact increase reflects verified integration into an existing native game. Adoption, human time savings and listening preference remain unproven.

## The problem behind the previous score

SoundRig could produce sound assets, but a developer still had to inspect preparation elsewhere and work out native-engine integration. Exact level changes also required a prompt or raw recipe editing. The useful recurring task is now concrete: replace a pickup recording, inspect preparation, adjust it under saved checks, and replace the delivered kit while retaining the same game-event call.

The target is an indie developer changing short effects in a Phaser or Godot game. This is not a daily tool for everyone who plays games. More potential users do not establish demand.

## Research and chosen improvements

Three options were compared: native engine delivery; safer recording inspection and precise edits; or full live DSP ports, long audio and cloud generation. The first two form one workflow. The third was rejected because it adds migration and verification risk without demonstrating a better outcome for this user.

- [Godot's audio import guide](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_audio_samples.html) already documents PCM WAV and appropriate mono effects. [AudioStreamPlayer](https://docs.godotengine.org/en/stable/classes/class_audiostreamplayer.html) already supplies playback and overlap. SoundRig therefore adds a fixed adapter and a checked handoff; it does not invent native sample playback.
- [Audacity's DC-offset documentation](https://manual.audacityteam.org/man/dc_offset.html) explains offset, clicks, headroom and removal limits. SoundRig already performed trim/DC/fades/bounded gain before this pass. The new preview exposes those existing operations before commitment, with clipping and cancellation warnings. It is not a new restoration algorithm.
- Godot's [official platformer](https://github.com/godotengine/godot-demo-projects/tree/b761b4c/2d/platformer) provides an existing game for testing the adapter. Its art, physics and game code remain upstream foundations. The new work is SoundRig's kit, integration connection, original-audio replacement and controlled verification.

Audacity plus native Godot remains the strongest simple alternative. The proposed advantage is keeping source, constrained changes, scenarios and repeat delivery together. A human comparison is still needed to establish whether that advantage exceeds setup cost.

## What was built

| Improvement | Delivered behavior |
|---|---|
| Recording preview | Original mono/prepared A/B at matched whole-clip RMS and a shared peak ceiling; duration, trim, gain and source warnings; explicit Apply/Discard. Original bytes stay in the project. |
| Protected recording replacement | Enabled saved checks run on the candidate bank before activation. Rejection preserves the current runtime and recording. Discard is disabled during a commit. |
| Precise cue edits | Event level and pitch-rate controls; checked application; actual-mix audition; one-step undo within the same revision. Reuses the runtime/bank. |
| Godot handoff | 31-file kit, eleven fixed-path WAVs, hash checks, twelve reusable players, native cue scene and engine verifier. Existing 24-file Phaser format is retained. |
| Prototype refinement | Clear pending filename/destination, warnings, protection scope, destination selection and guide instructions. Number fields are 16px with 44px targets. Approved pressing-room identity is preserved. |

Godot delivers static one-shots. It does not port wind, walking cadence, changing bindings or live ducking. Your game forwards events. JavaScript gameplay checks do not validate the Godot game's gameplay. Takes cycle in authored order and may be identical.

## Executed evidence

- **25 automated suites passed.** No new model call was required. Historical exports, classic rendering and the prior Studio DSP tests remain covered.
- **Seven actual Godot engine cases passed**, using official 4.7.2 with Dummy audio: native kit, relocated kit, native demo scene, modified hash, truncated WAV, oversized WAV and malformed manifest. Positive runs loaded eleven cues, started 34 events and kept twelve players; stop/free completed without engine warnings after allowing queued audio commands to drain.
- **Two actual browser-downloaded revisions worked in the existing official platformer.** Controlled player teleports caused real physics overlaps and three coin signals/three SoundRig starts per revision. The game integration code and `play_cue("pickup")` call stayed unchanged. This was root's integration, not an outside customer's work.
- Actual browser paths covered successful and rejected cue edits, undo, both A/B play starts, destination-change invalidation, malformed WAV rejection, protected replacement and both downloads. A quiet but valid recording was rejected at cue RMS 0.000332 against 0.001. The downloaded retained project had the original asset data exactly.
- Desktop 1440, tablet 768 and phone 390 showed no document-width overflow. Phone landing/guide also passed that check. Keyboard Enter activated preview; Tab after pitch-rate reached Apply. No console errors were observed in the inspected studio log. Long screenshots were proportionately reduced by the browser tool; actual viewport widths are recorded separately.

The unchanged preparation reduced the synthetic padding control's mean offset from 0.100102 to approximately −0.0000000401 and removed about 98ms at each end. Preview now makes this visible. The original/prepared comparison is RMS matched, not perceptually loudness matched; it does not represent the actual game mix. Previously measured resampling improvements are regression-tested, not newly invented here.

See `evidence/practical-*.json`, `fixtures/practical-godot-revision*.zip`, and `STUDIO_VERIFICATION.md`. Node/VM tests use explicit network/DOM fixtures where stated. Dummy audio proves engine state, not speakers. Physical-device deadlines, retained-browser-heap behavior, source restoration and listening preference remain unverified.

## Hackathon assessment

The [official participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) was reread after implementation. Its weights remain:

| Criterion | Weight | Before | Now | Reason and limit |
|---|---:|---:|---:|---|
| Impact | 30% | 8.0 | **8.2** | Existing-game integration and safer repeat edits remove demonstrated handoff risks. No outside repeat use or measured human time saving. |
| Meta tooling | 25% | 8.0 | **8.0** | Preserved local Glimmer recipe edits, locks and deterministic gates. Numeric controls/native exports do not establish a new model capability. |
| Technical depth and execution | 20% | 9.0 | **9.0** | Broader verified delivery, bounded input handling, atomic replacement and failure controls. Device/engine breadth remains limited. |
| Demo | 25% | 8.0 | **8.5** | Clearer import-to-game story, source comparison, rejected change, undo and real native-game handoff. Public video remains outstanding. |
| Weighted estimate | 100% | 8.2 | **8.4** | 8.2×.30 + 8×.25 + 9×.20 + 8.5×.25 = 8.385, rounded. |

Build for Your World remains the direct theme. The guide accepts reasonable use of Meta APIs and/or open weights. Sponsor credits do not add automatic rubric marks; the separate open-weight award names Glimmer/Spark Open and requires organizer verification. Using Godot is a workflow choice, not a sponsor bonus.

The official guide still requires a public repository, an accessible three-minute demo and clear identification of event-period contributions. Existing Phaser/Godot games must be credited as foundations. This pass did not publish, submit, contact developers or verify an API-credit balance.

## Red-team verdict

**Blind Spots & Assumptions** — Repeated cue changes must be costly enough to justify retaining SoundRig's recipes and scenarios. If developers export once and discard the project, repeat-use value fails.

**Critical Flaws** — The importer supports only short PCM16 effects; local fresh authoring requires roughly 19GB of weights. Checks can pass while a sound remains stylistically wrong or masked. A static Godot adapter is materially narrower than mature middleware.

**Red Team Attack** — Audacity prepares a sound, and a short Godot script plays it. SoundRig loses if its saved checks do not catch worthwhile regressions or if preparation/setup takes longer than that alternative. More features do not answer this objection.

**Interrogation**
1. Can three outside developers replace one owned cue in an existing game without help?
2. Do two return for a second revision and keep the saved checks?
3. Which actual bad edit do the checks catch, and what does maintaining them cost?
4. Do blinded listeners prefer, tie or dislike the result at matched levels on real devices?

**Survival Rating: 6/10 — TEST.** The implementation survived stronger internal integration and failure tests; external behavior remains absent. This adoption-resilience rating is separate from hackathon prototype fit. No new feature should substitute for that experiment.

## Stronger entry and next evidence

Use one three-minute story: identify the existing game as a credited foundation; preview an owned recording; show a constrained Glimmer change and saved checks; demonstrate rejection of an unusable change; deliver into the native game; replace the kit once while retaining the event call. Numeric edits can be shown briefly without pretending they demonstrate Meta intelligence.

The next decisive impact improvement is three observed developer integrations and a second revision, followed by a blinded listening comparison. Until then, 9/10 impact would overstate the evidence. The source package includes a runnable native integration proof so that experiment can start from working files.
