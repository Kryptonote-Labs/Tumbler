<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { resolveChartColor } from '@tumblerjs/charts';
  import DrawingGradientPaint from './DrawingGradientPaint.svelte';
  import { chartGradientRamp, chartPercent, type ChartGradientStop } from './chart-gradient-ramp.ts';
  let { stops, keys, selected = $bindable(0), label, themeColors, disabled = false, onposition, onadd, onremove }: {
    stops: readonly ChartGradientStop[]; keys: readonly string[]; selected?: number; label: string; themeColors: Readonly<Record<string, string>>; disabled?: boolean;
    onposition: (index: number, position: number) => void; onadd: (position: number) => void; onremove: (index: number) => void;
  } = $props();
  const id = $props.id();
  let track = $state<HTMLDivElement>();
  const ramp = $derived(chartGradientRamp(stops, themeColors));
  const handles = $derived(stops.map((stop, index) => ({ ...stop, index, key: keys[index]! })));
  const ordered = $derived(handles.toSorted((a, b) => a.position - b.position));
  const ranks = $derived(new Map(ordered.map((item, rank) => [item.key, rank])));
  let drag: { pointer: number; index: number; start: number; offset: number; moved: boolean } | undefined;
  let frame: number | undefined, pending: { index: number; position: number } | undefined;
  onDestroy(() => { if (frame !== undefined) cancelAnimationFrame(frame); });
  export async function focusSelected() { await tick(); Array.from(track?.querySelectorAll<HTMLButtonElement>('[data-stop]') ?? []).find(button => button.dataset.stop === keys[selected])?.focus(); }
  function flush() { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; const next = pending; pending = undefined; if (next) onposition(next.index, next.position); }
  function move(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId || disabled) return;
    if (!drag.moved && Math.abs(event.clientX - drag.start) < 3) return;
    drag.moved = true;
    const rect = track?.getBoundingClientRect();
    if (!rect?.width) return;
    pending = { index: drag.index, position: Math.max(0, Math.min(1, (event.clientX - drag.offset - rect.left) / rect.width)) };
    if (frame === undefined) frame = requestAnimationFrame(() => { frame = undefined; flush(); });
  }
  function key(event: KeyboardEvent, index: number) {
    selected = index;
    const step = event.shiftKey ? .1 : .01, value = stops[index]?.position ?? 0;
    if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      onposition(index, event.key === 'Home' ? 0 : event.key === 'End' ? 1 : Math.max(0, Math.min(1, value + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -step : step))));
    } else if (['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; pending = undefined; drag = undefined; if (stops.length > 2) onremove(index);
    }
  }
</script>
<div bind:this={track} class="track">
  <button class="add-track" type="button" {disabled} aria-label={`Add gradient stop for ${label}`} onclick={(event) => { const rect = track?.getBoundingClientRect(); onadd(rect?.width && event.detail ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : .5); }}>
    <svg viewBox="0 0 240 20" preserveAspectRatio="none" aria-hidden="true"><defs><DrawingGradientPaint gradient={ramp} bounds={{ x: 0, y: 0, width: 240, height: 20 }} {id} /></defs><rect width="240" height="20" fill={`url(#${id})`} /></svg>
  </button>
  {#each handles as item (item.key)}
    {@const rank = ranks.get(item.key) ?? item.index}
    <button class="stop" class:selected={selected === item.index} data-stop={item.key} type="button" role="slider" tabindex={selected === item.index ? 0 : -1} {disabled} aria-label={`Gradient stop ${rank + 1} for ${label}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={chartPercent(item.position)} aria-valuetext={`${chartPercent(item.position)}%, ${item.color ? resolveChartColor(item.color, { themeColors }) ?? 'Choose a colour' : 'Choose a colour'}`} style:left={`${item.position * 100}%`} style:background={item.color ? resolveChartColor(item.color, { themeColors }) : 'transparent'} onclick={() => selected = item.index} onkeydown={(event) => key(event, item.index)}
      onpointerdown={(event) => { const rect = track?.getBoundingClientRect(); selected = item.index; drag = { pointer: event.pointerId, index: item.index, start: event.clientX, offset: event.clientX - (rect?.left ?? 0) - item.position * (rect?.width ?? 1), moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onpointermove={move} onpointerup={() => { flush(); drag = undefined; }} onpointercancel={() => { pending = undefined; if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; drag = undefined; }}></button>
  {/each}
</div>
<label class="row"><span>Stop</span><select {disabled} aria-label={`Selected gradient stop for ${label}`} value={selected} onchange={(event) => selected = Number(event.currentTarget.value)}>{#each ordered as item, rank (item.key)}<option value={item.index}>{rank + 1} · {chartPercent(item.position)}%</option>{/each}</select></label>
<style>
  .track { position: relative; height: 44px; margin: 4px 7px 0; }
  button, select { box-sizing: border-box; font: inherit; color: inherit; background: var(--tumbler-control-bg, var(--surface, #181818)); border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  button { cursor: pointer; } .row { display: flex; align-items: center; justify-content: space-between; min-height: 28px; gap: 8px; } select { width: 140px; height: 28px; min-width: 0; padding: 0 8px; }
  .add-track { display: block; width: 100%; height: 22px; padding: 0; background: repeating-conic-gradient(#666 0% 25%, #999 0% 50%) 0 0 / 8px 8px; }
  svg { display: block; width: 100%; height: 100%; }
  .stop { position: absolute; top: 22px; width: 14px; height: 18px; padding: 0; transform: translateX(-50%); border-width: 2px; touch-action: none; }
  .stop.selected { border-color: var(--tumbler-control-accent, var(--accent, #4fe519)); z-index: 1; }
  button:disabled, select:disabled { opacity: .4; cursor: default; }
  button:focus-visible, select:focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
</style>
