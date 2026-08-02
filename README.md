# Tumbler

Headless Office document editing for the web.

Tumbler is a browser-first TypeScript project for reading, preserving, editing,
and writing OOXML documents. It owns no application UI. Format-neutral editing
engines sit beneath optional framework heads, beginning with Svelte.

This repository is private and local-only while the architecture is being
developed.

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
| `@tumbler/opc` | ZIP package parts, content types, and relationships |
| `@tumbler/ooxml` | Shared OOXML vocabulary, namespaces, and compatibility |
| `@tumbler/core` | Headless commands, transactions, selection, and history |
| `@tumbler/word` | WordprocessingML model and editing behavior |
| `@tumbler/sheets` | SpreadsheetML model and editing behavior |
| `@tumbler/slides` | PresentationML model and editing behavior |
| `@tumbler/svelte` | Kryptonote's replaceable Svelte head |
| `@tumbler/testkit` | Fixtures, validators, generators, oracles, and preservation checks |

## Commands

```sh
bun install
bun run check
bun test
```

The first implemented API is the shared OPC layer. It can safely inventory an
Office package and stage atomic package-graph changes:

```ts
import { beginPackageTransaction, openOpcPackage } from "@tumbler/opc";

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
} from "@tumbler/ooxml";

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
