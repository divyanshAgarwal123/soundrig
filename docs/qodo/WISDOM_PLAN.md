# Wisdom inquiry before the standards change

Original ticket: issue #3, preserved unchanged in `evidence/issue-3-original.json`.

Question: which existing verification mechanism should the standards require, and what must be invalidated before a rerun?

Before retrieval: propose a broad rule saying rerun tests after edits. After connection repair, Codebase Wisdom returned `app.mjs` lines 391–412 at commit `426e4ceb343c919ba9a670b8147dc907bfe07202`. The returned excerpt matches local source except the final newline omitted by the service; receipt: `evidence/wisdom-status-source.json`. Pagination indicates the rest of the file exists; only this requested range was checked.

Observed: `invalidateContract()` clears the report and repaints rows. `runContract()` calls it before parsing or contacting the server. `assertContractParity()` checks contract, rig, case trace and PCM identities; `runContract()` also checks the project digest. `setContract()` resets prior measurements.

Plan refinement: scope rule1 to current Saved checks, invalidate and repaint on relevant edits/reruns, and require project/contract/PCM parity before showing PASS. Reuse the existing invalidation and parity functions; do not add a competing status cache. Root setup points at the existing isolated CI runner and evidence receipts.

Unknowns: this excerpt does not prove every mutation calls invalidation, does not establish human sound quality, and does not certify PR review or Qodo standards activation. Those remain separate tests or integration steps.

Before implementing `ci/review_gate.py`, a second exact-commit Wisdom inquiry retrieved the CI receipt/publication section of `ci/check.py` (lines 77–105) at `ca047319ab0748ff242b152a371a9fd3d6e76a2f`, verified against local source. Reuse the nonpassing-first principle and source identity, but keep the readiness checker read-only: it collects current GitHub head/checks and structured Qodo findings, rechecks the head, and emits a result without merging or closing findings. A `skipped` review is explicitly blocked rather than assumed clean.
