# SoundRig factory: observed paths and remaining gaps

Issue #1 is the status fix; issue #2 adds CI; issue #3 adds standards and quality gates. The diagram deliberately keeps their timelines separate. Source reads made for issue #3 do not retroactively establish Wisdom-first work on issue #1.

```mermaid
flowchart TD
    A1[Issue 1 via gh CLI: executed] --> L1[Local investigation and status fix: executed]
    L1 --> P1[Draft PR 4 and browser evidence: executed]
    A2[Issue 2 via gh CLI: executed] --> C2[CI foundation and failure tests: executed]
    C2 --> P2[Draft PR 5: executed]
    P2 --> R2[Qodo found five real CI problems: executed]
    R2 --> F2[Fixes, regression tests and CI rerun: executed]
    A3[Issue 3 via gh CLI: executed] --> W3[Wisdom source and citation verification: executed]
    W3 --> S3[Scoped standards and read-only gate: implemented]
    S3 --> AUTH[Historical Qodo credentials unavailable and workspace403: blocked]
    AUTH --> RECONNECT[Clean SoundRig-only reinstall: resolved]
    RECONNECT --> Q3[Local staged and unstaged review: findings obtained]
    Q3 --> D3[Correct diagram and evidence snapshots]
    D3 --> V3[Final local review and focused PR: require completed coverage]
    P1 --> G[Collect current-head Resolver and CI evidence]
    F2 --> G
    V3 --> G
    G -->|incomplete, stale or skipped| STOP[Blocked receipt and human attention]
    G -->|valid High or Medium| FIX[Fix and test; max two repair cycles]
    FIX --> G
    G -->|completed current head and required CI pass| READY[Human readiness assessment]
    READY --> MERGE[Human merge: pending]
    JOB[Label-triggered coding agent: proposed, blocked by Council] -. not executed .-> W3
```

The original status implementation reached a draft PR before successful Qodo integration. That catch-up gap is disclosed. The clean reinstall later fixed the connection. Five repository-scoped rules were created after explicit approval and independently read back active; this is manual promotion through Qodo’s rules API, not a claim that AGENTS.md was automatically imported from main.

`ci/review_gate.py` reads GitHub and Qodo, rechecks the PR head and blocks missing, failed, stale, partial or skipped review. It does not approve, dismiss findings, merge, deploy or submit. Unit tests exercise its rejection paths. Its live blocked receipt for a skipped PR #4 review is retained separately from passing CI receipts.

CI failure tests cover private symlinks, SIGTERM cleanup, a resistant descendant, overlapping receipt publication, locked inference, occupied port, timeout and native failure receipts. Native checks use Dummy audio: no human listening claim.

The label-worker proposal was reviewed by six Codex roles and rejected for implementation until trigger provenance, containment, atomic claims, source-bound review and total-deadline requirements are concrete. No job has been installed or fired. Codex role diversity is not independent model-provider evidence. Human merge and daily Discussion submission remain separate pending steps.
