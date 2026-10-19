# Tumbler CLI

Run with Bun. Word is the first supported engine.

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

This package is private while the CLI contract is being validated.
