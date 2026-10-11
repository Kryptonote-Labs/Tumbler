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

Browser tasks remain untested until browser evidence exists. No headless task
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
