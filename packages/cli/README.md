# Tumbler CLI

Requires Bun 1.3 or later. Install with `bun add --global @tumblerjs/cli`.
Word `.docx` is the supported engine. The package is public and included in the release graph.

```sh
tumbler create draft.docx
tumbler draft.docx read
tumbler draft.docx format --page '<handle from read>' --find 'draft' --strike
tumbler draft.docx replace --page '<refreshed handle>' --find 'draft' --value 'final'
tumbler draft.docx inspect --input '{"what":"styles"}'
tumbler draft.docx style --page '<handle>' --target '{"text":"Report"}' --input '{"styleId":"Heading1"}'
tumbler draft.docx --help
```

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

Sheets, slides and document section-layout authoring are not implemented by this registry.

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
