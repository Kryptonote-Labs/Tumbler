# Tumbler CLI

Requires Bun 1.3 or later. Install with `bun add --global @tumblerjs/cli`.
Supports Word `.docx`, presentation `.pptx` operations, and PDF page export/deletion. The package is public and included in the release graph.

```sh
tumbler create draft.docx
tumbler draft.docx read
tumbler draft.docx format --page '<handle from read>' --find 'draft' --strike
tumbler draft.docx replace --page '<refreshed handle>' --find 'draft' --value 'final'
tumbler draft.docx inspect --input '{"what":"styles"}'
tumbler draft.docx style --page '<handle>' --target '{"text":"Report"}' --input '{"styleId":"Heading1"}'
tumbler draft.docx --help
```

## Delete PDF pages

```sh
tumbler report.pdf pdf delete-pages 2,4-6
tumbler report.pdf pdf delete-pages --help
```

Deletes the selected pages in place. Numbers start at 1 and refer to the original
PDF; ranges include both endpoints. Remaining pages keep their original order.
Descending ranges are accepted. Invalid, out-of-bounds, duplicate or overlapping
selections fail without writing, as does deleting every page. The file host uses
a sibling `.tumbler-lock` and atomic replacement, preserving file permissions.
Documents with structures the extractor cannot retain (including document-level
attachments, metadata, page labels, or trailer Info) are rejected without changing
the original file.
It rebuilds the PDF without removed page streams or historical revisions; shared
resources may remain, so this is not content redaction. Keep a copy if you need
the original. Injected hosts implement optional `deletePdfPages(document, {pages})`
and own permission checks and storage. Success returns `deletedPages` (original
1-based numbers in ascending order) and the remaining `pageCount`.

## Export PDF pages

```sh
tumbler source.pdf export --pages 2-5,8 --output selected.pdf
tumbler source.pdf export --pages 8,3-5,2 --format pdf --output reordered.pdf
tumbler source.pdf export --help
```

`--pages` uses 1-based page numbers and inclusive ranges, in exactly the order written.
For example, `8,3-5,2` exports pages 8,3,4,5,2. Descending ranges such as `5-3`
export 5,4,3. Repeated pages and overlapping ranges are rejected, as are missing,
invalid or out-of-bounds pages. The output must be a new `.pdf` file; existing files
are never overwritten. The original stays unchanged. Extraction copies text, images
and vector graphics without rasterizing and excludes unselected page streams and
original revisions. Stdout returns JSON with the output path, format, page order and count.

Injected hosts implement optional `exportPdf(document, {pages, output, format})`;
`pages` retains the selection string so the host can validate against its source page count
and expand ranges in the written order. Unsupported hosts return an availability error.

## Shared operations

`@tumblerjs/word/operations` owns the 21 typed operation definitions, schemas, examples and
execution. The CLI generates help and dispatches every operation through
`host.operate(document, {page, target, operation})`. Simple `format` and `replace` flags translate
to that same contract. Use `<operation> --help` for its structured input example.

The registry covers character and paragraph formatting, styles, lists, breaks, page fields,
real tables, proportional table fitting, scoped literal replace-all, images, shapes, chart
titles and ink. `edit-object` changes inspected object properties and geometry; `move-object`
moves an object within a read page. Geometry uses points. Paragraph spacing uses twips.
For images, the file host resolves `image.id` as a local PNG/JPEG path; injected hosts resolve
their own asset IDs. `fit-table` uses the actual containing page column or nested table cell.

`inspect` returns styles, objects, regions or geometry. Object inspection includes UTF-16
ranges and editable attributes. Use its continuation offset for further objects. `read` exposes
text, character attributes and table/cell identities. Targets are unique text matches with
optional surrounding `within` text, UTF-16 ranges, or table/cell identities. Unknown inputs,
ambiguous matches and stale pages fail before writing.

Use `read-image --input '{"id":"<image.id>","region":"body"}'` with an ID from read or
object inspection to read an embedded image. The file host returns the original bytes as
base64 `data`, their MIME `type` and image properties. Injected hosts implement optional
`readImage` and can deliver pixels separately to a visual model. `readWordImage` resolves a
live image reference and any retained package bytes; hosts resolve uploaded assets themselves.
Image reads describe the image itself, without page layout, cropping or overlaid objects.

## Files and stories

```sh
tumbler draft.docx inspect --input '{"what":"regions"}'
tumbler draft.docx read --region header:0:default
tumbler draft.docx page-number --page '<header handle>' --target '{"kind":"range","start":0,"end":0}' --input '{"preset":"page-x-of-y","alignment":"right"}'
```

Regions include `body`, existing story part paths, and `header:<section>:<type>` or
`footer:<section>:<type>` aliases. Sections are zero-based; types are `default`, `first`, `even`.
Reading a missing story stages it in memory. Only an accepted edit creates it on disk.
Story edits preserve the main body and unrelated package parts.

Reads use bounded transport pages and return a continuation offset, without constraining
paragraph or document size. File edits require the content-hash page handle returned by read;
they return a refreshed page. The file host reconciles edits through the Word engine, retains
untouched package content and uses atomic replacement with a sibling `.tumbler-lock` file.
Other writers must honor that lock for mutual exclusion. A crash may leave a lock requiring
manual removal after confirming its writer has stopped.

## Injected hosts

`runTumbler(argv, {host, stdout, stderr, commandName})` runs the same parser and validation
against an injected host. Hosts implement `read`, `create` and `operate`; optional `inspect`,
`select` and `unselect` support inspection and visible live cursors. File hosts reject cursor
commands. Live reads can accept captured anchor targets in addition to numeric offsets.
Hosts enforce permissions, revisions, asset resolution, receipts and commit boundaries.
`createWordOperations` accepts host-specific command validation. `openWordOperationDocument`
adapts DOCX files to the same operations and reconciles against their source package.

The Word registry does not include sheets or document section-layout authoring. Presentation commands use the separate `slides` namespace below.

## Replacement text

`replace --value` decodes `\n`, `\r`, `\t` and `\\` once. Existing line breaks and unknown
escapes are preserved. Use ordinary shell single quotes around escaped text. Add `--literal`
to preserve every backslash. This decoding applies only to the `--value` flag; structured
`--input` JSON is parsed as JSON without an additional escape-decoding step. Search targets
remain literal.

```sh
tumbler draft.docx replace --page '<handle>' --start 0 --end 0 --value 'First line\nSecond line'
tumbler draft.docx replace --page '<handle>' --find old --value 'C:\new\test.java' --literal
tumbler draft.docx replace --page '<handle>' --start 0 --end 0 --value-file - <<'EOF_TEXT'
public class HelloWorld {
    // Quotes, backslashes and indentation stay as written.
}
EOF_TEXT
```

`--value-file path` reads UTF-8 text; `--value-file -` reads stdin. These preserve content exactly,
including trailing newlines, and cannot be combined with `--value` or `--literal`. Injected
hosts implement `readValue(path)` to supply files and stdin from their own environment.

### Discovering operations

`--help` lists the live operation registry. `<document> <operation> --help` is
local and does not open a document. It explains targets, input fields and enum
choices, units, and examples. Custom document values carry field descriptions
alongside the generated input schema. `edit-object --help` includes a recipe for
changing an existing drawing between inline, in front of text, and behind text,
with page-fixed or text-relative positioning. `read`, `inspect`, `select`, and
`create` also have dedicated help.

Embedders can use `tumblerCapabilities()` for a registry-derived capability
overview and `tumblerOperationHelp(name, commandName)` for detailed help. Host
permissions and supported document types still apply.

Visual hosts can implement `render(document, {page})` for `tumbler <document> render --page 3`.
Page numbers are 1-based and default to 1. Rendering is read-only. Hosts own the renderer and
image delivery; file hosts without one report that rendering is unavailable. A rendered page
shows the document layout, whereas `read-image` reads an embedded image's original pixels.

## Presentations

```sh
tumbler create deck.pptx
tumbler deck.pptx slides read
tumbler deck.pptx slides insert-object --help
tumbler deck.pptx slides insert-object --page '<read-handle>' --input '{"slideId":"256","bounds":{"x":80,"y":100,"width":400,"height":100},"object":{"kind":"shape","text":"Quarterly review"}}'
```

`slides read --slide <id>` selects a slide. Editing commands are generated from
the slides package's validated command union; help does not open a document.
File reads return a content-hash page handle. Writes require that handle, retain
the sibling-lock convention and replace the file atomically. Hosted integrations
implement `readPresentation` and `operatePresentation` on `OperationHost` to use
the same syntax with their own permissions, revisions and durable receipts.

Find PDF text with the same search engine used by the viewer:

```sh
tumbler report.pdf pdf find 'invoice number'
tumbler report.pdf pdf find 'Invoice' --match-case --pages 2-8
```

`--pages` accepts one-based pages and inclusive ranges, including comma-separated
lists such as `1,3-5`. JSON output contains `matches` and `total`. Matches include
the page number, matched text, surrounding context, and rectangles in page points
with a top-left origin. Wrapped phrases return multiple rectangles. Search is
literal, includes existing OCR text, and leaves the file unchanged.

### Merge PDFs

```sh
tumbler first.pdf pdf merge --pages 3,1-2,1 --source second.pdf --pages 2-1 --source first.pdf --pages 4 --output merged.pdf
```

Sources are read in command order. `--pages` and `--password` apply to the most recent source (initially the positional PDF). Omit `--pages` to include every page. Selections use one-based numbers, comma lists, inclusive ranges in either direction, and repetitions. Repeat `--source` to interleave blocks from any document. `--password` unlocks an encrypted input; the new PDF is unencrypted. The output must end in `.pdf` and must not exist. Inputs remain untouched and publication occurs only after the complete output has been written.

The shared `@tumblerjs/pdf` merge API also powers the Svelte docs PDF merge playground. Both interfaces use the same page-selection rules and preservation checks. See the PDF package README for document structure support and limitations.
