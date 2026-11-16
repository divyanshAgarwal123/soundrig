# Historical Local Reviewer receipts

These raw records are retained without rewriting their verdicts. `local-docs-incomplete.json` has incomplete coverage and pending introduced findings; it is blocked history, never a clean review. `finding_state.complete` means the finding ledger was enumerated, not that coverage passed or all findings were fixed.

`local-568298a-complete.json` is the later complete text/code review whose file hashes were matched to commit568298a before publication. It does not approve later commits or this added evidence index. LOCAL_REVIEW_INDEX.json records the distinction; current readiness comes from the latest Qodo PR review plus CI and human review of control changes.

`gate-pr5-before-trust-hardening.json` records the earlier checker behavior before contributor/CI-control trust checks were added. It is not current approval: the bootstrap CI PR changes controls and now requires human review.

Completed repair review491445b and documentation-only reviewe145d08 are now preserved verbatim with their exact per-file commit bindings. Read each scope: combining dated scopes is different from a current-head PR review. The original incomplete raw record remains blocked history, unchanged. No pending finding was manually dismissed or marked implemented to publish these receipts.

Pre-commit identity: Local Reviewer records commit_sha as HEAD before publication and tree_sha as the actual uncommitted working tree it reviewed. The491445b ande145d08 raw tree hashes exactly equal their committed Git trees. The568298a raw tree equals its committed tree after excluding the two separately inspected JPEG paths listed in the index. A null file hash in a binding means that path was deliberately deleted and verified absent, not an unknown hash. These checks bind historical reviewed content; they do not approve later code or this clarification.
