# Day4 bounded documentation worker

This implements one enrolled GitHub-label job in `ci/doc_worker.py`. It is a local, bounded observer for this repository and one fixed README task. It does not install a recurring service or accept arbitrary coding tickets. This document describes the implementation; a live run is established only by its dated event, PR and test/review receipts.

## Model and controller boundary

The local qwen3:8b model receives only the fixed ticket, pinned README and project instructions. It has no shell, filesystem, credential, HTTP or other tool interface. It returns a private planning rationale and an ordered list of three fixed commands. The rationale is never copied into the README. All published prose and review caveats come from trusted controller constants; only validated fixed command strings are selected by the plan. Other fields, commands and control characters are refused. Generated content is never executed.

GitHub, Git, Qodo and test commands belong to the trusted controller. It uses fixed argument lists and JSON body files, an independent clone with no hardlinks, disabled Git hooks, and cleared inherited Git execution configuration before checkout. No credentials are copied into the clone or sent to the model. This is capability restriction of the model, not an operating-system sandbox for the trusted controller.

## Prerequisites and enrollment

Use a trusted POSIX checkout of the committed/pushed `codex/day4-worker` branch. Python 3.10+, Node, Git, authenticated gh/Qodo, lsof and Ollama with the existing qwen3:8b weights are required. The worker never downloads a model. Ports8772 and11435 must be free; it refuses to use a pre-existing model listener. Ordinary regression tests never contact a model.

The first task adds missing README handoff instructions for existing native-receipt/review-gate safety tests and the mandatory human reviewed-base/control assessment. The exact title/body are emitted as JSON:

```sh
mkdir -p .qa-output
python3 ci/doc_worker.py ticket > .qa-output/day4-ticket.json
```

Create an issue in this repository with that exact title/body, initially without ready-for-agent. Enroll its number from the trusted branch:

```sh
python3 ci/doc_worker.py enroll --issue ISSUE_NUMBER
```

Enrollment pins the issue body, repository owner, controller code, base commit, README and AGENTS hashes. An existing enrollment is refused. A prior per-issue claim is never silently retried; explicit human reconciliation is needed after failure.

## Observe and fire

Start the independent observer before adding the label:

```sh
python3 ci/doc_worker.py observe --enrollment .qa-output/doc-worker/enroll-ISSUE_NUMBER.json --wait 120
```

Wait for its READY receipt, then wait beyond the startup second and add ready-for-agent to the enrolled issue. The host clock must be accurate. Historical events, the startup second, another actor/label, removed labels, changed issue/body/base/rules and existing branch/PR/claim are refused. The observer handles one fresh event or stops at its deadline; no new session prompt invokes the job when the event arrives.

## Executed path and limits

After accepting a fresh event, the controller atomically claims the issue and verifies its identity again. It clones the pinned source independently, asks Qodo Wisdom for the exact README revision, compares the returned source, and calls its owned model service on loopback11435. Before sending a prompt, the controller connects once and verifies via the OS socket table that the reverse established connection belongs to its live child server. Auto-reconnection is disabled, so a replacement listener cannot inherit the proved connection. That server receives no GitHub/Qodo credential environment and is stopped after authoring, including failure. The original SoundRig authoring service on11434 is not used.

Only the bounded README insertion may differ. The controller runs the full isolated offline app suite, then Qodo Local Reviewer on the uncommitted README with task context. Coverage must be complete with no open findings. The reviewed Git tree must exactly match the staged and committed tree; source and trigger identities are checked again before publication. This first pilot has zero autonomous repair attempts: any finding or incomplete result stops for human investigation rather than expanding model capabilities.

Before network writes, receipts record publication intent. A lost push, PR-creation or review-comment response remains explicitly unknown, with branch/commit or request-body identities for human reconciliation; the worker does not retry ambiguous writes. An acknowledged review comment records its GitHub ID and URL. It creates one draft PR on its own branch, requests actual Qodo review, collects current-head Qodo and both CI jobs, and runs the source-aware collector to decode the current merge receipt. Only the known human base-review stops may remain before the job reports awaiting_human_review. No merge, deployment, finding dismissal or Discussion submission occurs.

One monotonic30-minute deadline includes startup, polling, authoring, tests, review, publication and cleanup. Each child gets22 seconds before forced termination, exceeding the nested CI runner's20-second worst-case cleanup. A50-second reserve covers the maximum two active direct children (the owned model server and one command), including final kill waits. Commands use bounded captured output and owned process groups. Failures preserve nonpassing receipts. There is no claim of a productivity, latency, listening-quality or model-quality gain.

## Verify and inspect

```sh
python3 ci/test_doc_worker.py
```

The fixture-only tests cover enrollment/actor/body/label checks, fresh and startup event controls, duplicate/symlink claims, hostile model output, missing/partial Qodo evidence, deadline/source drift before publication, ambiguous PR creation after a push, output limits, resistant descendants, nested graceful cleanup and inherited Git execution configuration. GitHub CI runs these tests with the existing runner/receipt/gate tests and all31 app suites; native Godot is a separate job.

Private receipts are under .qa-output/doc-worker/run-*/receipt.json. Inspect the event ID, cutoff/watermark, base/rules/controller/diff/tree identities, phase durations, local and PR reviews, decoded CI collector and publication state. Model metrics report local inference tokens/time; OS child RSS is not aggregate/GPU peak memory. Do not publish private-error or private-model-server logs. The separately curated submission packet is the publication artifact.
