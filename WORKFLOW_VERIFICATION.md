# Connected workflow: build and verification

Verified locally November4,2026. This is the current project/ report; VERIFICATION.md covers the prior phase. Ratings below are the builder's judgment, not official results or a Council product vote.

## Why impact was6.5

Better recordings improved the source sound, but developers still had to wire their game and recheck every change manually. A playable demo and component export did not establish a repeat reason to use SoundRig.

The implemented workflow covers a recurring job: explicitly connect a game's state/events, record representative runs, retain separately declared outcomes and signal limits, edit with Meta, reject regressions, and keep the component and checks in the game repository. The exported `node verify.mjs` reruns checks without a model or authoring server. Actual usage frequency and developer time savings remain unmeasured.

| Job | Built | Executed proof |
|---|---|---|
|Connect a game|Reusable raw-state/event adapter and Phaser3.90 helper|Actual Phaser platformer and separately served original JavaScript runner|
|Retest later changes|Named saved runs, independent expected cue counts, per-case replay and signal limits|Two real6s captures and a labeled1s synthetic dead-idle case|
|Make bounded Meta edits|All saved cases must pass before application; other layers locked|One accepted fresh intent; an impossible guard rejects both candidates and retains the active rig|
|Keep the result|15-file integration ZIP with editable project, sources, verifier and integrity references|Actual downloaded ZIP extracted, independently served, replayed and verified|

## Research and rubric

The refreshed rendered [organizer guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) assigns Impact30%, Meta tooling25%, Technical execution20%, Demo25%. The [Meta event page](https://dev.meta.ai/events/global-hackathon) emphasizes working, technically ambitious indie creativity. No automatic sponsor-technology bonus was listed. Specific award requirements are separate: Glimmer alone does not satisfy the MuseImage/Wonder creative-tool requirement. Local open-weight use is documented; eligibility and organizer verification are not award guarantees.

Ordinary [Phaser audio](https://docs.phaser.io/phaser/concepts/audio) already handles sample playback and parameters. [FMOD](https://www.fmod.com/studio) already supports sophisticated iteration and recorded-session profiling. [Godot](https://docs.godotengine.org/en/stable/tutorials/audio/audio_streams.html) already offers randomized/positioned audio. SoundRig's useful combination is explicit wiring, constrained Meta recipe editing, retained arithmetic checks and portable no-inference output. It is not a novel renderer, universal importer or professional middleware replacement. MISSION.md records why this route was chosen over more catalog/music content or unvalidated engine ports.

## Checks and actual workflow

`python3 run_checks.py` completed **15/15 suites PASS**, making no new inference calls. See evidence/final-checks.json. Prior renderer, player, WAV preparation, transaction/recovery, HTTP boundary and legacy export suites remain.

- 20 adapter/contract tests cover strict mappings, event order, normalization, start races, interrupted/overflowing captures, owned listeners, actual game pause/cleanup functions, independently calculated RMS and meaningful mute/wrong-map/overload/silence/coverage controls.
- 9 server/workload/package tests use the actual validator with synthetic model responses. Invalid preflight stops before inference. Semantic failure may repair once; infrastructure failure spends no further inference. Null patch envelopes use the semantic path.
- Actual downloaded artifact tests check component/verifier hashes, browser/offline PCM, all3 embedded AudioWorklet renders, actual Meta receipts and four locked stems. A failing downloaded signal check exits1; a stale editable recipe exits2.
- Maximum workload:524,288 encoded bank bytes,1,128,475-byte module,6cases/30s,32,736-byte contract. Cold generic+contract1178ms; warm1065ms; full cold process plus warm2.341s; peak RSS171,393,024bytes. One import per candidate versus a15s deadline. These are Node/M3 measurements, not physical-device realtime guarantees. See evidence/workflow-budget.json.

Actual Phaser recording:240 commands, independently observed land1/pickup2/hurt0. Independent runner:109 commands, land1/pickup2/hurt1; four replayed events, zero overloaded samples. That trace returned to SoundRig and replayed there. Final bank:3cases,13s,26,281 compact bytes. Evidence: workflow-phaser-capture.json, workflow-independent-browser.json, workflow-browser-roundtrip.json.

Interrupted capture refused publication and retained the previous trace. Browser testing exposed and repaired a cleared Phaser physics-world shutdown reference and queued scene pause cancelling fresh replay. Failed pre-fix recordings are retained and excluded. Four-decimal normalization suppresses float jitter identically in live and recorded controls; rounding error is at most0.00005.

Fresh local Meta tests used a contract frozen before dispatch:

| Intent | Actual result | Time |
|---|---|---:|
|Only pickup gain0.30/rate0.95|First candidate accepted,3 original cases pass,4 other layers unchanged|38.326s|
|Active locked wind must be silent while only pickup can change|Both candidates rejected; browser active rig retained byte-for-byte|73.658s,2attempts|

Raw records: evidence/patch-07e0b7354877.json and patch-42f99e8e45f1.json. The contradiction fails at RMS0.016924 versus zero in300–900ms. Two narrow intents do not establish a general success rate. Fresh inference used separately installed `muse-glimmer:30b-mlx` (roughly19GB); hosted credit was not used. Equal server counters cover only the final verification interval. Authoring was restored afterward.

## Retained artifact

`../../output/soundrig-connected-workflow.zip` is byte-identical to the final browser download, content identity workflow-2bf52176223d,15files. SHA256:

`b3a8eed39926632dd6ff600ab21ac0afdf4024cb545f968193d9b41fe56bff11`

Its453,937-byte component SHA256:

`a7fd5dcc9365f5518cb749183d922350fc961852124336d72f5994ea560d9ae7`

Extract; run `node verify.mjs`; serve with `python3 -m http.server 8781 --bind 127.0.0.1`. The independent live capture used the provisional pack. Final host/adapter/component/verifier code is identical; only contract.json, trace.json and provenance.json changed to include latest captures. Final extracted pack was separately reloaded:3checks pass and109-command/4-event replay completes without overload. See evidence/workflow-package.json.

The source ZIP at ../../output/soundrig-workflow-source-2026-11-04.zip includes SOURCE_MANIFEST.json and actual downloaded test fixtures. Python/OS caches and redundant generated workflow cache directories/ZIPs are excluded. Node25.9/Python3.10.13 were observed locally. Model weights are not bundled. Extract and follow README.md.

## Provisional rescore

| Rubric | Weight | Before | Current | Reason and limit |
|---|---:|---:|---:|---|
|Impact|30%|6.5|**7.5**|Connected repeatable workflow; no outside developer/time/adoption evidence|
|Meta tooling|25%|7.5|**8.0**|Actual gameplay-guarded edits; narrow intents and heavyweight local authoring|
|Technical execution|20%|8.5|**8.5**|Bounded validation, lifecycle, negative controls and actual artifact; limited device coverage|
|Demo|25%|8.0|**8.0**|Executed full loop; polished accessible3-minute video not published|
|Weighted|100%|7.525|**7.95 ≈8.0/10**|Stronger working entry, no automatic9 from feature count|

## Remaining limits

Four controls, three events, eight slots, short mono effects. Six cases/30s/32KiB; individual traces10s/1200commands. Explicit wiring is required. Cue RMS, silence and headroom measure arithmetic signal behavior, not timbre, perceptual masking, ownership or speaker latency. Linear interpolation/source quality limit audio fidelity. Exact PCM on tested runtimes is not a cross-browser guarantee. Responsive viewport checks are not physical mobile tests.

No external listening study, customer demand, retention or comparative developer-time result was established. The next impact evidence is an outside developer connecting their game and retaining checks through a real sound revision. Public licensed source, an accessible at-most3-minute demo with labeled inference cuts, and organizer verification fields remain entry work. No publication or competition submission occurred.
