# Tumbler CLI

Requires Bun 1.3 or later. Word is the first supported engine.

Install with `bun add --global @tumblerjs/cli`.

```sh
tumbler create draft.docx
tumbler draft.docx read
tumbler draft.docx format --page '<handle from read>' --find 'draft' --strike
tumbler draft.docx replace --page '<handle from refreshed page>' --find 'draft' --value 'final'
```

`runTumbler(argv, { host, stdout, stderr })` runs the same registry and validation against
an injected host. The file host checks a content-hash page handle before each edit, retains
untouched package content through the Word engine, and writes using atomic replacement.
Concurrent CLI writes use a sibling `.tumbler-lock` file. Other file writers must honor
that lock for mutual exclusion. A crash may leave a lock requiring manual removal after
confirming its writer has stopped.

Reads use UTF-16 offsets and return a continuation offset. File reads currently cover the
body, including table paragraphs; live hosts may support additional regions. A target
must be unique within its read page. `--within` narrows an exact match using surrounding
text. Unknown flags and ambiguous targets fail without writes. Use `--help` for flags.

Shared Word operations use structured inputs:

```sh
tumbler draft.docx style --page '<handle>' --target '{"text":"Report"}' --input '{"styleId":"Heading1"}'
tumbler draft.docx list --page '<handle>' --target '{"text":"First item"}' --input '{"kind":"decimal","start":1}'
tumbler draft.docx insert-table --page '<handle>' --target '{"kind":"range","start":0,"end":0}' --input '{"rows":[["Name","Value"],["A","1"]]}'
tumbler draft.docx format --help
```

`@tumblerjs/word/operations` owns the typed registry, validation, examples and execution.
Hosts implement `operate(document, {page, target, operation})`; they retain responsibility
for permissions, revision checks and committing the prepared delta. `createWordOperations`
accepts host-specific Word command validation. `openWordOperationDocument` adapts a real
DOCX to the same operations and reconciles edits against its original package.

The registry covers character and paragraph formatting, styles, lists, breaks, page fields,
tables, literal replace-all, shapes and hosted images. File reads expose collaborative
character attributes (`fontSize` is points) and table/cell identities. For file-host image
insertion, image.id is a local PNG/JPEG path; live hosts resolve their own uploaded image IDs.
Headers/footers remain live-host regions. Sheets, slides, drawing manipulation and document
layout settings are not part of this registry yet.
