# SoundRig factory: observed paths and remaining gaps

Issue #1 is the status fix; issue #2 adds CI; issue #3 adds standards and quality gates. The diagram deliberately keeps their timelines separate. Source reads made for issue #3 do not retroactively establish Wisdom-first work on issue #1.

```mermaid
flowchart TD
    A1[Issue1 via gh CLI: executed] --> L1[Status fix and draft PR4: executed]
    A2[Issue2 via gh CLI: executed] --> C2[CI foundation and draft PR5: executed]
    C2 --> R2[Seven Qodo CI repairs and test reruns: executed]
    A3[Issue3 via gh CLI: executed] --> W3[Wisdom source verification: executed]
    W3 --> S3[Standards and read-only gate: implemented]
    S3 --> AUTH[Connection failure: historical observed block]
    AUTH --> RECONNECT[SoundRig-only reinstall: resolved]
    RECONNECT --> Q3[Local reviews and source-bound commits: executed]
    Q3 --> P3[Draft standards PR6: published]
    L1 --> G[Resolver and CI collection: executed for recorded heads]
    R2 --> G
    P3 --> G
    G --> STOP[Blocked historical and human-review receipts: observed]
    G --> FIX[Review findings, repairs and tests: executed]
    FIX --> G
    G -. future source-specific readiness assessment .-> READY[Human base and control review: pending]
    READY -. only after human review .-> MERGE[Human merge: pending]
    JOB[Event-triggered coding worker: proposed, Council-blocked] -. not executed .-> W3
```

Solid arrows record observed operations at the dated revisions in the evidence ledger; they do not assert that the latest PR6 head has passed every check. Dashed arrows are unexecuted transitions. Current-head Qodo/CI status must be fetched separately, and human readiness/merge remain pending.


The original status implementation reached a draft PR before successful Qodo integration. That catch-up gap is disclosed. The clean reinstall later fixed the connection. Five repository-scoped rules were created after explicit approval and independently read back active; this is manual promotion through Qodo’s rules API, not a claim that AGENTS.md was automatically imported from main.

`ci/review_gate.py` reads GitHub and Qodo, rechecks the PR head and blocks missing, failed, stale, partial or skipped review. It does not approve, dismiss findings, merge, deploy or submit. Unit tests exercise its rejection paths. Its live blocked receipt for a skipped PR #4 review is retained separately from passing CI receipts. Qodo exposes the reviewed head but no reviewed base/merge identity; head/CI evidence is reported separately and missing base attestation always requires human review, including a base update before collection.

CI failure tests cover private symlinks, SIGTERM cleanup, a resistant descendant, overlapping receipt publication, locked inference, occupied port, timeout and native failure receipts. Native checks use Dummy audio: no human listening claim.

The label-worker proposal was reviewed by six Codex roles and rejected for implementation until trigger provenance, containment, atomic claims, source-bound review and total-deadline requirements are concrete. No job has been installed or fired. Codex role diversity is not independent model-provider evidence. Human merge and daily Discussion submission remain separate pending steps.
