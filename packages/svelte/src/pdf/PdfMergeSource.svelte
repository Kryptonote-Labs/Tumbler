<script lang="ts">
  import PdfPageThumbnail from './PdfPageThumbnail.svelte';
  import PdfMergePagePicker from './PdfMergePagePicker.svelte';
  import { mergeSourceSummary, mergeSourceSelection, openMergeSource, type PdfMergeSource } from './merge-source.ts';
  let { source = $bindable(), position, count, expanded, disabled = false, onexpand, onchange, onmove, onduplicate, onremove, ondrop }: {
    source: PdfMergeSource; position: number; count: number; expanded: boolean; disabled?: boolean;
    onexpand: () => void; onchange: () => void; onmove: (delta: number) => void; onduplicate: () => void; onremove: () => void;
    ondrop: (id: number, after: boolean) => void;
  } = $props();
  const id = $props.id();
  let trigger: HTMLButtonElement, menu: HTMLDivElement;
  let left = $state(0), top = $state(0), draggingOver = $state(false), dropAfter = $state(false);
  const cover = $derived(mergeSourceSelection(source).pages[0] ?? 0);
  function run(work: () => void) { menu.hidePopover(); trigger.focus(); work(); }
  function keys(event: KeyboardEvent) {
    if (disabled || event.target instanceof Element && event.target.closest('input, [popover]')) return;
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); onmove(event.key === 'ArrowUp' ? -1 : 1); }
    else if (event.key === 'Delete' && event.target instanceof Element && !event.target.closest('button:not(.grip)')) { event.preventDefault(); onremove(); }
  }
</script>
<div data-source-id={source.id} class="source" class:drop-target={draggingOver} class:drop-after={dropAfter} role="group" aria-label={source.name}
  ondragover={event => { if (!disabled && event.dataTransfer?.types.includes('application/x-tumbler-pdf-source')) { event.preventDefault(); draggingOver = true; dropAfter = event.clientY > event.currentTarget.getBoundingClientRect().top + event.currentTarget.clientHeight / 2; } }}
  ondragleave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) draggingOver = false; }}
  ondrop={event => { draggingOver = false; const value = event.dataTransfer?.getData('application/x-tumbler-pdf-source'); if (!disabled && value) { event.preventDefault(); event.stopPropagation(); ondrop(Number(value), event.clientY > event.currentTarget.getBoundingClientRect().top + event.currentTarget.clientHeight / 2); } }}>
  <div class="source-row">
    <button type="button" onkeydown={keys} class="grip" aria-label={`Reorder ${source.name}, position ${position + 1} of ${count}`} title="Drag to reorder. Alt+Up or Alt+Down moves this PDF; Delete removes it." draggable={!disabled} disabled={disabled} ondragstart={event => { event.dataTransfer?.setData('application/x-tumbler-pdf-source', String(source.id)); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; }}><span class="ordinal">{position + 1}</span><span class="dots" aria-hidden="true">⠿</span></button>
    <button type="button" class="expand" aria-expanded={expanded} aria-controls={`${id}-pages`} onclick={onexpand}>
      <span class="cover">{#if source.document}<PdfPageThumbnail document={source.document} index={cover} pixels={96} />{:else}<span class="placeholder" aria-hidden="true"></span>{/if}</span>
      <span class="description"><span class="name">{source.name}</span><span class="summary">{mergeSourceSummary(source)}</span></span>
      <svg class:expanded viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m5 6 3 3 3-3" /></svg>
    </button>
    <button type="button" class="more" bind:this={trigger} popovertarget={`${id}-menu`} aria-label={`Options for ${source.name}`} disabled={disabled}>⋯</button>
  </div>
  <div bind:this={menu} id={`${id}-menu`} popover="auto" class="menu" style:left={`${left}px`} style:top={`${top}px`} onbeforetoggle={event => { if (event.newState === 'open') { const rect = trigger.getBoundingClientRect(); left = Math.max(8, rect.right - 160); top = Math.min(rect.bottom + 4, window.innerHeight - 165); } }}>
    <button type="button" disabled={position === 0} onclick={() => run(() => onmove(-1))}>Move up</button>
    <button type="button" disabled={position === count - 1} onclick={() => run(() => onmove(1))}>Move down</button>
    <button type="button" disabled={source.loading || !source.bytes} onclick={() => run(onduplicate)}>Duplicate</button>
    <button type="button" onclick={() => run(onremove)}>Remove</button>
  </div>
  <div id={`${id}-pages`} hidden={!expanded}>
    {#if source.locked}<label class="password">Password<input type="password" aria-label={`Password for ${source.name}`} disabled={disabled} bind:value={source.password} autocomplete="off" oninput={() => { openMergeSource(source); onchange(); }} /></label>{/if}
    {#if source.error}<p class="error" role="alert">{source.error}</p>{/if}
    {#if source.document && expanded}<PdfMergePagePicker bind:source {disabled} {onchange} />{/if}
  </div>
</div>
<style>
  .source { border-bottom: 1px solid var(--border, #ddd); border-radius: 4px; }
  .source:focus-visible { outline: 1px solid var(--accent, #246644); outline-offset: -1px; }
  .drop-target { box-shadow: inset 0 2px var(--accent, #246644); }
  .drop-target.drop-after { box-shadow: inset 0 -2px var(--accent, #246644); }
  .source-row { display: flex; align-items: center; gap: 4px; padding: 10px 6px; }
  button { font: inherit; color: var(--text, #222); cursor: pointer; }
  .grip, .more { display: grid; place-items: center; flex: none; width: 24px; height: 32px; border: 0; border-radius: 4px; background: transparent; color: var(--text-soft, #666); }
  .more { font-size: 22px; }
  .grip { position: relative; cursor: grab; }
  .dots { display: inline; font-size: 18px; }
  .ordinal { display: none; }
  .source:hover .dots, .grip:focus-visible .dots { display: inline; }
  .source:hover .ordinal, .grip:focus-visible .ordinal { display: none; }
  .expand { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; text-align: left; }
  .cover { display: block; flex: none; width: 40px; }
  .placeholder { display: block; aspect-ratio: 0.75; border-radius: 2px; background: var(--surface-hover, #eee); }
  .description { flex: 1; min-width: 0; display: grid; gap: 4px; }
  .name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; line-height: 1.4; font-weight: 500; }
  .summary { font-size: 11px; color: var(--text-soft, #666); }
  svg { flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; }
  svg.expanded { transform: rotate(180deg); }
  .menu { box-sizing: border-box; position: fixed; inset: auto; width: 160px; padding: 4px; margin: 0; border: 1px solid var(--border, #ddd); border-radius: 6px; background: var(--bg, white); color: var(--text, #222); box-shadow: 0 5px 20px #0003; }
  .menu button { display: block; width: 100%; padding: 7px 9px; border: 0; border-radius: 4px; background: transparent; text-align: left; }
  button:hover { background: var(--surface-hover, #eee); }
  button:disabled { opacity: .4; cursor: default; }
  .password { display: grid; gap: 6px; padding: 0 12px 12px; color: var(--text-soft, #666); }
  input { min-width: 0; padding: 7px; border: 1px solid var(--border, #ddd); border-radius: 4px; background: var(--bg, white); color: var(--text, #222); font: inherit; }
  .error { margin: 0; padding: 0 12px 12px; color: var(--danger, #b82222); }
</style>
