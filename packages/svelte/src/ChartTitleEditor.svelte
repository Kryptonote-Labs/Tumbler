<script lang="ts">
  import { untrack } from 'svelte';
  import { chartFont, chartFontShorthand, type ChartModel } from '@tumblerjs/charts';
  let { model, oncommit, oncancel }: { model: ChartModel; oncommit: (title: string) => void; oncancel: () => void } = $props();
  let value = $state(untrack(() => model.title ?? ''));
  let finished = false;
  const font = $derived(chartFont('title', model.titleStyle, model));
  function focus(input: HTMLInputElement) { input.focus(); input.select(); }
  function commit() { if (finished) return; finished = true; oncommit(value); }
</script>

<input aria-label="Chart title" bind:value use:focus style={`font:${chartFontShorthand(font)};color:${font.color};height:${font.size * 1.5}px`} onblur={commit}
  onpointerdown={(event) => event.stopPropagation()}
  onkeydown={(event) => {
    event.stopPropagation();
    if (event.isComposing) return;
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
    if (event.key === 'Escape') { event.preventDefault(); finished = true; oncancel(); }
  }} />

<style>
  input { position:absolute;left:8px;right:8px;top:4px;width:calc(100% - 16px);box-sizing:border-box;padding:0;text-align:center;background:white;border:1px solid currentColor;outline:none;z-index:2; }
</style>
