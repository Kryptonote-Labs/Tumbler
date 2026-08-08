# Tumbler

Headless Office document editing for the web.

> [!CAUTION]
> **Tumbler is extremely early alpha software. You probably should not use it.**
>
> The APIs, package boundaries, file-format behavior, and supported features can
> change without notice. Published packages are experimental alpha snapshots,
> and compatibility with real-world Office documents is incomplete. Tumbler can
> produce files that Office applications reject or repair. Do not use it with
> important documents unless you keep the originals and are prepared to lose
> changes.

Tumbler is a browser-first TypeScript project for reading, preserving, editing,
and writing OOXML documents. It owns no application UI. Format-neutral editing
engines sit beneath optional framework heads, beginning with Svelte.

This repository is public so the architecture, experiments, and test strategy
can develop in the open. That does **not** mean the project is ready for
adoption. For now, treat it as active research with source code attached.

## Current status

Tumbler has foundations for OPC packages, loss-aware OOXML editing, and a narrow
SpreadsheetML vertical slice. It can inspect and transactionally modify parts,
edit shared core properties, read a subset of workbook and worksheet data, edit
literal spreadsheet cells, and render an experimental Svelte spreadsheet grid
with a narrow native chart-preview subset.

It does not currently provide broad or production-ready Office compatibility.
Word and PowerPoint editing are not implemented. Formula editing, structural
spreadsheet edits, comprehensive drawing support, external-consumer validation,
stable APIs, and stable releases are all unfinished.

There is no support commitment or migration policy during this stage.

## Principles

- Preserve unsupported content instead of silently discarding it.
- Keep OOXML mechanics separate from document editing semantics.
- Keep every head replaceable; the core must never depend on Svelte.
- Build formats sequentially on shared package and testing infrastructure.
- Treat interoperability, round trips, fuzzing, and visual behavior as product
  requirements.

## Workspaces

| Package | Responsibility |
| --- | --- |
| `@tumblerjs/opc` | ZIP package parts, content types, and relationships |
| `@tumblerjs/ooxml` | Shared OOXML vocabulary, namespaces, and compatibility |
| `@tumblerjs/charts` | Headless DrawingML chart semantics and deterministic layout |
| `@tumblerjs/core` | Headless commands, transactions, selection, and history |
| `@tumblerjs/word` | WordprocessingML model and editing behavior |
| `@tumblerjs/sheets` | SpreadsheetML model and editing behavior |
| `@tumblerjs/slides` | PresentationML model and editing behavior |
| `@tumblerjs/svelte` | Kryptonote's replaceable Svelte head |
| `@tumblerjs/testkit` | Fixtures, validators, generators, oracles, and preservation checks |

## Commands

```sh
bun install
bun run check
bun test
```

Public packages are distributed under the `alpha` npm tag. Install them with an
explicit tag, for example `bun add @tumblerjs/sheets@alpha`. Private format and
test packages remain workspace-only.

The first implemented API is the shared OPC layer. It can safely inventory an
Office package and stage atomic package-graph changes:

```ts
import { beginPackageTransaction, openOpcPackage } from "@tumblerjs/opc";

const pkg = openOpcPackage(bytes);
const transaction = beginPackageTransaction(pkg);

transaction
  .addPart("/custom/data.bin", "application/vnd.example.data", data)
  .addRelationship(pkg.mainOfficeDocumentPart().name, {
    id: "customData",
    type: "https://example.test/relationships/data",
    target: "/custom/data.bin",
  });

const editedBytes = transaction.commit();
```

The transaction never mutates `pkg`. A failed commit remains active and leaves
the source bytes unchanged; rollback discards all staged state.

The shared OOXML layer can now perform the first typed cross-format edit:

```ts
import {
  beginCorePropertiesEdit,
  readCoreProperties,
} from "@tumblerjs/ooxml";

const properties = readCoreProperties(pkg);
const editedBytes = beginCorePropertiesEdit(pkg)
  .setTitle("Quarterly plan")
  .setCreator("Kryptonote")
  .commit();
```

Existing Core Properties XML is patched against original source spans. Missing
metadata parts, content types, and relationships are created transactionally.

## Project documents

- [Vision](docs/vision.md) defines the product, its boundaries, and its principles.
- [Architecture](docs/architecture.md) describes package ownership and data flow.
- [Formats and UI](docs/formats-and-ui.md) records the Word, spreadsheet, and
  presentation plans.
- [Standards and compatibility](docs/standards-and-compatibility.md) defines the
  sources of truth and preservation contract.
- [Testing](docs/testing.md) describes the conformance, corpus, fuzzing, consumer,
  and visual test programme.
- [Roadmap](docs/roadmap.md) breaks delivery into shared foundations and
  format-sized vertical slices.
- [Decisions](docs/decisions.md) separates settled direction from open questions.
- [OOXML engineering reference](docs/reference/README.md) is the local, searchable
  implementation handbook distilled from the standards and compatibility sources.
- [OPC implementation status](docs/opc-implementation.md) maps the current code
  and tests to ECMA-376 Part 2 requirements and records deliberate gaps.
- [OOXML implementation status](docs/ooxml-implementation.md) describes the
  loss-aware XML, compatibility view, and Core Properties vertical slice.

## Contributing and security

Experiments, bug reports, test documents that can legally be redistributed, and
careful review are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
starting work. Please report security issues according to
[SECURITY.md](SECURITY.md), not in a public issue.

Tumbler is available under the [MIT License](LICENSE).
