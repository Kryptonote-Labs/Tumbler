<script lang="ts">
  import { untrack } from 'svelte';
  import { createGridSelection } from '@tumblerjs/core';
  import { openSpreadsheetArtifact } from '@tumblerjs/sheets';
  import {
    SpreadsheetGrid,
    type SpreadsheetGridEdit,
  } from '@tumblerjs/svelte';

  let { bytes }: { bytes: Uint8Array } = $props();
  let artifact = $state(
    untrack(() => openSpreadsheetArtifact(bytes)),
  );
  let selection = $state(
    createGridSelection({ row: 2, column: 1 }),
  );

  // Each edit returns a new artifact with recalculated formulas.
  function edit({ reference, value }: SpreadsheetGridEdit) {
    artifact = artifact.editCell(reference, value);
  }
</script>

<div class="sheet">
  <SpreadsheetGrid
    worksheet={artifact.worksheet}
    calculation={artifact.calculation}
    {selection}
    onselectionchange={(next) => (selection = next)}
    onedit={edit}
    scale={0.75}
  />
</div>

<style>
  .sheet { height: 320px; min-width: 0; }
  .sheet :global(.tumbler-grid) { height: 100%; }
</style>
