<script lang="ts">
  import { untrack } from 'svelte';
  import { createGridSelection } from '@tumblerjs/core';
  import { openSpreadsheetArtifact } from '@tumblerjs/sheets';
  import { SpreadsheetGrid } from '@tumblerjs/svelte';

  let { bytes }: { bytes: Uint8Array } = $props();
  let artifact = $state(
    untrack(() => openSpreadsheetArtifact(bytes)),
  );
  let selection = $state(
    createGridSelection({ row: 1, column: 1 }),
  );

  // Edits made on one sheet survive switching away and back.
  function select(name: string) {
    artifact = artifact.selectSheet(name);
    selection = createGridSelection({ row: 1, column: 1 });
  }
</script>

<div class="sheet">
  <SpreadsheetGrid
    worksheet={artifact.worksheet}
    calculation={artifact.calculation}
    {selection}
    onselectionchange={(next) => (selection = next)}
    onedit={({ reference, value }) =>
      (artifact = artifact.editCell(reference, value))}
    scale={0.75}
  />
</div>
<div class="tabs" role="tablist" aria-label="Worksheets">
  {#each artifact.workbook.sheets as sheet}
    <button
      role="tab"
      aria-selected={sheet === artifact.activeSheet}
      onclick={() => select(sheet.name)}
    >
      {sheet.name}
    </button>
  {/each}
</div>

<style>
  .sheet { height: 280px; min-width: 0; }
  .sheet :global(.tumbler-grid) { height: 100%; }
  .tabs { display: flex; gap: 4px; margin-top: 8px; }
  .tabs button {
    min-height: 28px;
    padding: 3px 10px;
    font-size: 12px;
  }
  .tabs button[aria-selected='true'] {
    border-color: var(--soft);
  }
</style>
