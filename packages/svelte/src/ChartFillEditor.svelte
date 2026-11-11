<script lang="ts">
  import { onDestroy, untrack, type Snippet } from 'svelte';
  import { clearChartFill, readChartFill, resolveChartColor, setChartNoFill, setChartPatternFill, type ChartColor, type ChartContent, type ChartPropertyNode } from '@tumblerjs/charts';
  import type { DrawingPatternPreset } from '@tumblerjs/ooxml';
  import ChartPatternGrid from './ChartPatternGrid.svelte';
  import ChartPatternSwatch from './ChartPatternSwatch.svelte';
  import ChartFillColor from './ChartFillColor.svelte';
  import ChartPictureEditor from './ChartPictureEditor.svelte';
  import { chartPatternLabels } from './chart-pattern-labels.ts';
  let { content, target, label, themeColors = {}, disabled = false, preview, onpreview, onchange }: {
    content: ChartContent; target: ChartPropertyNode; label: string; themeColors?: Readonly<Record<string, string>>; disabled?: boolean;
    preview?: Snippet | undefined; onpreview?: ((bytes: Uint8Array | undefined) => void) | undefined; onchange: (content: ChartContent) => void;
  } = $props();
  const id = $props.id();
  const bytes = $derived(new TextEncoder().encode(content.xml));
  const fill = $derived.by(() => { try { return readChartFill(bytes, target.id); } catch { return undefined; } });
  const capable = $derived(fill?.capable && !['catAx', 'valAx', 'dateAx', 'serAx', 'majorGridlines', 'minorGridlines'].includes(target.name.split(':').at(-1) ?? ''));
  const foreground = $derived(fill ? resolveChartColor(fill.foreground, { themeColors }) ?? '#000000' : '#000000');
  const background = $derived(fill ? resolveChartColor(fill.background, { themeColors }) ?? '#ffffff' : '#ffffff');
  const value = $derived(fill?.pattern ? chartPatternLabels[fill.pattern.preset as DrawingPatternPreset] ?? fill.pattern.preset : ({ automatic: 'Automatic', none: 'No fill', solid: 'Solid', gradient: 'Gradient', picture: 'Picture', group: 'Group fill', pattern: 'Pattern' }[fill?.kind ?? 'automatic']));
  let root = $state<HTMLDivElement>(), popup = $state<HTMLDivElement>();
  let open = $state(false), trigger = $state<HTMLButtonElement>(), error = $state<string>();
  $effect(() => { void target.id; void disabled; open = false; error = undefined; untrack(() => onpreview?.(undefined)); });
  $effect(() => { void content.xml; error = undefined; untrack(() => onpreview?.(undefined)); });
  onDestroy(() => onpreview?.(undefined));
  function close(restore = true) { open = false; onpreview?.(undefined); if (restore) trigger?.focus(); }
  function change(next: Uint8Array) {
    try {
      const xml = new TextDecoder().decode(next);
      if (xml !== content.xml) onchange({ ...content, xml });
      error = undefined; close();
    } catch (cause) { error = cause instanceof Error ? cause.message : 'The fill could not be changed.'; }
  }
  function choose(preset: DrawingPatternPreset) {
    try { change(setChartPatternFill(bytes, target.id, { preset })); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'The pattern could not be applied.'; }
  }
  function previewPattern(preset: DrawingPatternPreset | undefined) {
    if (!preset) { onpreview?.(undefined); return; }
    try { onpreview?.(setChartPatternFill(bytes, target.id, { preset })); }
    catch { onpreview?.(undefined); }
  }
  function color(which: 'foreground' | 'background', value: ChartColor) {
    if (!fill?.pattern) return;
    try { change(setChartPatternFill(bytes, target.id, { preset: fill.pattern.preset as DrawingPatternPreset, [which]: value })); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'The colour could not be changed.'; }
  }
  function automatic() { try { change(clearChartFill(bytes, target.id)); } catch (cause) { error = cause instanceof Error ? cause.message : 'The fill could not be cleared.'; } }
  function none() { try { change(setChartNoFill(bytes, target.id)); } catch (cause) { error = cause instanceof Error ? cause.message : 'The fill could not be changed.'; } }
</script>

<svelte:window onpointerdown={(event) => { if (open && !root?.contains(event.target as Node)) close(false); }} />

{#if fill && capable}
  <div bind:this={root} class="fill-editor" onfocusout={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close(false); }}>
    <div class="row"><span>Fill</span><div class="actions">
        <button bind:this={trigger} type="button" class="trigger" {disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-fill`} aria-label={`Fill for ${label}: ${fill.kind === 'pattern' ? 'Pattern, ' : ''}${value}`} title={value} onclick={() => { if (open) close(); else open = true; }}>
          {#if fill.pattern}<span class="swatch"><ChartPatternSwatch preset={fill.pattern.preset} {foreground} {background} /></span>{:else if fill.kind === 'solid'}<span class="swatch" style:background={foreground}></span>{/if}<span class="value">{value}</span>
        </button>
        {#if fill.kind !== 'automatic'}<button type="button" class="remove" {disabled} aria-label={`Reset fill to automatic for ${label}`} title="Reset to automatic" onclick={automatic}>×</button>{/if}
      </div></div>
    {#if fill.pattern}
      <ChartFillColor label="Foreground" target={label} color={fill.foreground} {themeColors} {disabled} onchange={(value) => color('foreground', value)} />
      <ChartFillColor label="Background" target={label} color={fill.background} {themeColors} {disabled} onchange={(value) => color('background', value)} />
    {/if}
    <div bind:this={popup} id={`${id}-fill`} class="popup" hidden={!open} role="dialog" aria-label={`Fill for ${label}`} tabindex="-1"
      onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}
      onfocusout={(event) => { if (event.relatedTarget && !popup?.contains(event.relatedTarget as Node)) close(false); }}>
      {#if open}
        {#if preview}<div class="preview">{@render preview()}</div>{/if}
        <ChartPatternGrid id={`${id}-patterns`} value={fill.pattern?.preset} {foreground} {background} {disabled} onpreview={previewPattern} onpick={choose} onclose={() => close()} />
        <div class="choices"><button type="button" {disabled} aria-pressed={fill.kind === 'automatic'} onclick={automatic}>Automatic</button><button type="button" {disabled} aria-pressed={fill.kind === 'none'} onclick={none}>No fill</button></div>{/if}
        <ChartPictureEditor {content} {target} {label} {disabled} mode="action" onchange={(next) => { onchange(next); close(); }} />
      </div>
    {#if error}<p role="alert">{error}</p>{/if}
  </div>
{/if}

<style>
  .fill-editor { display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }
  .actions { display: flex; gap: 6px; width: 140px; }
  button { box-sizing: border-box; min-width: 0; height: 28px; padding: 0 8px; font: inherit; color: inherit; background: var(--tumbler-control-bg, var(--surface, #181818)); border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; cursor: pointer; }
  .trigger { display: flex; align-items: center; gap: 6px; flex: 1; }
  .value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .swatch { flex: 0 0 16px; height: 16px; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); }
  .remove { flex: 0 0 28px; padding: 0; font-size: 16px; }
  .popup { display: flex; flex-direction: column; gap: 8px; padding: 6px; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  .popup[hidden] { display: none; }
  .preview { height: 160px; overflow: hidden; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); }
  .preview :global(svg) { display: block; width: 100%; height: 100%; }
  .choices { display: flex; gap: 6px; }.choices button { flex: 1; }
  button:hover:enabled { background: var(--tumbler-control-hover, var(--surface-hover, #252825)); }
  button:disabled { opacity: .4; cursor: default; }
  button:focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
  p { margin: 0; font-size: 11px; color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); }
</style>
