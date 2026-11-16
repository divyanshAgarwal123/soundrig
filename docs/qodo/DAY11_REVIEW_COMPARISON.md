# Day11: same-code review customization experiment

Verified Day11 release in the organizer email and public GitHub Discussion on November 16, 2026.

PR #4 baseline: head ca8a0e54cd6715321dc88c406250478f6a4db9ee. `day11-before.json` records run 1987032: completed, no findings, review_complete=false. This is a coverage/usability shortfall, not evidence that the source is defective or safe.

Expected product decision: Saved checks is the current measurement; restoring recovery and editing sound data must not reuse earlier PASS rows. Ask review to investigate invalidation, malformed JSON, network failure and contract/project/PCM identity parity with specific source evidence. Missing coverage must remain explicit.

Original setup: Recall preset, five SoundRig-only active rules, and an on-demand router instruction asking for the entire diff. Held constant: same PR head and base, source diff, preset and active rules. New customization: a per-request issues_user_guidelines instruction spelling out those product expectations. It applies only to this review command, not a global preset change. No code change, finding dismissal or merge is authorized by this experiment.

Result: both sessions completed with zero findings and review_complete=false. The head, base and byte-for-byte PR diff stayed identical. The service does not echo effective instructions in this API, so server-side application and causal effect are not independently proven. There is no demonstrated improvement in feedback or display; the missing coverage state remains unhelpful. Keep product context as useful author guidance, but do not rely on it to make an incomplete review complete. The readiness gate stays blocked. See day11-comparison.json and before/after receipts. Official submission thread: https://github.com/orgs/qodo-hackathon/discussions/13 .
