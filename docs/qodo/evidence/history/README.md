# Historical Local Reviewer receipts

These raw records are retained without rewriting their verdicts. `local-docs-incomplete.json` has incomplete coverage and pending introduced findings; it is blocked history, never a clean review. `finding_state.complete` means the finding ledger was enumerated, not that coverage passed or all findings were fixed.

`local-568298a-complete.json` is the later complete text/code review whose file hashes were matched to commit568298a before publication. It does not approve later commits or this added evidence index. LOCAL_REVIEW_INDEX.json records the distinction; current readiness comes from the latest Qodo PR review plus CI and human review of control changes.

`gate-pr5-before-trust-hardening.json` records the earlier checker behavior before contributor/CI-control trust checks were added. It is not current approval: the bootstrap CI PR changes controls and now requires human review.
