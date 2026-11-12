# Tumbler

Read, render, and edit Word documents, spreadsheets, PowerPoint presentations
and PDFs in the browser. Use the headless TypeScript packages with your own UI, or add the
Svelte 5 components.

[Documentation](https://oss.kryptonote.com/) ·
[Playground](https://oss.kryptonote.com/playground) ·
[Compatibility](https://oss.kryptonote.com/docs/compatibility)

Tumbler edits OOXML directly. Your application owns file loading, navigation,
storage, and downloads. No hosted Office editor or PDF conversion is required.

> Tumbler is early alpha. APIs and format coverage are still changing. Keep
> original files and test edited documents in the Office applications you use.

## Latest release

[Alpha.27](docs/releases/0.1.0-alpha.27.md) includes 12 public packages, published
under `latest`. See the release notes for changes and migration.

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

## TypeScript and runtime requirements

Packages export TypeScript source. Use a bundler or runtime that handles `.ts`
modules. Configure TypeScript with ES2024 library typings, even when emitting
ES2022 JavaScript. This minimal consumer config works with TypeScript 5.9.3:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

For a Word consumer, install `yjs` alongside `@tumblerjs/word`. Although Yjs is
an optional runtime peer, the current public Word entry point also exposes
collaboration types that TypeScript must resolve.

`skipLibCheck` skips declaration-file checks; it does not skip the published `.ts`
sources. An ES2022-only `lib` therefore fails on newer built-in APIs. `target`
controls syntax emission and can remain ES2022. `lib` supplies typings only;
neither setting installs polyfills or rewrites calls to newer built-ins.

The runtime must provide `String.prototype.isWellFormed`,
`Array.prototype.toSorted`, `toReversed`, `findLast` and `findLastIndex`.
Text editing/search also uses `Intl.Segmenter`, and model operations use
`structuredClone`. Check these APIs in every browser, embedded webview, or server
runtime you support, or load suitable polyfills before importing Tumbler.
See MDN's [string API compatibility](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/isWellFormed#browser_compatibility),
[array API compatibility](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted#browser_compatibility),
[segmenter compatibility](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter#browser_compatibility),
and [structured clone compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone#browser_compatibility).
These are API prerequisites, not a tested minimum browser-version guarantee.
Browser rendering also needs the DOM, Canvas and font APIs. The CLI requires
Bun 1.3 or later.

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
| Word `.docx` | Render pages, edit and format text, move and resize supported drawings, undo and save. | [Word documents](https://oss.kryptonote.com/docs/word) |
| Excel `.xlsx` | Render a virtualized grid, edit cells and supported formulas, format ranges, and save. | [Spreadsheets](https://oss.kryptonote.com/docs/spreadsheets) |
| PowerPoint `.pptx` | Navigate thumbnails, edit text and table cells, format shapes, move, resize and rotate supported objects, undo and save. | [PowerPoint](https://oss.kryptonote.com/docs/powerpoint) |
| PDF `.pdf` | Render source pages, select and edit text, annotate, search, and assemble pages. | [PDF documents](https://oss.kryptonote.com/docs/pdf) |

Format coverage is incomplete. See [compatibility](https://oss.kryptonote.com/docs/compatibility)
for limitations, including unsupported editing operations and differences from
Office layout. Legacy binary `.doc`, `.xls`, and `.ppt` files are not supported.

## Packages

| Package | Responsibility |
| --- | --- |
| `@tumblerjs/opc` | ZIP package parts, content types, relationships, and atomic writes |
| `@tumblerjs/ooxml` | Loss-aware XML, namespaces, compatibility, themes, and shared metadata |
| `@tumblerjs/ink` | Shared InkML trace decoding, Office ink semantics and lossless preservation |
| `@tumblerjs/formulas` | Headless spreadsheet formula parsing and bounded calculation |
| `@tumblerjs/charts` | Headless DrawingML chart semantics and deterministic layout |
| `@tumblerjs/core` | Format-neutral selection, formatting contracts, and sparse geometry |
| `@tumblerjs/sheets` | SpreadsheetML reading, calculation, preservation, and editing |
| `@tumblerjs/word` | WordprocessingML reading, page layout, preservation, and editing |
| `@tumblerjs/slides` | PresentationML reading, slide scenes, preservation, and editing |
| `@tumblerjs/pdf` | Source-preserving PDF parsing, rendering, editing and page assembly |
| `@tumblerjs/cli` | Bun CLI for document operations and chart authoring |
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

Compiler checks use TypeScript 7 through the `@typescript/native` dependency alias.
The `typescript` dependency aliases `@typescript/typescript6` because Svelte tooling
still needs its JavaScript compiler API. Keep both aliases when updating dependencies.

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

Word compatibility evidence is reported by `bun run compatibility:word`. The
[compatibility contract](tools/word-compatibility/README.md) scores all 4,482 standards topics across six dimensions, including an overall
compatibility percentage. Semantic checks, package comparisons, Open XML SDK
and LibreOffice supply evidence; unresolved coverage stays in the denominator.
