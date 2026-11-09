PDF hosts can create a `createPdfSearch()` controller during component setup and pass
it as `search` to `PdfDocumentView` or `PdfEditableDocument`. Supplying a controller
suppresses the default bar. Share it between views and set `searchEnabled` only on
the visible view. Bind `open`, `query`, `matchCase` and `wholeWord`; read `matches`,
`total` and zero-based `active`; call `move(-1)` / `move(1)` and
`replace(value, all?)`. The view paints and scrolls highlights. Hosts own shortcuts
and focus when supplying a controller.

Replacement uses mapped `PdfTextModel` ranges in one collaborative transaction and
undo step. Results without a range remain searchable but cannot be replaced.
Read-only and encrypted views never connect a replacement model. Rebuild a raw
`PdfSearchIndex` after model changes; Svelte views do this through their flow state.
