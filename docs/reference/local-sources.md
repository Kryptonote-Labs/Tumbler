# Local source archive

The tracked reference notes in this directory are designed for everyday work.
When exact wording, schemas, or an obscure extension is needed, Tumbler can also
maintain a private local copy of the official sources.

Fetch it with:

```sh
bun run references:fetch
```

The command creates the ignored `docs/reference/vendor/` directory containing:

```text
vendor/
├── downloads/          # original source archives
├── raw/
│   ├── ecma/           # official PDFs, XSD/RELAX NG, geometry and style resources
│   └── microsoft/      # Microsoft Standards Support bundle
├── markdown/
│   ├── ecma/           # searchable text extraction of ECMA-376 Parts 1–4
│   └── microsoft/      # searchable OOXML extension/implementation specifications
└── source-manifest.sha256
```

The Microsoft Markdown selection includes DOCX, XLSX, PPTX, DrawingML,
implementation notes, shared extension lists, macro-enabled formats, Office web
extensions, comments/reactions/tasks, and Custom UI specifications. The complete
download remains available under `raw/` for cross-references.

## Repository policy

Everything below `vendor/` is ignored. Do not force-add it. The source documents
retain their original copyright and licensing terms, and the generated Markdown
is only a local text extraction for engineering search.

The fetch script and our authored summaries are tracked so another developer can
recreate the archive. The checksum manifest records the exact bytes fetched
locally, which matters because Microsoft updates its latest Standards Support
bundle over time.

Before quoting, redistributing, or deriving generated code from a source, inspect
its included permission notice and record the exact version used.
