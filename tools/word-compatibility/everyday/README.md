# Everyday document benchmark v1

This benchmark asks which published document tasks have executable evidence. It
is separate from exhaustive standards qualification. Neither score estimates the
probability that an arbitrary document will work, and no score is calibrated to
an assumed 80% level of support.

The inventory has 42 tasks: six each for formatting, editing, structure, content,
viewing, rendering and round-tripping. Every task has equal weight. The overall
score is verified tasks divided by all 42; category scores expose uneven support.
Choosing these tasks and their weights is editorial judgment, not a measured
frequency distribution of Word usage. Related tasks can share evidence; they are
not statistically independent samples. A task pass means its published acceptance
criteria passed, not every possible behaviour suggested by its short title.

## Evidence

Each task lists its layer and explicit requirement IDs. All mapped requirements
must pass. Any failure wins; otherwise missing evidence is untested, unavailable
oracles are blocked, and only all-passing requirements earn credit. Empty mappings
remain untested. Existing evidence is reused where its assertions match the task;
ordinary test counts or implementation presence do not earn credit.

The two additional journeys exercise public headless APIs:

- A letter: replace the meeting day, undo/redo, format the heading, save/reopen and
  round-trip through LibreOffice, asserting text, alignment, heading size/emphasis
  and unchanged body formatting. SDK acceptance is required too.
- Meeting notes: split and rejoin paragraphs, preserve adjacent Unicode text,
  undo exactly, redo and validate saved intermediate/final packages with the SDK.

Browser tasks receive credit only from executed browser evidence. No headless task
claims keyboard, clipboard, painting or Kryptonote integration coverage. Render
references currently use synthetic glyph widths and qualify only the stated page
geometry and vertical advances. See ../render/README.md for their boundaries.

## Reports and scope

The normal compatibility CLI emits both benchmarks in report.json, report.md and
report.html. The HTML lists every task, criterion, evidence mapping and status.
GitHub comment summaries include the category table once this commenter code is
on the default branch. Older base summaries remain readable; unavailable benchmark
deltas are labelled unavailable. A changed task definition or evidence contract
suppresses comparisons instead of presenting a percentage gain as progress.

The lock pins task identities, criteria, categories, layers and the denominator.
Adding executable mappings within this inventory is allowed. Altering the inventory
requires a new benchmark version and an explanation; CI checks the previous lock.
Do not remove difficult or failing tasks, narrow their meaning or split successes
into more tasks to raise the score. Future versions should use documented product
usage or a reviewed representative corpus to improve task selection and weighting.

The current score is a lower bound on demonstrated tasks within this inventory.
The most useful next additions are browser editing/selection, lists, headers and
footers, images, and the multi-page report journey, all already in the denominator.

## Direct capability measurements

The CLI also attempts the remaining 26 task contracts. Five headless probes cover
list operations, table changes, header/footer editing, image insertion/resizing,
and the full font/colour/highlight task. Saved passing headless fixtures require
SDK validation. Seven Playwright probes exercise the local playground: typing,
clipboard, find/replace, scrolling, zoom, selection and outline navigation.
Browser JSON, logs, screenshots and failure traces are kept under the report's
`everyday/` directory. This uses the repository's documented Chromium test workflow.

The remaining fourteen tasks have explicit audited blockers in `blockers.ts`.
Their records include the missing prerequisite and hashes of the inspected source
files. These are **not executed feature passes**: they require a supported edit
adapter, an independent rendering reference, a combined report fixture, or an
isolated Kryptonote runner. They remain in the denominator with zero credit. A
blocked adapter is not proof that every lower-level path is impossible.

Task failures are measured capability gaps, not expected-test passes. In particular,
UI absence and lost rich clipboard formatting are reported as failed. New UI
availability alone cannot turn a discovery probe green: replacement/navigation
behaviour assertions must be implemented first. The ordinary docs regression suite
is separate from this capability suite (`apps/docs/everyday.config.ts`).

The default CLI records capability failures without treating pre-existing missing
product capabilities as build failures. The eight newly verified probes are required
by `required-probes.ts`; missing, blocked or failing results for those probes fail CI.
Existing standards failure gates are unchanged. Use `--require-everyday` to require all 42 tasks to pass and exit nonzero
for any failed, blocked or untested task. CI installs Chromium and runs the
measurements, and the comment/report tables display all outcomes. The required-probe list can grow as additional task contracts are verified; it does
not alter task outcomes or award credit to the known failures.
