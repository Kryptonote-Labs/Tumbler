# Kryptonote artefact viewer integration

Tumbler is wired into `Kn-Frontend` as a public Git submodule while its reusable
packages remain independent of Kryptonote state and visual chrome.

## Viewer state

The frontend owns one immutable `SpreadsheetArtifact` and replaces it after
every edit or external revision:

```svelte
<script lang="ts">
  import { openSpreadsheetArtifact } from "@tumbler/sheets";
  import { SpreadsheetGrid, type SpreadsheetGridEdit } from "@tumbler/svelte";

  let { bytes, onbyteschange } = $props<{
    bytes: Uint8Array;
    onbyteschange: (bytes: Uint8Array) => void;
  }>();

  let artifact = $state(openSpreadsheetArtifact(bytes));

  function editCell(edit: SpreadsheetGridEdit) {
    artifact = artifact.editCell(edit.reference, edit.value);
    onbyteschange(artifact.bytes());
  }

  function acceptAgentRevision(nextBytes: Uint8Array) {
    artifact = artifact.replace(nextBytes);
  }
</script>

<SpreadsheetGrid worksheet={artifact.worksheet} onedit={editCell} />
```

Pass `readonly` when the host wants selection and table view controls without
cell writes. Sorting and filtering are always view-only: they use scalar values
and cached formula results, do not calculate formulas, and do not change the
artifact bytes.

The artefact viewer can render sheet tabs from `artifact.workbook.sheets` and
switch with `artifact = artifact.selectSheet(sheet.sheetId)`. The active sheet
is retained by name when `replace` receives a new agent-produced workbook; if
that sheet disappeared, the first visible ordinary worksheet is selected.

## Recommended application wiring

1. Keep the frontend submodule pinned to a reviewed Tumbler commit and refresh
   the Bun lockfile whenever that pin changes.
2. Route `.xlsx`, `.xltx`, and supported macro-enabled spreadsheet artefacts to
   a dedicated spreadsheet viewer component.
3. Open bytes in a worker once workbook sizes make main-thread parsing visible.
4. Render the viewer shell immediately, then supply the opened artefact.
5. Treat grid edits optimistically in component state and persist the returned
   bytes through the existing artefact update path.
6. On an agent revision, call `artifact.replace(newBytes)` rather than mutating
   the old worksheet model.
7. Surface typed `SpreadsheetError` diagnostics through Kryptonote's normal
   preview-unavailable state without exposing raw OOXML language to users.

## Current integration caveats

- Tumbler is extremely early alpha. The submodule pin is the compatibility
  boundary; public package APIs may still change between pins.
- Parsing is synchronous today. The API is worker-safe, but the worker transport
  and cancellation contract have not been added.
- Editing returns complete XLSX bytes. Incremental object-storage upload is a
  host optimization, not part of this first boundary.
- Table value/custom filters and value sorts have parser, projection, property,
  compiler, and geometry coverage. Dynamic/top-10/color/icon filters and
  horizontal or color/icon sorts remain preserved but unapplied.
- The Svelte component has no Kryptonote screenshot or browser interaction
  baseline yet.
