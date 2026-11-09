<script lang="ts">
  import { tick } from 'svelte';
  import PdfPageThumbnail from './PdfPageThumbnail.svelte';
  import { mergeSourceSelection, type PdfMergeSource } from './merge-source.ts';
  import { mergePageRanges, toggleMergePage } from './merge-selection.ts';
  let { source = $bindable(), disabled = false, onchange }: { source: PdfMergeSource; disabled?: boolean; onchange: () => void } = $props();
  const id = $props.id();
  let rangeInput: HTMLInputElement;
  let anchor: number | undefined;
  let focused = $state(false), settled = $state(true);
  const selection = $derived(mergeSourceSelection(source));
  const selected = $derived(new Set(selection.pages));
  const positions = $derived.by(() => {
    const result = new Map<number, number[]>();
    selection.pages.forEach((page, index) => result.set(page, [...(result.get(page) ?? []), index + 1]));
    return result;
  });
  $effect(() => {
    source.draft;
    settled = false;
    const timer = setTimeout(() => settled = true, 600);
    return () => clearTimeout(timer);
  });
  const invalid = $derived(!!selection.error && (!focused || settled));
  $effect(() => { source.rangeErrorVisible = invalid; });
  function resetOrder() {
    choose([...selected].sort((a,b) => a-b));
    void tick().then(() => rangeInput.focus());
  }
  function choose(pages: number[]) {
    source.draft = undefined;
    source.none = pages.length === 0;
    source.pages = pages.length === source.document?.pages.length ? '' : mergePageRanges(pages);
    onchange();
  }
  function input(value: string) {
    source.rangeErrorVisible = false;
    source.draft = value;
    const candidate = { ...source, pages: value, draft: undefined, none: false };
    if (!mergeSourceSelection(candidate).error) { source.pages = value; source.none = false; source.draft = undefined; }
    settled = false;
    onchange();
  }
</script>
<div class="picker">
  <div class="selection-tools">
    <label for={`${id}-range`}>Include pages</label>
    {#if selection.custom}<button type="button" disabled={disabled} onclick={resetOrder}>Sort and remove repeats</button>
    {:else}<button type="button" disabled={disabled} onclick={() => { anchor = undefined; choose(source.document!.pages.map((_, index) => index)); }}>All</button><button type="button" disabled={disabled} onclick={() => { anchor = undefined; choose([]); }}>None</button>{/if}
  </div>
  <input bind:this={rangeInput} id={`${id}-range`} aria-label={`Include pages in ${source.name}`} aria-describedby={`${id}-help`} aria-invalid={invalid} disabled={disabled} value={source.draft ?? source.pages} placeholder={source.none ? 'No pages' : `All ${source.document?.pages.length ?? 0} pages`} onfocus={() => focused = true} onblur={() => { focused = false; source.rangeErrorVisible = !!selection.error; }} oninput={event => input(event.currentTarget.value)} />
  <div id={`${id}-help`} class="help" class:error={invalid} aria-live="polite">{#if invalid}{selection.error}{:else if selection.custom}Order within this PDF. Edit the range to change it.{:else}Shift-click to include a range.{/if}</div>
  {#if source.document}
    <div class="grid" class:custom={selection.custom} aria-label={`Pages included from ${source.name}`}>
      {#each source.document.pages as page, index (page.id)}
        {@const order = positions.get(index) ?? []}
        <button type="button" class:selected={selected.has(index)} class="page" role="checkbox" aria-checked={selected.has(index)} aria-label={`Page ${index + 1} of ${source.name}${selection.custom && order.length ? `, output ${order.length === 1 ? 'position' : 'positions'} ${order.join(', ')}` : ''}`} disabled={disabled || selection.custom || invalid} onclick={event => { choose(toggleMergePage(selection.pages, index, event.shiftKey ? anchor : undefined)); anchor = index; }}>
          <PdfPageThumbnail document={source.document} {index} pixels={300} />
          <span class="number">{index + 1}</span><span class="check" title={selection.custom ? `Output positions ${order.join(', ')}` : undefined} aria-hidden="true">{selection.custom ? order.slice(0, 3).join('·') + (order.length > 3 ? '…' : '') : selected.has(index) ? '✓' : ''}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
<style>
  .picker { padding: 0 12px 12px; }
  .selection-tools { display: flex; align-items: center; gap: 8px; min-height: 30px; color: var(--text-soft, #666); }
  label { flex: 1; }
  .selection-tools button { border: 0; padding: 6px 4px; background: transparent; color: var(--text, #222); font: inherit; cursor: pointer; }
  input { box-sizing: border-box; width: 100%; min-width: 0; padding: 7px 8px; border: 1px solid var(--border, #ddd); border-radius: 4px; background: var(--bg, white); color: var(--text, #222); font: inherit; }
  input[aria-invalid='true'] { border-color: var(--danger, #b82222); }
  .help { display: flex; align-items: center; height: 40px; font-size: 11px; line-height: 15px; color: var(--text-soft, #666); }
  .help.error { color: var(--danger, #b82222); }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .page { position: relative; min-width: 0; padding: 5px; border: 1px solid var(--border, #ddd); border-radius: 4px; background: transparent; color: var(--text, #222); cursor: pointer; }
  .page.selected { border-color: var(--accent, #246644); background: var(--surface-hover, #eee); }
  .page:not(.selected) :global(.thumbnail) { opacity: .45; }
  .custom .page { opacity: .7; }
  .page:focus-visible, input:focus-visible { outline: 2px solid var(--accent, #246644); outline-offset: 2px; }
  .number { display: block; margin-top: 5px; font-size: 11px; }
  .check { position: absolute; right: 3px; top: 3px; display: grid; place-items: center; min-width: 16px; height: 16px; padding: 0 3px; max-width: calc(100% - 14px); overflow: hidden; border: 1px solid var(--border, #888); border-radius: 3px; background: var(--bg, white); font-size: 11px; }
  .selected .check { background: var(--accent, #246644); color: var(--accent-ink, white); border-color: transparent; }
  .page:disabled { cursor: default; }
  @container (min-width: 440px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
