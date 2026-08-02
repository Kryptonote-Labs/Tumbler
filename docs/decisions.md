# Decisions and open questions

This is a lightweight decision log. Settled direction can change, but changes
should be explicit so the architecture does not drift silently.

## Settled direction

### Tumbler covers the OOXML Office family

Scope includes DOCX, XLSX, and PPTX. The project is not a spreadsheet library
with later formats bolted on.

### Formats are implemented sequentially

Shared foundations consider all three formats, while feature implementation
takes one format through coherent vertical slices at a time.

### Preview is native client-side rendering

The product representation is an interactive component tree and rendering
surface controlled by Kryptonote. It is not a PDF, image conversion, iframe, or
third-party hosted editor.

### Editing is a first-order requirement

Read-only preview must lead naturally to commands, selection, history, saving,
and focused round-trip preservation. Rendering architecture cannot assume the
document is disposable.

### The UI is replaceable

Tumbler's core is headless. Kryptonote gets a first-party Svelte head and owns
all visible UI. Svelte does not leak into parsing or editing packages.

### Unsupported content is preserved

Recognized, rendered, and editable are different support levels. Unknown or
unsupported content must survive unrelated edits whenever structurally possible.

### Testing is a product component

The testkit combines standards requirements, validators, existing corpora,
property testing, fuzzing, package preservation, external consumers, visual
regression, and performance budgets.

### The working project name is Tumbler

Tumbler.js identifies the TypeScript implementation. Current work remains a
private local monorepo with no registry package or remote repository.

### Public APIs wait for evidence

The workspace boundaries are intentional, but source entry points remain empty
until the first vertical slices reveal durable types.

## Candidates requiring prototypes

- `fflate` or another browser ZIP implementation.
- A SAX/token XML parser beneath a Tumbler-owned loss-aware tree.
- TanStack Table and TanStack Virtual for spreadsheet UI infrastructure.
- `fast-check` for property-based generation and shrinking.
- DOM/SVG/Canvas mixtures for each format head.
- Web Worker division between package parsing, format parsing, layout, and UI.

Candidates must be judged on preservation, performance, bundle size,
typesafety, maintenance, licensing, and whether they leave Tumbler in control of
its core behavior and UI.

## Open product and engineering questions

### Format order

Which of Word, spreadsheets, or presentations should be the first production
vertical slice?

### Initial compatibility target

Which Microsoft Office versions, LibreOffice versions, browsers, and operating
systems form the first declared matrix?

### First editable feature set

What is the smallest editing capability for the first format that is genuinely
useful inside Kryptonote and exercises focused serialization?

### Layout fidelity policy

How should the UI communicate font substitution or partially faithful layout
without filling the interface with technical warnings?

### External revision behavior

When an agent produces a new file revision while the user has unsaved local
edits, should Tumbler reload, prompt, replay commands, or attempt a structured
merge?

### Formula calculation

Should the spreadsheet package initially preserve formulas and cached values,
integrate an existing calculation engine, or build a limited engine around the
first supported formula set?

### XML representation

Can an existing parser expose enough token/source information for focused edits,
or does the loss-aware representation require a purpose-built layer?

### Rendering primitives

Where should each format use DOM, SVG, Canvas, and overlays? Prototypes must test
editing behavior, accessibility, fidelity, virtualization, and memory rather
than judging static screenshots alone.

### Save policy

When is byte-identical preservation mandatory, and when may the writer
canonicalize a changed XML part? The answer must remain observable in tests.

### Packaging and publication

If the project becomes OSS, should Svelte heads be split by format, which package
scope can be reserved, and which license best protects broad adoption and
contribution?

### Standards data licensing

Which official schemas and derived metadata may be redistributed, and which
should be downloaded or generated during development?

## Explicitly deferred

- Real-time multi-user collaboration.
- Full formula-engine parity.
- Macro execution.
- Legacy binary `.doc`, `.xls`, and `.ppt` formats.
- ODF editing.
- A React or Vue head.
- Server-side rendering as a product dependency.
- Public package publishing and API stability guarantees.

Deferral does not forbid future work. It prevents these concerns from distorting
the first safe, useful vertical slices.
