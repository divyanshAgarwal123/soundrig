# SoundRig: saved revisions and updated hackathon assessment

SoundRig now supports a practical repeat-edit loop: import an original cue, audition preparation, apply a checked change, capture game inputs, save a named checkpoint, compare versions, restore safely, rerun checks and re-export into a game. The improvement is recovery of the linked sound/project/run/check state, beyond manually naming unrelated project files. It does not establish customer demand or better-sounding recordings.

## Delivered behavior

Revisions contains dated local checkpoints with exact field differences, original WAV data and source notes, applied recipe/mix/quality, selected input run and check definitions. A successful restore first durably saves current work as a recovery checkpoint. Current enabled checks must pass and stay enabled; with current protection off, stored definitions/protection are restored. Every restored result starts UNCHECKED. Live game position and cached PASS reports are excluded.

History survives browser reload and server restart on this computer. Portable download/import supports a separate backup; import adds history without activating it. It is explicit checkpoint saving, not autosave, cloud sync or a DAW timeline. Private SQLite data is not served or included in the source archive. Limits are 24 checkpoints and 48 MiB of serialized snapshots, with no automatic eviction. SQLite and temporary copies require additional disk space. A full store refuses save/restore with download/remove guidance. The existing eight runtime activations per page remain visible; reload when exhausted.

## Updated rubric assessment

The official participant guide was reread in the browser for this pass: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details . It gives Impact 30%, Meta AI tooling 25%, Technical depth/execution 20% and Demo 25%. The following is root's provisional qualitative assessment of the local prototype, not a judge score, Council vote or winning probability.

| Criterion | Weight | Estimate | Evidence and limit |
| --- | ---: | ---: | --- |
| Impact |30%|8.3/10|A complete repeat-edit/recovery/delivery workflow for indie game developers, with actual engine integration. No observed outside adoption, comparative task time or retention. |
| Meta tooling |25%|8.0/10|Fresh local Muse Glimmer edit: constrained gain 0.30, four locked layers retained and three checks passed before application. Useful bounded authoring role; this particular scalar edit could also be manual. No model during gameplay. |
| Technical depth/execution |20%|9.0/10|Staged audio runtime, atomic recovery/activation rollback, input/corruption/concurrency gates, deterministic browser/export PCM, DSP, portable workflow and native Godot integration. One slow-host preview timeout occurred and was safely refused; responsiveness is not universal. |
| Demo |25%|8.8/10|Playable Pressing Room Run, matched-input comparison, clear candidate/revision states and independent exports. Live inference took 45.365 seconds and should not occupy most of a three-minute video. Physical-phone/audio and full screen-reader gameplay remain unverified. |
| Weighted total |100%|8.49 → **8.5/10**|Estimate is evidence-bounded; feature count alone does not raise impact. |

The modest impact improvement reflects reliable recovery between edits. It is not a sound-quality score. Studio DSP retains the earlier spectral/transfer verification; this pass changes no sampler algorithm. Original/prepared audio can be played and exact exported PCM is verified, but no listener preference has been measured.

## Competition fit and submission boundary

This fits Build for Your World and the guide's reasonable Meta API and/or open-weights requirement. The local Glimmer path uses open weights rather than hosted Meta credits. Sponsor credits do not imply bonus rubric marks. The separate Best Build with Open Weights award lists Glimmer/Spark Open and requires organizer eligibility verification. The creative award specifically calls for Muse Image/Wonder; existing artwork generated elsewhere is not evidence of qualification.

The guide requires a public repository, accessible three-minute video and attribution/new-work disclosure. The reviewed source ZIP is a local handoff, not a public repository or submission. Earlier development, Phaser/Godot foundations, Kenney recordings and generated visual assets must be disclosed accurately. No submission, publication or credit-balance verification was performed in this pass.

## What would raise confidence next

1. Observe three indie developers importing an owned cue, changing it, saving/restoring and delivering it into their game without coaching. Compare time and errors with their existing workflow; record repeat use. No outreach has been sent.
2. Blind-listen to matched-input alternatives using licensed source recordings. Ask about fit, fatigue and clarity, rather than declaring resampling quality equal to artistic quality.
3. Review the three-minute demo: show a real edit failing a saved check, recovery without losing work, then a verified exported cue in a separate native game. Label saved and fresh model output. Keep inference latency visible in the evidence.

Further animation or broad format support is lower priority than these external-value tests. The local build is suitable to demonstrate; a 9+ impact claim would exceed the evidence.
