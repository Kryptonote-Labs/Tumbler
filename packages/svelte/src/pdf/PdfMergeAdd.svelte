<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  let { onfiles, sourcePicker, disabled = false }: { onfiles: (files: File[]) => void; sourcePicker?: Snippet<[upload: () => void, close: () => void]>; disabled?: boolean } = $props();
  const id = $props.id();
  let input: HTMLInputElement, trigger: HTMLButtonElement;
  let popup = $state<HTMLDivElement>();
  let open = $state(false), over = $state(false), left = $state(0), top = $state(0);
  function close() { popup?.hidePopover(); open = false; trigger?.focus({ preventScroll: true }); }
  function upload() { close(); input.click(); }
  async function show() {
    if (!sourcePicker) { input.click(); return; }
    open = true;
    await tick();
    const panel = popup;
    if (!panel) return;
    panel.showPopover();
    const rect = trigger.getBoundingClientRect();
    left = Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8));
    top = Math.max(8, Math.min(rect.top + 40, window.innerHeight - panel.offsetHeight - 8));
    panel.querySelector<HTMLInputElement>('input')?.focus();
  }
</script>
<div class="add" class:over>
  <button bind:this={trigger} class="drop-zone" disabled={disabled} aria-label="Add PDFs" aria-expanded={open} aria-controls={open ? id : undefined} onclick={show}
    ondragover={event => { if (!disabled && event.dataTransfer?.types.includes('Files')) { event.preventDefault(); over = true; } }}
    ondragleave={() => over = false}
    ondrop={event => { if (disabled || !event.dataTransfer?.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); over = false; onfiles(Array.from(event.dataTransfer.files)); }}>
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
    {over ? 'Drop PDFs here' : 'Add PDFs'}
  </button>
  <input bind:this={input} class="file" aria-label="Upload PDFs" type="file" multiple accept=".pdf,application/pdf" tabindex="-1" disabled={disabled} onchange={event => { onfiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ''; }} />
  {#if open}
    <div {id} bind:this={popup} class="popup" popover="auto" style:left={`${left}px`} style:top={`${top}px`} ontoggle={event => { if (event.newState === 'closed') open = false; }}>
      {@render sourcePicker?.(upload, close)}
    </div>
  {/if}
</div>
<style>
  .add { position: relative; display: flex; flex: 1; min-height: 96px; padding: 12px; }
  .drop-zone { display: flex; flex: 1; align-items: center; justify-content: center; gap: 8px; min-height: 72px; padding: 12px; border: 1px dashed var(--border, #aaa); border-radius: 6px; background: transparent; color: var(--text-soft, #666); font: inherit; cursor: pointer; }
  .drop-zone:hover, .over .drop-zone { color: var(--text, #222); border-color: var(--text-soft, #666); background: var(--surface-hover, #eee); }
  .drop-zone:disabled { opacity: .4; cursor: default; }
  svg { fill: none; stroke: currentColor; stroke-width: 1.3; }
  .file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .popup { position: fixed; inset: auto; width: min(310px, calc(100vw - 24px)); max-height: min(380px, calc(100dvh - 24px)); overflow: auto; margin: 0; padding: 6px; border: 1px solid var(--border, #ddd); border-radius: 6px; background: var(--bg, white); color: var(--text, #222); box-shadow: 0 8px 24px #0004; }
</style>
