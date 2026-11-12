import type { Doc } from './types';

export const spreadsheetViewerDoc: Doc = {
  title: 'Open a spreadsheet',
  description: 'Render an XLSX worksheet and switch sheets without discarding edits.',
  sections: [
    { id: 'headless', title: 'Render without a browser', blocks: [
      { kind: 'code', code: `import { openSpreadsheetArtifact, layoutSpreadsheetViewport } from '@tumblerjs/sheets';

const artifact = openSpreadsheetArtifact(bytes);
const layout = layoutSpreadsheetViewport(artifact.worksheet, {
  width: 1024, height: 768, calculation: artifact.calculation,
});` },
      { kind: 'text', text: 'The layout contains plain paint data for cells, frozen panes, merges and drawings, including charts. Transfer it to a worker or pass it to paintSpreadsheetViewport with a Canvas 2D context and a path factory. Decode spreadsheetViewportImages first and provide an image lookup. Hosts own canvas creation, fonts and output encoding.' },
    ] },
    { id: 'render', title: 'Render a worksheet', blocks: [
        { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import { createGridSelection } from '@tumblerjs/core';
  import { openSpreadsheetArtifact } from '@tumblerjs/sheets';
  import { SpreadsheetGrid } from '@tumblerjs/svelte';

  let { bytes }: { bytes: Uint8Array } = $props();
  let artifact = $state(openSpreadsheetArtifact(bytes));
  let selection = $state(createGridSelection({ row: 1, column: 1 }));
</script>

<div class="sheet" style="height: 560px; min-width: 0">
  <SpreadsheetGrid
    worksheet={artifact.worksheet}
    calculation={artifact.calculation}
    {selection}
    onselectionchange={(next) => selection = next}
    onedit={(edit) => artifact = artifact.editCell(edit.reference, edit.value)}
  />
</div>

<style>
  .sheet :global(.tumbler-grid) { height: 100%; }
</style>` },
        { kind: 'text', text: 'SpreadsheetGrid supports trackpad pinch, Ctrl+wheel, and two-finger touch zoom from 25% to 300%. Bind its scale prop with bind:scale to synchronise your zoom controls. The grid, row and column headers, frozen panes, and cell editor scale together.' },
    ] },
    { id: 'sheets', title: 'Switch worksheets', blocks: [
        { kind: 'text', text: 'Selecting a sheet returns an artifact for that sheet without throwing away workbook edits. Use the sheet name or numeric identifier.' },
        { kind: 'code', code: `const sheets = artifact.workbook.sheets;
artifact = artifact.selectSheet(sheets[1]!.name);` },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/spreadsheet-viewer.ts',
  next: { href: '/docs/spreadsheet-editing', label: 'Cells and formulas' },
};
