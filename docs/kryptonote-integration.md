# Kryptonote artefact viewer integration

Tumbler now has the boundary needed by Kryptonote, but it has not been wired into
`Kn-Frontend`. Keeping that as a separate commit makes the application change
easy to review and avoids coupling the reusable engine to Kryptonote state.

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

The artefact viewer can render sheet tabs from `artifact.workbook.sheets` and
switch with `artifact = artifact.selectSheet(sheet.sheetId)`. The active sheet
is retained by name when `replace` receives a new agent-produced workbook; if
that sheet disappeared, the first visible ordinary worksheet is selected.

## Recommended application wiring

1. Add the private Tumbler workspace packages as local workspace dependencies of
   `Kn-Frontend`; do not publish them merely to connect the private application.
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

- Tumbler is still a private local project, so dependency placement must be
  decided before `Kn-Frontend` can import it reliably on developer machines and
  deployment builders.
- Parsing is synchronous today. The API is worker-safe, but the worker transport
  and cancellation contract have not been added.
- Editing returns complete XLSX bytes. Incremental object-storage upload is a
  host optimization, not part of this first boundary.
- The Svelte component has compiler, geometry, and state tests but no Kryptonote
  screenshot or interaction baseline yet.
