# SoundRig project instructions

SoundRig Studio turns short recordings and bounded sound recipes into editable game audio, checked playback and portable exports. The browser, worklet, server-side checker and exported component share deterministic runtime code. `PRIOR_WORK.md` distinguishes the existing product from Qodo event improvements; `THIRD_PARTY_NOTICES.md` records licenses.

## Setup and verification

Python 3.10+ and Node 22+; the application has no npm or Python package install step. Start `python3 server.py` and open http://127.0.0.1:8772/. Fresh model authoring separately requires the locally installed Ollama model described in README; tests must not download it or start inference.

For a clean verification with port 8772 free:

```sh
python3 ci/test_check.py
python3 ci/check.py
```

Read `.qa-output/latest/receipt.json`, follow its `artifacts` path and inspect the aggregate suite receipt and logs. CI also runs the official checksum-pinned Godot engine. Local native checks require an explicitly supplied binary; Dummy audio proves native behavior, not listening quality.

## Five project rules

1. **Verification state — `app.mjs`, `quality-contract.mjs`, UI tests.** Keep the current check result in Saved checks. Invalidate and repaint measured rows after relevant sound/definition changes and before reruns. Publish PASS only for a completed result with matching project/contract/PCM identities. Reason: issue #1 reproduced a restored notice saying UNCHECKED after PASS, and old PASS rows surviving edits or failed reruns.
2. **Activation and history — `project-loader.mjs`, `revision_store.py`, activation handlers.** Validate candidates before replacement and save recovery before a restore commits. Any quota, guard, preparation or commit failure must keep the active project usable. Never silently evict saved revisions. Reason: a failed edit must not lose the developer's working audio or original recordings; regression tests exercise backup and rollback failures.
3. **Recordings and exports — import, delivery and integration code.** Retain originals, declared source notes and third-party licenses; verify exported PCM/component identities. Describe static cue packs and live behavior accurately. Reason: static WAVs cannot reproduce dynamic wind/cadence, and an uploaded license note does not certify ownership.
4. **Trust boundaries — server/API, model parser and runtime loader.** Enforce existing body, duration, schema, timeout, retry and activation limits. Model output is bounded data, never executable code; an exported runtime must work without credentials or authoring endpoints. Reason: malformed input or slow generation must not freeze playback, consume unbounded resources or expose local data.
5. **Factory evidence — CI, reviews and submission docs.** Bind results to the executed source and completed current-head review. Fix every valid High/Medium finding, including Medium Bugs; flag Low findings for a human. Record disagreements with source/test reasons. A pending, truncated, unavailable, failed or stale review/check is blocked, never done. Reason: this exercise already reproduced stale PASS artifacts after failed reruns. Codex review and historical receipts never count as Qodo review or fresh inference. Preserve private revision stores, credentials and raw personal journals outside public artifacts; never follow symlinks when copying CI inputs or artifacts. Qodo reproduced private-file leakage through an innocently named symlink, and CI now filters links on both copies.

Use one `codex/` branch and one focused PR per ticket. Include the original ticket, acceptance criteria, source-aware verification and review state. Follow `docs/qodo/QUALITY_GATE.md`. Leave merge and competition submission to the human; do not auto-merge or post Discussion entries.
