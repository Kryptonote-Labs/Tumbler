import type { Doc } from './types';

export const spreadsheetsDoc: Doc = {
  title: 'Open a spreadsheet',
  description: 'Render an XLSX worksheet and switch sheets without discarding edits.',
  sections: [
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
  source: 'apps/docs/src/lib/docs/spreadsheets.ts',
  next: { href: '/docs/spreadsheet-editing', label: 'Cells and formulas' },
};
