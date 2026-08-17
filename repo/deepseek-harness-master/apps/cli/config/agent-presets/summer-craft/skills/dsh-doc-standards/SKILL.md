---
name: dsh-doc-standards
description: 'Use when writing, moving, reviewing, or auditing documentation in any repository — choosing hierarchy and detail, separating tutorials from references, checking tutorial progression, trimming doc slop, or responding to requests like "improve the docs", "audit the docs", "where should this be documented", or "this doc is too long".'
---

# Documentation Standards (通用版)

**This skill is guidance, not a script.** It applies a documentation hierarchy and quality standard to any repository's docs: Markdown, README files, JSDoc/docstrings, and code comments. It does not depend on any specific repository's tooling; where a check names a project-specific command, substitute the project's equivalent or apply the principle directly.

## Review structure before prose

Apply the authoring order to every human-facing document in scope:

1. **Locate the document** in the repository and navigation trees. State its own subject and identify its direct children.
2. **Set the permitted level of detail.** Keep full detail about the document's subject, summarize direct children by purpose and high-level behavior, and move deeper explanations to their owning descendants with links.
3. **Classify by intended use, not path or title.** A tutorial must lead through ordered work to an observable outcome; a reference must support lookup within an explicit scope without requiring sequential reading.
4. **For a tutorial**, classify the starting reader (beginner / intermediate / advanced), trace each concept to its prerequisites, reorder premature material, and move optional advanced detail to a later tutorial or reference.
5. **Split substantial mixed forms.** Put a small secondary form in a clearly labeled section; promote genuinely separate audiences to their own documents.

## Prose quality checks

- **Accuracy**: every statement matches the current code, config, defaults, and behavior. Flag stale docs before adding new ones.
- **Concision**: keep every load-bearing rule — preferably one to three lines plus a link to its rationale. Cut stories, duplication, status notes, and narration. Length alone is not a defect.
- **Placement**: documentation lives next to what it documents (README beside the module, JSDoc on the API). A fact belongs in one authoritative home; other copies become links.
- **Discoverability**: a reader can find the document from the repo README or navigation tree, and inbound links resolve.
- **Audience fit**: tutorials for beginners do not assume undocumented jargon; references for experts do not re-teach basics.
- **Generated content**: generated catalogs and API listings are never hand-edited; change the generator's source instead.

## Trimming doc slop

Hunt and remove:

- **Reasoning-transcript leakage** — narrated history, dead design-session citations, review choreography, control-flow narration, test walkthroughs. Preserve only a non-obvious contract or durable rationale.
- **Duplication** — the same explanation repeated beside sibling methods or in multiple docs; keep one home and link the rest.
- **Hand-written catalogs** — test/status inventories and JSDoc restatements that an authoritative tree, script, or generated reference already provides.
- **Future-tense spec language** in shipped docs — convert promises to current state or move them to a changelog/roadmap.

## Validation and hygiene

- Run the repository's doc checks (e.g. link checkers, markdown lint, `git diff --check`).
- JSDoc changes may regenerate catalogs — run the generator if the project has one.
- When a document changes, verify inbound links from Markdown and code comments still resolve; a move is atomic (remove old home, add new home, fix every inbound link in the same change).
- For a PR or commit touching docs, report word deltas and explain any deliberately long exception.

## Responding to doc requests

- "improve the docs" → structural pass first, then prose quality, then slop trimming.
- "audit the docs" → the full checklist above across the corpus, reported per document.
- "this doc is too long" → apply step 2 (level of detail) and slop trimming; only then consider splitting.
- "where should this be documented" → classify the content (tutorial vs reference) and name the owning document.
