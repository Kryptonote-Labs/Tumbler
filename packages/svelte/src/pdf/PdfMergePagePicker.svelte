<script lang="ts">
  import PdfPageThumbnail from './PdfPageThumbnail.svelte';
  import { mergeSourceSelection, type PdfMergeSource } from './merge-source.ts';
  import { mergePageRanges, toggleMergePage } from './merge-selection.ts';
  let { source, disabled = false, onchange }: { source: PdfMergeSource; disabled?: boolean; onchange: () => void } = $props();
  let anchor: number | undefined;
  const selection = $derived(mergeSourceSelection(source));
  const selected = $derived(new Set(selection.pages));
  function choose(pages: number[]) {
    source.none = pages.length === 0;
    source.pages = pages.length === source.document?.pages.length ? '' : mergePageRanges(pages);
    onchange();
  }
</script>
<div class="picker">
  <div class="selection-tools">
    <span>{selection.custom ? 'Custom order' : `${selection.pages.length} selected`}</span>
    {#if selection.custom}<button disabled={disabled} onclick={() => choose([...new Set(selection.pages)].sort((a,b) => a-b))}>Use page order</button>
    {:else}<button disabled={disabled} onclick={() => { source.none = false; source.pages = ''; onchange(); }}>All</button><button disabled={disabled} onclick={() => choose([])}>None</button>{/if}
  </div>
  <label>Pages<input aria-label={`Pages in ${source.name}`} aria-invalid={!!selection.error} disabled={disabled} value={source.pages} placeholder={source.none ? 'No pages' : `All ${source.document?.pages.length ?? 0} pages`} title="Page numbers or ranges, e.g. 3,1-2" oninput={event => { source.pages = event.currentTarget.value; source.none = false; onchange(); }} /></label>
  {#if selection.error}<p class="error" role="alert">{selection.error}</p>{/if}
  {#if source.document}
    <div class="grid" aria-label={`Pages in ${source.name}`}>
      {#each source.document.pages as page, index (page.id)}
        <button class:selected={selected.has(index)} class="page" role="checkbox" aria-checked={selected.has(index)} aria-label={`Page ${index + 1} of ${source.name}`} disabled={disabled || selection.custom || !!selection.error} onclick={event => { choose(toggleMergePage(selection.pages, index, event.shiftKey ? anchor : undefined)); anchor = index; }}>
          <PdfPageThumbnail document={source.document} {index} />
          <span class="number">{index + 1}</span><span class="check" aria-hidden="true">{selected.has(index) ? '✓' : ''}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
<style>
  .picker { padding: 0 12px 12px; }
  .selection-tools { display: flex; align-items: center; gap: 8px; min-height: 30px; color: var(--text-soft, #666); }
  .selection-tools span { flex: 1; }
  .selection-tools button { border: 0; padding: 4px; background: transparent; color: var(--text, #222); font: inherit; cursor: pointer; }
  label { display: flex; align-items: center; gap: 8px; color: var(--text-soft, #666); margin: 6px 0 12px; }
  input { min-width: 0; width: 100%; padding: 6px 8px; border: 1px solid var(--border, #ddd); border-radius: 4px; background: var(--bg, white); color: var(--text, #222); font: inherit; }
  input[aria-invalid='true'] { border-color: var(--danger, #b82222); }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .page { position: relative; min-width: 0; padding: 5px; border: 1px solid var(--border, #ddd); border-radius: 4px; background: transparent; color: var(--text, #222); cursor: pointer; }
  .page.selected { border-color: var(--accent, #246644); background: var(--surface-hover, #eee); }
  .page:focus-visible, input:focus-visible { outline: 2px solid var(--accent, #246644); outline-offset: 2px; }
  .number { display: block; margin-top: 5px; font-size: 11px; }
  .check { position: absolute; left: 3px; top: 3px; display: grid; place-items: center; width: 16px; height: 16px; border: 1px solid var(--border, #888); border-radius: 3px; background: var(--bg, white); font-size: 11px; }
  .selected .check { background: var(--accent, #246644); color: var(--accent-ink, white); border-color: transparent; }
  .page:disabled { cursor: default; }
  .error { color: var(--danger, #b82222); line-height: 1.5; }
  @container (max-width: 330px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
