<script lang="ts">
  import { untrack } from 'svelte';
  import { createGridSelection, type FormattingPatch } from '@tumblerjs/core';
  import { openSpreadsheetArtifact } from '@tumblerjs/sheets';
  import { FormattingToolbar, SpreadsheetGrid } from '@tumblerjs/svelte';

  let { bytes }: { bytes: Uint8Array } = $props();
  let artifact = $state(untrack(() => openSpreadsheetArtifact(bytes)));
  let selection = $state(createGridSelection({ row: 1, column: 1 }));
  let error = $state('');
  function format(patch: FormattingPatch) {
    try { artifact = artifact.applyFormatting(selection.range, patch); error = ''; }
    catch { error = 'Could not format these cells.'; }
  }
</script>

<div class="toolbar">
  <FormattingToolbar state={artifact.formattingState(selection.range)}
    capabilities={artifact.formattingCapabilities(selection.range)} onformat={format} />
</div>
<div class="sheet">
  <SpreadsheetGrid worksheet={artifact.worksheet} calculation={artifact.calculation}
    {selection} onselectionchange={next => selection = next} readonly />
</div>
{#if error}<p role="alert">{error}</p>{/if}

<style>
  .toolbar { overflow-x: auto; }
  .toolbar :global(.formatting-toolbar) { min-width: 480px; }
  .sheet { height: 240px; min-width: 0; }
  .sheet :global(.tumbler-grid) { height: 100%; }
</style>
