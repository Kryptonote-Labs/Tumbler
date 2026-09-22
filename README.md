# Tumbler

Read, render, and edit Word documents, spreadsheets, and PowerPoint presentations
in the browser. Use the headless TypeScript packages with your own UI, or add the
Svelte 5 components.

[Documentation](https://tumbler.alexco.dev/) ·
[Playground](https://tumbler.alexco.dev/playground) ·
[Compatibility](https://tumbler.alexco.dev/docs/compatibility)

Tumbler edits OOXML directly. Your application owns file loading, navigation,
storage, and downloads. No hosted Office editor or PDF conversion is required.

> Tumbler is early alpha. APIs and format coverage are still changing. Keep
> original files and test edited documents in the Office applications you use.

## Install

Install the format packages you need:

```sh
bun add @tumblerjs/word @tumblerjs/sheets @tumblerjs/slides
```

For Svelte components, also install:

```sh
bun add @tumblerjs/svelte @tumblerjs/core
```

Releases use the default `latest` tag, including alpha versions. Keep Tumbler
packages on the same release.

## Open, edit, and save

This spreadsheet example reads a browser File, changes a cell, and creates the
edited workbook bytes:

```ts
import { openSpreadsheetArtifact } from "@tumblerjs/sheets";

const bytes = new Uint8Array(await file.arrayBuffer());
const workbook = openSpreadsheetArtifact(bytes);
const edited = workbook.editCell("B2", 42);
const output = edited.bytes();
const blob = new Blob([output], {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
```

Artifact edits return a new artifact. Editing sessions add undo and redo.
Call `bytes()` when saving or downloading, rather than after every interaction.

## Choose a format

| Format | What you can do | Guide |
| --- | --- | --- |
| Word `.docx` | Render pages, edit and format text, move and resize supported drawings, undo and save. | [Word documents](https://tumbler.alexco.dev/docs/word) |
| Excel `.xlsx` | Render a virtualized grid, edit cells and supported formulas, format ranges, and save. | [Spreadsheets](https://tumbler.alexco.dev/docs/spreadsheets) |
| PowerPoint `.pptx` | Navigate thumbnails, edit text and table cells, format shapes, move, resize and rotate supported objects, undo and save. | [PowerPoint](https://tumbler.alexco.dev/docs/powerpoint) |

Format coverage is incomplete. See [compatibility](https://tumbler.alexco.dev/docs/compatibility)
for limitations, including unsupported editing operations and differences from
Office layout. Legacy binary `.doc`, `.xls`, and `.ppt` files are not supported.

## Packages

| Package | Responsibility |
| --- | --- |
| `@tumblerjs/opc` | ZIP package parts, content types, relationships, and atomic writes |
| `@tumblerjs/ooxml` | Loss-aware XML, namespaces, compatibility, themes, and shared metadata |
| `@tumblerjs/formulas` | Headless spreadsheet formula parsing and bounded calculation |
| `@tumblerjs/charts` | Headless DrawingML chart semantics and deterministic layout |
| `@tumblerjs/core` | Format-neutral selection, formatting contracts, and sparse geometry |
| `@tumblerjs/sheets` | SpreadsheetML reading, calculation, preservation, and editing |
| `@tumblerjs/word` | WordprocessingML reading, page layout, preservation, and editing |
| `@tumblerjs/slides` | PresentationML reading, slide scenes, preservation, and editing |
| `@tumblerjs/svelte` | Replaceable Svelte document heads |

## Develop

```sh
bun install
bun run dev
```

The docs and playground run against the source packages. The dev server listens
on all interfaces for LAN access.

```sh
bun run check
bun run docs:check
bun test
bun run docs:test
```

See [the docs app guide](apps/docs/README.md) for browser tests and sample generation,
and [CONTRIBUTING.md](CONTRIBUTING.md) for release qualification and publishing.

## Engineering references

- [Architecture](docs/architecture.md)
- [Standards and compatibility](docs/standards-and-compatibility.md)
- [Spreadsheet implementation](docs/spreadsheetml-implementation.md)
- [Word implementation](docs/wordprocessingml-implementation.md)
- [PowerPoint implementation](docs/presentationml-implementation.md)
- [Testing](docs/testing.md)
- [Roadmap](docs/roadmap.md)
- [OOXML references](docs/reference/README.md)

Report security issues according to [SECURITY.md](SECURITY.md).
Tumbler is available under the [MIT License](LICENSE).
