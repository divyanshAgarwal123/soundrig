# SoundRig project upgrade verification - November4,2026 IST

This report covers the previous project phase. See [WORKFLOW_VERIFICATION.md](WORKFLOW_VERIFICATION.md) for the current connected-workflow build, checks and assessment. Its historical source ZIP is retained separately.

The earlier impact5.5 reflected a working fixed-kit demonstration without a practical route for a developer's existing recordings and project. The upgrade addresses those workflow gaps. It does not manufacture customer demand, time savings or a human sound-preference result.

## What changed

- A developer can import PCM16 WAVs into eight known roles. Original input bytes, file hashes and declared source/license notes survive save/reopen and export.
- Preparation preserves24/44.1/48k source rate, downmixes stereo, trims padding before DC correction, applies endpoint fades and bounded level normalization.
- Optional cue focus lowers continuous wind/footsteps around accepted pickup/damage events; event-only rendering stays unchanged. Trace-specific master correction gives measured headroom.
- The downloaded ZIP contains a plain JavaScript runner and all component/data/license dependencies. Its captured inputs can return to SoundRig for another edit/replay cycle.
- Complete runtime staging keeps the active project on failure, tests a muted live control acknowledgement before commit, and disposes the old player after success. Repeated runtime imports have an explicit page limit.
- Component export compares a canonical Float32 PCM hash from an isolated Node import with the workbench renderer, avoiding extra browser module imports. Rig, trace and renderer are snapshotted and editing is locked during export.

## Executed results

| Gate | Result | Evidence |
|---|---|---|
| Current check runner | PASS,12 suites | evidence/final-checks.json; no new model calls |
| WAV/preparation/schema | PASS,10 cases | project-assets-test.json; real held-out imports plus explicit synthetic defects/boundaries |
| Project bank, mix, transaction and processor | PASS,10 cases | project-runtime-test.json |
| Actual export function | PASS,3 regressions | project-export-ui-test.json; delayed Web/network fixtures |
| Project admission/cache/downloaded ZIP | PASS,4 cases | project-api-test.json |
| Existing renderer/player/hybrid/recovery/preview/HTTP checks | PASS | Current runner retains the baseline gates; copied old model records remain labeled historical |
| Actual new Meta edits | PASS,2/2 first attempts | project-workflow-test.json and raw patch records |
| Downloaded component/ZIP/WAV | PASS | project-workflow-test.json, project-zip-test.json |
| Phaser capture |167 commands, pickup+land | exports/browser-project-trace.json |
| Independent runner capture |113 commands, pickup+land+pickup+hurt | exports/runner-real-trace.json |
| Browser round-trip replay |113 commands,4 events,0 overloaded samples | independent-project-browser.json, browser-round-trip.json |

The two frozen new intents edited imported pickup gain to0.22 and imported damage rate to1.15. Actual local Glimmer calls took24.229s and24.002s; validation took0.2377s and0.1629s. Four other layers stayed byte identical in each case; isolated locked stems matched288000 samples on the real runner trace. These are two narrow cases, not broad authoring reliability. Earlier six-intent results remain4/6 initially plus2/2 repaired compiles, not an untouched100% result.

The downloaded final component is453935bytes, SHA2567df4f660a931e73640b7eea5c8cbaedb83b0fb67f60ea7669043da5fa19747d7. It equals the component inside the actual downloaded ZIP. The actual embedded processor and separately generated current renderer matched288000 samples on each of three traces, including both real game captures. The downloaded matched WAV is byte exact.

## Sound quality evidence

Two held-out Kenney recordings, absent from the original eight-slot bank, were imported as48kHz stereo WAVs. Preparation retained48kHz, produced RMS about0.12, exactzero endpoints, safe peaks and residual mean near zero. Source declarations are kept; these test assets have independently known CC0 provenance. This does not verify arbitrary user ownership.

With identical input and project data, cue focus reduced reconstructed pre-limiter background RMS by11.0567dB during the measured80-180ms post-cue window. Isolated event PCM stayed identical and background returned within0.2% of its baseline in the recovery window. This establishes mixing behavior, not a human preference or perceived-loudness score. quality-before.wav and quality-after.wav in exports/ use identical inputs and monitor scale, without whole-clip normalization. The separate synth/current comparison uses whole-clip RMS matching.

The independent review exposed and root repaired a real preparation error: subtracting the whole-file mean before trimming could create signal in silent padding. Original zero/biased asymmetric-transient reproductions now trim about198ms at each side, leaving about104ms and DC below5e-7. Invalid partial frames, alignment and byte-rate headers also reject.

A browser headroom test changed master0.800 to about0.722 and the selected real trace's pre-limiter peak0.720 to0.650; the original Meta rig was restored. This is trace-specific, not protection against every burst or distortion. The inherited deliberately excessive stress test still reaches the soft limiter.

## Resource and failure evidence

Eight distinct maximum representative banks each contained768000 decoded PCM bytes per realm; bundled source was about1.103MB, below2MiB including both bank copies. The final targeted check recorded Node RSS about160MiB at the first import,302MiB at the eighth, with a peak316MiB. That includes Node/compiler/text/buffers, is not a browser memory measurement, and does not prove module unloading.

The maximum-source DSP exercise used five continuous sources plus up to twelve event voices. In the final1000-block run at48kHz/128frames, Node p99 was about0.194ms, maximum about0.776ms against a2.667ms block duration. Scheduling and physical device underruns are unmeasured; no zero-underrun claim.

The loader refused the ninth attempted import before allocation. Module, start and acknowledgement failure fixtures retained the previous playing object; overlap refused. The actual export-function regression completed ten exports at the eight-import cap without verification module imports, rejected concurrent export, retained snapshots across forced state changes, and prevented download on hash mismatch.

Actual browser invalid-WAV and corrupted-project controls retained the rig and Audio on. Earlier unhelpful capture attempts with no events were excluded from workflow claims; one is retained at inactive-capture-trace.json. Only validated eventful captures support the result.

## Independent workflow

The actual browser-downloaded ZIP was extracted and served by Python's plain static server on8780. Authoring was disabled in the8771 app during the independent test. The runner reached distance351, score2, one landing, one collision and four applied audio events. Its113-command trace replayed with four events and zero overloaded samples, then was pasted into SoundRig and replayed successfully.

Server counters stayed0/0/0 over this interval. The authoring server had been restarted after the two real calls; the raw records retain those calls. These counters are interval evidence, not lifetime totals. This was app-level authoring disconnection and an independent static host, not a machine-wide network-outage test.

The final ZIP has ten fixed filenames, retains the editable project and113-command trace, and matches its content-addressed served directory. Host/template content participates in package identity. See project-zip-test.json for its actual archive checksum.

## Provisional rubric assessment

Weights were rechecked in the rendered organizer guide on November4,2026 IST:
https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details
Public event reference:
https://dev.meta.ai/events/global-hackathon

This is root's assessment of the demonstrated local product, not an official score, a new Council vote or winning odds.

| Criterion | Weight | Before | Now | Reason |
|---|---:|---:|---:|---|
| Impact |30%|5.5|6.5|Own recordings, editable retained projects and an engine-independent round trip solve more of a real developer workflow. Fixed roles, narrow sound limits and absent external adoption/task evidence still constrain impact. |
| Meta tooling |25%|7.5|7.5|Two actual edits work on imported assets with locked recipes and actual-bank verification. Meta does not generate or listen to recordings; exclusive advantage is not established. |
| Technical depth/execution |20%|8.0|8.5|Preparation, deterministic cue mixing, complete candidate activation, canonical export verification and independent regression repair are executed. Browser/device coverage remains limited. |
| Demo |25%|7.5|8.0|Own sound to Meta edit to retained ZIP to another game and back is demonstrated. A polished published three-minute video is still outstanding. |
| Weighted total |100%|7.0|7.525|Report as7.5/10, provisional. |

Fit remains indie "Build for Your World" and the Meta open-weight route. Partner credits do not add automatic rubric points. Glimmer alone does not establish Muse Image/Wonder creative-prize eligibility. Public source, an accessible three-minute video and final submission are unsubmitted.

## Limits

Fresh read-only interface review returned ship within visual/code-accessibility scope; a separate documentation review returned documented/preserved complete. Required captures cover workbench1280/667/390px and independent host1280/390px. Root measured no horizontal overflow at these widths. The detector launcher was unavailable, so no automated design-scan pass is claimed. See evidence/PROJECT_REVIEW.md.

No external developer study, human listening preference, adoption or measured human time saving. No claim of novelty for import, trimming, gain or ducking: standard Phaser audio and established middleware already supply such pieces. SoundRig's tested contribution is their connected, retained author/edit/replay/export workflow.

Mono short effects with four controls and three events; no arbitrary project understanding, general music/voice generation, Unity/Godot integration or professional resampling. Cross-browser/mobile physical-device behavior and speaker latency remain unknown. Per-page/runtime/cache limits are explicit in README. The preserved7.0 build remains available for rollback.
