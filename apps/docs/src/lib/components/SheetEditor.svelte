<script lang="ts">
  import { untrack } from 'svelte';
  import { createGridSelection, type FormattingPatch } from '@tumblerjs/core';
  import { formatCellReference, type SpreadsheetArtifact } from '@tumblerjs/sheets';
  import { FormattingToolbar, SpreadsheetFormulaBar, SpreadsheetGrid, type SpreadsheetFormulaBarEdit, type SpreadsheetGridEdit } from '@tumblerjs/svelte';
  let { initial, editable, scale = $bindable(1), onchange, onerror }: {
    initial: SpreadsheetArtifact; editable: boolean; scale?: number;
    onchange: (bytes: Uint8Array, dirty: boolean) => void; onerror: (message: string) => void;
  } = $props();
  let artifact = $state(untrack(() => initial));
  let selection = $state(createGridSelection({ row: 1, column: 1 }));
  let history = $state<SpreadsheetArtifact[]>([]);
  let future = $state<SpreadsheetArtifact[]>([]);
  let reference = $derived(formatCellReference(selection.focus));
  function apply(operation: () => SpreadsheetArtifact) {
    try {
      const next = operation();
      if (next !== artifact) {
        history = [...history.slice(-49), artifact];
        future = [];
        artifact = next;
        onchange(artifact.bytes(), true);
      }
      onerror('');
      return true;
    } catch { onerror('This edit is not supported for the selected cells.'); return false; }
  }
  function cellEdit(edit: SpreadsheetGridEdit) { apply(() => artifact.editCell(edit.reference, edit.value)); }
  function formulaEdit(edit: SpreadsheetFormulaBarEdit) {
    return apply(() => edit.kind === 'formula'
      ? artifact.editFormulaOnSheet(edit.sheet ?? artifact.activeSheet.name, edit.reference, edit.formula)
      : artifact.editCellOnSheet(edit.sheet ?? artifact.activeSheet.name, edit.reference, edit.value));
  }
  function format(patch: FormattingPatch) { apply(() => artifact.applyFormatting(selection.range, patch)); }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    future = [...future, artifact]; history = history.slice(0, -1); artifact = previous;
    onchange(artifact.bytes(), artifact.bytes() !== initial.bytes());
  }
  function redo() {
    const next = future.at(-1);
    if (!next) return;
    history = [...history, artifact]; future = future.slice(0, -1); artifact = next;
    onchange(artifact.bytes(), true);
  }
</script>
<div class="editor-root sheet-editor">
  {#if editable}<div class="editing-bar"><button onclick={undo} disabled={!history.length} title="Undo" aria-label="Undo">↶</button><button onclick={redo} disabled={!future.length} title="Redo" aria-label="Redo">↷</button><FormattingToolbar state={artifact.formattingState(selection.range)} capabilities={artifact.formattingCapabilities(selection.range)} onformat={format} /></div>{/if}
  <SpreadsheetFormulaBar worksheet={artifact.worksheet} {reference} readonly={!editable} onedit={formulaEdit} />
  <div class="viewer-body"><SpreadsheetGrid bind:scale worksheet={artifact.worksheet} calculation={artifact.calculation} {selection} readonly={!editable} onselectionchange={next => selection = next} onedit={cellEdit} /></div>
  <div class="sheet-tabs" aria-label="Worksheets">{#each artifact.workbook.sheets.filter(sheet => sheet.state === 'visible') as sheet}<button class:chosen={sheet.name === artifact.activeSheet.name} aria-pressed={sheet.name === artifact.activeSheet.name} onclick={() => { artifact = artifact.selectSheet(sheet.name); selection = createGridSelection({ row: 1, column: 1 }); }}>{sheet.name}</button>{/each}</div>
</div>
