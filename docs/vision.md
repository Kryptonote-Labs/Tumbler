# Vision

## Summary

Tumbler is a headless, browser-first Office document engine. It will read,
preserve, render, edit, and write DOCX, XLSX, and PPTX files while allowing an
application to own every pixel and every interaction in the UI.

The initial application head will be purpose-built in Svelte for Kryptonote. The
headless packages should also be useful independently and are intended to become
a serious open-source contribution once they have earned a stable API.

## The problem

Existing Office preview solutions commonly make at least one unacceptable
tradeoff:

- convert the document into a different presentation format;
- use an iframe or hosted office suite whose UI cannot be fully controlled;
- render without providing a coherent editing model;
- regenerate supported content while silently deleting unsupported content;
- bind parsing, document state, layout, and UI to one framework;
- support one format with no reusable package or compatibility foundation.

Tumbler should make Office files feel native inside an application without
pretending that the OOXML formats are simple.

## Goals

- Support the OOXML Office family: Word, spreadsheets, and presentations.
- Render and edit entirely in the client.
- Let the host application own the complete interface.
- Expose a framework-independent model, commands, state, and events.
- Provide first-party Svelte heads designed for Kryptonote.
- Preserve unsupported package parts and markup whenever an edit does not
  require changing them.
- Produce documents that real versions of Microsoft Office, LibreOffice, and
  other mature consumers can open without repair.
- Make agent-written file revisions appear by loading the new file revision and
  rerendering the same client-side editor.
- Scale from preview-only support to focused editing and eventually broad
  editing without replacing the architecture.
- Build an independent testkit rigorous enough to be valuable to other OOXML
  projects.

## Non-goals

- Converting Office documents to PDF or images as the primary preview model.
- Recreating the Microsoft Office product UI.
- Running a hosted office suite inside Kryptonote.
- Sending documents to a third-party rendering service.
- Claiming complete Office compatibility before it is measured.
- Implementing every format simultaneously.
- Evaluating macros or executing embedded active content.
- Inventing a universal document model that erases meaningful differences
  between WordprocessingML, SpreadsheetML, and PresentationML.

Images may be generated in tests for visual comparison, but they are test
artifacts rather than the user-facing document representation.

## Product principles

### Own the document UI

The host must be able to replace toolbars, menus, inspectors, canvases, grids,
selection visuals, context menus, and keyboard behavior. Tumbler may supply
rendering primitives and complete Svelte heads, but it must not require a fixed
shell.

### Headless first

UI code consumes state and dispatches commands. Parsing, serialization,
selection semantics, history, and format rules remain usable without Svelte or a
DOM.

### Preserve what is not understood

Partial support is honest and safe only when unknown content survives. An edit
to one cell must not delete an unfamiliar drawing extension elsewhere in the
workbook.

### Build the family, deliver sequentially

The architecture is shared across DOCX, XLSX, and PPTX from the beginning. A
single format is taken through useful vertical slices at a time so effort is not
spread across three incomplete editors.

### Compatibility is empirical

The standards define correctness, but actual Office applications expose the
compatibility reality. Both are required test oracles.

### No speculative public API

Package boundaries are established early. Public types emerge from implemented,
tested vertical slices and can remain private until their responsibilities are
clear.

## Kryptonote integration

The expected lifecycle is:

```text
workspace file revision
        ↓
browser receives bytes
        ↓
Tumbler opens package and constructs headless state
        ↓
Svelte head renders editable native UI
        ↓
user commands mutate state and produce a new OOXML revision
```

When an agent changes the file, Kryptonote supplies the new revision to Tumbler.
The editor reloads or reconciles it and rerenders. Agent execution does not need
to use the UI engine; the UI reacts to the resulting file revision.

Concurrent local edits and external revisions require an explicit future policy:
reload, prompt, three-way merge, or command replay. Silent replacement is not an
acceptable default once the local document is dirty.

## Intended identity

- Project: **Tumbler**
- TypeScript implementation: **Tumbler.js**
- Description: **Headless Office document editing for the web.**
- Working phrase: **Own the document.**

The repository and every current package remain local and private. Publishing,
package naming, governance, and OSS licensing are later decisions.
