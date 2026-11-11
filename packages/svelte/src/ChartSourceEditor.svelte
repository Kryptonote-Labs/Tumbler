<script lang="ts">
  import { untrack } from 'svelte';
  import { inspectChartSource } from '@tumblerjs/charts';

  let { bytes, disabled = false, onchange }: {
    bytes: Uint8Array; disabled?: boolean; onchange: (bytes: Uint8Array) => void;
  } = $props();
  const source = $derived(new TextDecoder().decode(bytes));
  let base = $state(untrack(() => source));
  let draft = $state(untrack(() => base)), error = $state<string>();
  const dirty = $derived(draft !== base);
  const stale = $derived(source !== base);

  // Follow host edits until the user starts a draft; never overwrite an unsaved draft.
  $effect(() => { if (!dirty && stale) reload(); });
  function reload() { base = source; draft = source; error = undefined; }
  function apply() {
    if (disabled || !dirty || stale) return;
    try {
      const next = new TextEncoder().encode(draft);
      inspectChartSource(next);
      onchange(next);
      base = draft;
      error = undefined;
    } catch (cause) { error = cause instanceof Error ? cause.message : 'This source could not be applied.'; }
  }
</script>

<div class="source-editor">
  <textarea aria-label="Chart source XML" spellcheck="false" autocapitalize="off" {disabled} bind:value={draft}
    onkeydown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); apply(); } }}></textarea>
  {#if stale}<p role="status">The chart changed. Reload its source to continue.</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="actions">
    <button type="button" disabled={disabled || !dirty || stale} onclick={apply}>Apply</button>
    <button type="button" disabled={!dirty && !stale} onclick={reload}>{stale ? 'Reload' : 'Reset'}</button>
  </div>
</div>

<style>
  .source-editor { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  textarea { box-sizing: border-box; width: 100%; min-height: 240px; resize: vertical; padding: 8px; font: 11px/1.5 ui-monospace, monospace; tab-size: 2; white-space: pre; }
  textarea, button { color: inherit; background: var(--tumbler-control-bg, var(--surface, #181818)); border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  .actions { display: flex; gap: 6px; }
  button { min-height: 28px; padding: 3px 10px; font: inherit; cursor: pointer; }
  button:disabled { opacity: .4; cursor: default; }
  :is(textarea, button):focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
  p { margin: 0; font-size: 11px; }
  .error { color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); }
</style>
