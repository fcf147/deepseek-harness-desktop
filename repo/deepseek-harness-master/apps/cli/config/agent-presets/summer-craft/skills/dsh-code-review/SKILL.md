---
name: dsh-code-review
description: Use when reviewing code changes in any repository — after a commit, a batch of edits, or before pushing — to produce a structured, prioritized review covering correctness, lifecycle, security, tests, and docs. Invoke whenever the user asks to "review the changes", "check my diff", "审一下代码", or at the end of a change task.
---

# Code Review (通用版)

**This skill is guidance, not a script.** It produces a review of the current working-tree changes (or a named diff range) against generic software-engineering standards. It does not assume any specific repository's internal tooling; adapt the checks to the project at hand. Prioritize correctness, security, lifecycle, and broken required behavior over style; a short review with one substantiated blocker beats a list of nits.

## What to review

- **The diff**: `git diff` (unstaged) and `git diff --cached` (staged), or `git diff <base>..<head>` when a range is named. If the change is large, read it in subsystem order and read enough surrounding code to understand the design.
- **Intent**: compare the implementation against what the user asked for, the issue/PR description, or the previous behavior. Flag drift between intent and implementation.
- **The whole change**: not just added lines — deletions, renames, and untouched adjacent code that the change makes stale or wrong.

## Blocking requirements

1. **Correctness**: the change does what it claims for the normal path and for edge cases (empty input, singular/plural, boundary values, concurrent access, failure paths). If it cannot be reasoned about locally, the test must cover it.
2. **Lifecycle and resource ownership**: every acquired resource (handle, connection, subscription, timer, child process, temp file) is released on success, error, and teardown. Async operations handle cancellation and late arrival. No leaks on the happy path or the error path.
3. **Security**: input from untrusted sources (user input, network, files, environment) is validated or escaped before use in queries, shell commands, paths, or output. No secrets (tokens, keys, passwords) are logged, committed, or exposed.
4. **Tests**: the change adds or updates tests for new behavior, and existing tests that should break do break. Tests assert external observable state, not implementation restatement.
5. **Docs match the code**: config, defaults, wire fields, error messages, and public behavior update the README/JSDoc/docstrings in the same change. Comments state non-obvious contracts, not narration.

## Manual checks

- **Interface contracts**: trace both sides of every changed function/API. Confirm errors, return values, and ownership match the caller's expectations.
- **Concurrency and async**: for async code, check races before publication, cancellation during awaits, independent error reporting, and quiescent disposal.
- **Necessity and scope**: challenge unrelated changes, speculative generality, and dead code. Ask what current consumer or evidence supports each new option, default, or abstraction.
- **Compatibility**: the change does not silently break existing callers, config files, or data formats without a documented migration.
- **Performance**: no accidental quadratic behavior, no work repeated in a loop that could be hoisted, no unbounded memory growth.
- **Logging and diagnostics**: errors are logged with enough context to diagnose; sensitive data is not logged.
- **Naming and clarity**: names describe the concept; control flow is readable; complex logic has a comment explaining why, not what.

## Reporting

Produce the review as:

1. **Blockers** (must fix before merge): each with location, defect, impact, and evidence.
2. **Should-fix** (worth fixing in this change): same structure, lower severity.
3. **Nits / suggestions** (optional): style, naming, minor robustness.

For each finding, state the location (file:line), what is wrong, why it matters, and what to change. If the review is clean, say so explicitly and note what was checked. Keep the review in the same language the user is using.
