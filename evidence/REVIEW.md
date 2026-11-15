# Review record for the hybrid build

## Engineering

A bounded read-only explorer independently measured the cold validator around 0.105–0.106 s on the curated rig and identified the original raw-record-loss path, four false-success game checks, preview mute inconsistency and missing API error metadata. Root repaired those paths. No inference-content quality or user-demand claim follows from that investigation.

A fresh read-only falsifier inspected the core, player, actual worklet, bundle, app and verifier. It reproduced two additional defects: Float32's nominal 0.8 limiter value failed WAV's strict upper bound, and overlapping pending preview resumes could create an untracked playing source. Root fixed both and added regressions. In a targeted follow-up the falsifier independently executed the original WAV counterexample and five delayed-preview cases (both resume orders, pending cancellation, stale failure and muted startup); both defects were resolved. This is source/runtime harness evidence, not a hardware listening assessment.

`evidence/COUNCIL.md` retains the pre-build six-role Council and two anonymized reviews, including the product dissent and targeted permission to begin the bounded implementation. That review did not certify the final build or award the new rubric score. This build's 7.0 assessment is the root's evidence-based judgment.

## Interface finish review

A fresh reviewer with no conversation history opened the supplied desktop 1280 px, mobile 390 px and independent-host captures and inspected relevant source. The incumbent light green Operate system was the authority; there was no approved comp or redesign request. The reviewer found no blank regions or visible horizontal clipping, but returned **fix** for two material issues:

1. Global Phaser cursor-key capture prevented native Space/arrow behavior in workbench forms.
2. An old selective-edit diff remained visible after an unrelated rig was installed.

Root reproduced the Space defect in the browser. The final repair uses host-scoped native arrows only while the game has focus, resets held keys on blur/pause/restart, removes listeners on destroy, and leaves form defaults intact. Accepted installation clears the diff; the edit just applied displays its own new diff afterward. Root tested the native keyboard, game focus, material diff, restore and JSON installation. See `ui-fix-browser.json`.

The same reviewer reopened all three final captures and reviewed the targeted repairs. Its final disposition was **ship for the two listed fixes**, with both resolved and no visible regression from their repair. This was a verdict pass over the fix list, not a new full-surface or assistive-technology certification. The reviewer did not operate the browser; interaction evidence came from root's recorded CUA checks.

Captures are in `.impeccable/review/`: `desktop.jpg`, `mobile.jpg`, `exported-host.jpg`; `preview.jpg` is a presentation capture of the desktop viewport. Visual inspection used two bounded capture rounds. The Impeccable launcher/detector attempt failed with permission denied (exit126), so no automatic detector pass is claimed.

## Documentation

A fresh read-only documenter checked PRODUCT.md, DESIGN.md, MISSION.md, README.md, VERIFICATION.md, style.css, index.html, game.mjs, app.mjs, exported.html and the recorded browser/export evidence. The incumbent palette, typography, layout and control states match the finished source. Root clarified the README's game-focus instruction and the location of the authoring toggle. PRODUCT.md, MISSION.md and DESIGN.md required no additional changes. This ordinary extension preserves the existing visual system; no replacement token document or sidecar was introduced. The inherited DESIGN.md format was not migrated. Root also corrected the authoring-probe filename to the shipped probe-meta.py.
