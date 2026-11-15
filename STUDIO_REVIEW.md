# SoundRig Studio: usefulness, research and reassessment

> Historical snapshot before the practical workflow upgrade. See PRACTICAL_REVIEW.md for the current25-suite evidence and reassessment.

**Local prototype assessment:8.2/10. Impact:8.0/10, up from7.5.** This is an evidence-based estimate, not a judge score or a winning probability. The engineering earns a stronger entry; adoption and listening preference still need people outside this build session.

## What changed the practical value

The earlier build could demonstrate editable game sound, but taking the result into a developer's own game required substantial custom work. That limited the impact case. The upgrade closes a concrete handoff: bring licensed recordings, keep editable behavior and source declarations, protect representative runs, and leave with ordinary WAVs/sprite markers or a live component with an offline verifier.

An indie developer actively iterating on a browser game can use this across successive sound changes. It is not a daily tool for everyone who plays games. A bigger hypothetical audience does not establish usefulness. The repeat-use claim to test is whether a developer keeps the saved scenarios and returns when replacing or retuning a cue.

The delivered24-file kit contains11static WAVs, sprite/markers, editable source project, pinnedPhaser consumer, font and licenses. The17-file live workflow retains changing controls, cadence and wind. Both actual downloads were consumed separately. Static delivery is an implemented path into ordinary asset workflows; automatic Unity/Godot integration is not implemented.

## Primary-source findings and their implication

- [Phaser audio documentation](https://docs.phaser.io/phaser/concepts/audio) already covers sample playback, audio sprites and sound settings. Merely playing a generated sound is a weak differentiation. Our proposed advantage is repeatable behavior plus independently delivered output and checks. That advantage is an inference awaiting user comparison.
- [FMOD event controls](https://www.fmod.com/docs/studio/event-macro-controls-reference.html) and [advanced workflows](https://www.fmod.com/docs/2.04/studio/advanced-topics.html) establish mature game-audio tooling. SoundRig is a bounded, lighter browser workflow; it is not a professional middleware replacement or a novel invention of parameterized audio.
- [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/provide-separate-volume-controls-or-mutes-for-effects-speech-and-background-music/) supports distinct audio controls. SoundRig's effect stream has mute/volume, but a game's other audio remains the developer's responsibility. This prototype does not demonstrate complete game accessibility.
- The [Web Audio specification](https://www.w3.org/TR/webaudio-1.0/) supplies the runtime foundation. Signal tests and measured processor runs substantiate bounded behavior; they do not establish every device's scheduling reliability or perceived quality.

Research therefore favored portable assets, explicit setup and consistent checked rendering over adding more unsupported engines, long-form music, or a broad audio-generation claim.

## Rubric fit

The [official participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) was reread in the browser on November4. Its weights are used here. The event accepts reasonable use of Meta API and/or Meta open-weight models. Build for Your World is the direct fit; this is a concrete creative-development workflow.

| Criterion | Weight | Assessment | Evidence and ceiling |
|---|---:|---:|---|
|Impact|30%|8.0|Actual game assets, editable source and repeatable scenarios leave the demo. No outside adoption or measured time saving.|
|Meta tooling|25%|8.0|Fresh Glimmer edit with imported-source identity, exact layer locks, deterministic checks and guarded application. Meta edits recipes, not recordings; no surprising new model capability is claimed.|
|Technical depth/execution|20%|9.0|Optional bounded sinc sampler, quiet linear transfer, frozen classic compatibility, maximum-workload tests, atomic project activation, frame-exact exports and independent consumers. Browser/device breadth remains limited.|
|Demo|25%|8.0|Working native interaction, playable game, useful exports and distinctive complete site. A public three-minute video and judge-accessible repository remain to be supplied.|
|Weighted local assessment|100%|**8.2**|8×.30+8×.25+9×.20+8×.25.|

Partner credits are resources, not automatic extra rubric points. The guide separately lists a$10,000 open-weight award for Muse Glimmer/Spark Open and a$5,000 agentic award. Local Glimmer fits the described model category, subject to organizer eligibility/verification; no award is assured. The creative award specifically names Muse Image/Wonder, so this site's non-Meta image-generation artwork does not establish eligibility for that category.

The guide requires a public repository, accessible three-minute demo, event-period work and clear attribution of new contributions. The submission deadline remains November4,9PMET (November5,7:30AMIST). No public submission, repository/video publication or third-party outreach occurred during this local build task.

## What actually improved sound quality

Studio mode retains sample-rate metadata and uses a24-tap/64-phase ratio-aware windowed-sinc sampler, with precomputed bounded tables. Quiet signals are exactly linear through±0.8; larger peaks enter a bounded soft knee. Classic projects keep their original rendering.

Known-tone probes show70.50dB less resampling image energy,18.66dB less alias energy in the up-pitched48k→48k probe and86.36dB reduction in the worst supported48k→32k step. The fractional44.1k probe's passband error was0.0178%. Low-level known-tone THD fell from1.8162% to near arithmetic noise. These are specific signal measurements, not a claim that every real recording sounds noticeably better.

The actual eleven exported WAVs matched the independently exported live component within one PCM16 step. The comparison on the landing page uses the same cue/source/inputs at matched RMS. A source that already sounds clean may differ subtly. Mono short effects, original source quality and a non-professional mixing workflow remain limits. See STUDIO_VERIFICATION.md and the raw JSON receipts for exact scope.

## Adversarial product review

**Blind Spots & Assumptions** — Developers must have recurring behavioral-audio changes worth protecting, their recorded scenarios must represent meaningful failures, and setup must beat their existing sample workflow. These assumptions fail if developers simply import one sound pack and rarely edit it, or if declared checks add upkeep without catching real regressions.

**Critical Flaws** — Local authoring needs roughly19GB of model weights and observed44.9second edits. That friction can overwhelm small tasks. The importer/runtime is deliberately narrow: short PCM16 WAVs and mono effects. A developer needing music, spatial mixing or mature engine middleware will leave. Finally, arithmetic cue checks cannot judge style, emotional appropriateness or perceptual masking; a passing rig can still sound bad.

**Red Team Attack** — A developer can use licensed WAVs, adjust volume/rate in Phaser, and keep a small integration script. FMOD supplies much broader audio workflows. SoundRig loses if users do not retain its scenarios and editable recipes after the first successful export. Another prompt is sufficient for a one-time recipe change; the proposed value is the saved inputs, constraints, checked application and artifact handoff around repeated changes.

**Interrogation**
1. Can three outside developers put their own cue into their own game without help, and where do they abandon setup?
2. Do at least two keep the project/checks and return for another edit after48hours?
3. Which actual bad change does a saved check catch that their existing workflow misses, and what does maintaining that check cost?
4. In a blinded, level-matched comparison, are real cues preferred, tied, or reported as worse? Would the developer still use the delivery/checking workflow if DSP preference is tied?

**Survival Rating:6/10 — TEST.** A functioning bounded product is present, but meaningful external-user validation is absent. This is a business/adoption resilience rating, separate from the hackathon prototype assessment. The cheapest next test is three developers completing one owned-cue integration and a second change, with observed setup failures and a blinded listening comparison. More features alone should not move Impact above8.

## Strong entry strategy

Use a single concrete story: a developer replaces a pickup cue, asks Glimmer for one constrained change, sees the four locked layers and three checks survive, then imports the delivered result into the separate scene. Show one deliberate failed expectation and its nonzero verifier exit. Distinguish credited Phaser/Kenney foundations from new SoundRig authoring, DSP, protection and exports. Let real gameplay and the independent consumer carry the demonstration; use the landing page as its clear entrance.

For a stronger impact claim, prioritize observed outside integration and return use over another engine adapter. For stronger sound claims, collect blinded listening evidence across representative owned/CC0 cues and multiple physical devices. For submission readiness, package the public repo and record a concise truthful three-minute video. Those tasks remain separate from this completed local implementation.
