<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { chartDataHighlights } from './chart-data-highlights.ts';
  import { createGridSelection } from "@tumblerjs/core";
  import { formatCellReference, type SpreadsheetArtifact } from "@tumblerjs/sheets";
  import SpreadsheetFormulaBar from "./SpreadsheetFormulaBar.svelte";
  import SpreadsheetGrid from "./SpreadsheetGrid.svelte";
  import type { SpreadsheetFormulaBarEdit } from "./spreadsheet-formula-bar.ts";
  import type { SpreadsheetGridEdit } from "./spreadsheet-edit.ts";

  /** A docked mini sheet for a chart's source workbook. It sits beside the chart rather than over it. */
  interface Props {
    readonly artifact: SpreadsheetArtifact;
    readonly disabled?: boolean;
    readonly source?: Uint8Array;
    readonly themeColors?: Readonly<Record<string, string>>;
    /** Receives each successful edit. Formulas keep their source and are parsed by the workbook engine. */
    readonly onchange: (artifact: SpreadsheetArtifact) => void;
    readonly onclose?: () => void;
    readonly onsheetselect?: (name: string) => void;
  }

  let { artifact, disabled = false, source, themeColors = {}, onchange, onclose, onsheetselect }: Props = $props();

  // Follows the host's artifact, and runs ahead of it between an edit and the host's next render.
  let current = $derived(artifact);
  let selection = $state(createGridSelection({ row: 1, column: 1 }));
  let error = $state<string>();
  let region = $state<HTMLElement>();
  const highlights = $derived(source ? chartDataHighlights(source, current.activeSheet.name, themeColors) : []);
  onMount(() => { void tick().then(() => region?.querySelector<HTMLElement>('[role="grid"]')?.focus()); });
  const reference = $derived(formatCellReference(selection.anchor));

  function apply(edit: (artifact: SpreadsheetArtifact) => SpreadsheetArtifact): boolean {
    try {
      const next = edit(current);
      error = undefined;
      if (next !== current) { onchange(next); current = next; }
      return true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "This value can't be entered here.";
      return false;
    }
  }
  function editCell(edit: SpreadsheetGridEdit) {
    // Typed `=` entries are formulas unless the cell's Text format marked the edit as a literal value.
    const { reference, value } = edit;
    apply((artifact) => edit.kind !== "value" && typeof value === "string" && value.startsWith("=")
      ? artifact.editFormula(reference, value.slice(1))
      : artifact.editCell(reference, value));
  }
  function editFormula(edit: SpreadsheetFormulaBarEdit): boolean {
    const sheet = edit.sheet ?? current.activeSheet.name;
    return apply((artifact) => edit.kind === "formula"
      ? artifact.editFormulaOnSheet(sheet, edit.reference, edit.formula)
      : artifact.editCellOnSheet(sheet, edit.reference, edit.value));
  }
  function selectSheet(name: string) {
    current = current.selectSheet(name);
    selection = createGridSelection({ row: 1, column: 1 });
    error = undefined;
    onsheetselect?.(name);
  }
</script>

<section bind:this={region} class="chart-data" aria-label="Chart data">
  <div class="bar">
    <div class="formula"><SpreadsheetFormulaBar worksheet={current.worksheet} {reference} readonly={disabled} onedit={editFormula} /></div>
    {#if onclose}<button type="button" class="close" aria-label="Close chart data" title="Close" onclick={onclose}>×</button>{/if}
  </div>
  <div class="grid">
    <SpreadsheetGrid worksheet={current.worksheet} calculation={current.calculation} {selection} highlightRanges={highlights} readonly={disabled}
      onselectionchange={(next) => { selection = next; }} onedit={editCell} />
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
  {#if current.workbook.sheets.filter((sheet) => sheet.state === 'visible').length > 1}
    <div class="sheets" role="tablist" aria-label="Chart data worksheets">
      {#each current.workbook.sheets.filter((sheet) => sheet.state === 'visible') as sheet (sheet.sheetId)}
        <button type="button" role="tab" aria-selected={sheet.sheetId === current.activeSheet.sheetId}
          onclick={() => selectSheet(sheet.name)}>{sheet.name}</button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .chart-data {
    display: flex; flex-direction: column; box-sizing: border-box; height: 240px; width: 100%; min-width: 0; overflow: hidden; contain: inline-size; flex-shrink: 0;
    border-top: 1px solid var(--tumbler-control-border, var(--border, #303030)); background: var(--tumbler-control-bg, var(--surface, #181818));
  }
  .bar { display: flex; align-items: center; min-width: 0; }
  .sheets { display: flex; overflow-x: auto; flex: 0 0 auto; border-top: 1px solid var(--tumbler-control-border, var(--border, #303030)); }
  .sheets button { border: 0; border-bottom: 2px solid transparent; padding: 4px 10px; white-space: nowrap; color: inherit; background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
  .sheets button[aria-selected="true"] { border-bottom-color: var(--tumbler-control-accent, var(--accent, #4fe519)); }
  .formula { flex: 1; min-width: 0; }
  .grid { position: relative; flex: 1; min-height: 0; min-width: 0; overflow: hidden; contain: strict; }
  .close {
    flex: 0 0 auto; width: 28px; height: 28px; margin: 0 4px; padding: 0; font: inherit; font-size: 16px; line-height: 1; cursor: pointer;
    color: var(--tumbler-control-muted, var(--text-soft, #9baa9d)); background: none; border: 0; border-radius: 4px;
  }
  .close:hover { color: var(--tumbler-control-text, var(--text, #e2fee7)); background: var(--tumbler-control-hover, var(--surface-hover, #252825)); }
  .close:focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: -2px; }
  /* Overlays the grid so a rejected entry never moves the sheet. */
  .error {
    position: absolute; right: 8px; bottom: 8px; z-index: 10; max-width: calc(100% - 16px); margin: 0; padding: 4px 8px; font-size: 11px; border-radius: 4px;
    color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); background: var(--tumbler-control-bg, var(--surface, #181818));
    border: 1px solid currentColor; pointer-events: none;
  }
</style>
