<script lang="ts">
  import { untrack } from 'svelte';
  import { openSpreadsheetArtifact } from '@tumblerjs/sheets';
  import { SpreadsheetFormulaBar, type SpreadsheetFormulaBarEdit } from '@tumblerjs/svelte';

  let { bytes }: { bytes: Uint8Array } = $props();
  let artifact = $state(untrack(() => openSpreadsheetArtifact(bytes)));
  let reference = $state('D2');
  let error = $state('');
  let result = $derived(artifact.calculation.displayText(reference));
  function edit(change: SpreadsheetFormulaBarEdit) {
    try {
      artifact = change.kind === 'formula'
        ? artifact.editFormula(change.reference, change.formula)
        : artifact.editCell(change.reference, change.value);
      error = '';
      return true;
    } catch { error = 'Could not apply this formula.'; return false; }
  }
</script>

<label>Cell <select bind:value={reference}><option>B2</option><option>C2</option><option>D2</option></select></label>
<SpreadsheetFormulaBar worksheet={artifact.worksheet} {reference} onedit={edit} />
<p>Calculated value <output aria-label="Calculated value">{result}</output></p>
{#if error}<p role="alert">{error}</p>{/if}

<style>
  label { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  output { margin-left: 12px; font-variant-numeric: tabular-nums; }
</style>
