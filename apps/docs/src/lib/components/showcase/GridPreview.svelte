<script lang="ts">
  import { untrack } from 'svelte';
  import { createGridSelection } from '@tumblerjs/core';
  import { openSpreadsheetArtifact } from '@tumblerjs/sheets';
  import { SpreadsheetGrid, type SpreadsheetGridEdit } from '@tumblerjs/svelte';

  let { bytes }: { bytes: Uint8Array } = $props();
  let artifact = $state(untrack(() => openSpreadsheetArtifact(bytes)));
  let selection = $state(createGridSelection({ row: 2, column: 2 }));
  let error = $state('');
  function edit(change: SpreadsheetGridEdit) {
    try { artifact = artifact.editCell(change.reference, change.value); error = ''; }
    catch { error = 'Could not edit this cell.'; }
  }
</script>

<div class="sheet">
  <SpreadsheetGrid worksheet={artifact.worksheet} calculation={artifact.calculation}
    {selection} onselectionchange={next => selection = next} onedit={edit} />
</div>
{#if error}<p role="alert">{error}</p>{/if}

<style>
  .sheet { height: 320px; min-width: 0; }
  .sheet :global(.tumbler-grid) { height: 100%; }
</style>
