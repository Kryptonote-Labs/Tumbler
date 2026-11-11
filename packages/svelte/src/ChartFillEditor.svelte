<script lang="ts">
  import { onDestroy, tick, untrack, type Snippet } from 'svelte';
  import { chartColorOpacity, readChartGradientFill, setChartSolidFill, clearChartFill, readChartFill, resolveChartColor, setChartNoFill, setChartPatternFill, type ChartColor, type ChartContent, type ChartPropertyNode } from '@tumblerjs/charts';
  import type { DrawingPatternPreset } from '@tumblerjs/ooxml';
  import DrawingGradientPaint from './DrawingGradientPaint.svelte';
  import { chartGradientRamp } from './chart-gradient-ramp.ts';
  import ChartGradientEditor from './ChartGradientEditor.svelte';
  import ChartPatternGrid from './ChartPatternGrid.svelte';
  import ChartPatternSwatch from './ChartPatternSwatch.svelte';
  import ChartFillColor from './ChartFillColor.svelte';
  import ChartPictureEditor from './ChartPictureEditor.svelte';
  import { chartPatternLabels } from './chart-pattern-labels.ts';
  let { content, target, label, targetKey = label, themeColors = {}, disabled = false, preview, onpreview, onchange }: {
    content: ChartContent; target: ChartPropertyNode; label: string; targetKey?: string; themeColors?: Readonly<Record<string, string>>; disabled?: boolean;
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
  let gradientOpen = $state(false), gradientPreview = $state<Uint8Array>();
  const activeKind = $derived(gradientOpen ? 'gradient' : fill?.kind);
  const ramp = $derived.by(() => {
    try { const stops = readChartGradientFill(bytes, target.id)?.stops ?? [{ node: 0, position: 0, color: fill?.solidSeed, opacity: 1 }, { node: 1, position: 1, color: { kind: 'scheme' as const, value: 'bg1' }, opacity: 1 }]; return chartGradientRamp(stops, themeColors); }
    catch { return chartGradientRamp([], themeColors); }
  });
  let mode = $state<'choices' | 'pattern'>('choices');
  let open = $state(false), trigger = $state<HTMLButtonElement>(), error = $state<string>();
  $effect(() => { void targetKey; void disabled; open = false; gradientOpen = false; error = undefined; untrack(() => onpreview?.(undefined)); });
  $effect(() => { void content.xml; error = undefined; untrack(() => onpreview?.(undefined)); });
  onDestroy(() => onpreview?.(undefined));
  function close(restore = true) { const wasOpen = open; open = false; if (wasOpen) onpreview?.(gradientOpen ? gradientPreview : undefined); if (restore) trigger?.focus(); }
  function change(next: Uint8Array, restore = open) {
    try {
      const xml = new TextDecoder().decode(next);
      if (xml !== content.xml) onchange({ ...content, xml });
      error = undefined; gradientOpen = false; close(restore);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'The fill could not be changed.'; }
  }
  function choose(preset: DrawingPatternPreset) {
    try { change(setChartPatternFill(bytes, target.id, { preset })); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'The pattern could not be applied.'; }
  }
  function previewPattern(preset: DrawingPatternPreset | undefined) {
    if (!preset) { onpreview?.(gradientOpen ? gradientPreview : undefined); return; }
    try { onpreview?.(setChartPatternFill(bytes, target.id, { preset })); }
    catch { onpreview?.(gradientOpen ? gradientPreview : undefined); }
  }
  function color(which: 'foreground' | 'background', value: ChartColor) {
    if (!fill?.pattern) return;
    try { change(setChartPatternFill(bytes, target.id, { preset: fill.pattern.preset as DrawingPatternPreset, [which]: value })); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'The colour could not be changed.'; }
  }
  function solid(color?: ChartColor, opacity?: number) { try { change(setChartSolidFill(bytes, target.id, { color, opacity })); } catch (cause) { error = cause instanceof Error ? cause.message : 'The fill could not be changed.'; } }
  function gradient() { if (disabled) return; close(false); gradientOpen = true; void tick().then(() => root?.querySelector<HTMLSelectElement>('.gradient-editor select')?.focus()); }
  function automatic() { try { change(clearChartFill(bytes, target.id), true); } catch (cause) { error = cause instanceof Error ? cause.message : 'The fill could not be cleared.'; } }
  function none() { try { change(setChartNoFill(bytes, target.id)); } catch (cause) { error = cause instanceof Error ? cause.message : 'The fill could not be changed.'; } }
</script>

<svelte:window onpointerdown={(event) => { if (open && !root?.contains(event.target as Node)) close(false); }} />

{#if fill && capable}
  <div bind:this={root} class="fill-editor" onfocusout={(event) => { if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close(false); }}>
    <div class="row"><span>Fill</span><div class="actions">
        <button bind:this={trigger} type="button" class="trigger" {disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-fill`} aria-label={`Fill for ${label}: ${activeKind === 'gradient' ? 'Gradient' : `${fill.kind === 'pattern' ? 'Pattern, ' : ''}${value}`}`} title={value} onclick={() => { if (open) close(); else { mode = activeKind === 'pattern' ? 'pattern' : 'choices'; open = true; } }}>
          {#if activeKind === 'gradient'}<span class="swatch"><svg viewBox="0 0 16 16" aria-hidden="true"><defs><DrawingGradientPaint gradient={ramp} bounds={{ x: 0, y: 0, width: 16, height: 16 }} id={`${id}-swatch`} /></defs><rect width="16" height="16" fill={`url(#${id}-swatch)`}/></svg></span>{:else if fill.pattern}<span class="swatch"><ChartPatternSwatch preset={fill.pattern.preset} {foreground} {background} /></span>{:else if fill.kind === 'solid'}<span class="swatch" style:background={foreground}></span>{/if}<span class="value">{activeKind === 'gradient' ? 'Gradient' : value}</span>
        </button>
        {#if fill.kind !== 'automatic'}<button type="button" class="remove" {disabled} aria-label={`Reset fill to automatic for ${label}`} title="Reset to automatic" onclick={automatic}>×</button>{/if}
      </div></div>
    {#if !gradientOpen && fill.kind === 'solid'}
      <ChartFillColor label="Colour" target={label} color={fill.foreground} {themeColors} {disabled} onchange={(color) => solid(color)} />
      <label class="row"><span>Opacity</span><input type="number" {disabled} min="0" max="100" step="1" aria-label={`Solid fill opacity for ${label}`} value={Math.round(chartColorOpacity(fill.foreground) * 10000) / 100} onchange={(event) => { if (event.currentTarget.value !== '' && event.currentTarget.validity.valid) solid(undefined, event.currentTarget.valueAsNumber / 100); }} /></label>
    {:else if !gradientOpen && fill.pattern}
      <ChartFillColor label="Foreground" target={label} color={fill.foreground} {themeColors} {disabled} onchange={(value) => color('foreground', value)} />
      <ChartFillColor label="Background" target={label} color={fill.background} {themeColors} {disabled} onchange={(value) => color('background', value)} />
    {/if}
    {#if fill.kind === 'gradient' || gradientOpen}<ChartGradientEditor {content} {target} {targetKey} {label} {themeColors} {disabled} {preview} onpreview={(source) => { gradientPreview = source; onpreview?.(source); }} {onchange} bind:open={gradientOpen} showTrigger={fill.kind === 'gradient'} onclose={() => trigger?.focus()} />{/if}
    <div bind:this={popup} id={`${id}-fill`} class="popup" hidden={!open} role="dialog" aria-label={`Fill for ${label}`} tabindex="-1"
      onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}
      onfocusout={(event) => { if (event.relatedTarget && !popup?.contains(event.relatedTarget as Node)) close(false); }}>
      {#if open}
        {#if preview}<div class="preview">{@render preview()}</div>{/if}
        <div class="choices" role="group" aria-label={`Fill type for ${label}`}>
          <button type="button" {disabled} aria-pressed={activeKind === 'automatic'} onclick={automatic}>Automatic</button><button type="button" {disabled} aria-pressed={activeKind === 'none'} onclick={none}>No fill</button>
          <button type="button" {disabled} aria-pressed={activeKind === 'solid'} onclick={() => solid()}>Solid</button><button type="button" {disabled} aria-pressed={activeKind === 'gradient'} onclick={gradient}>Gradient</button>
          <button type="button" {disabled} aria-pressed={activeKind === 'pattern'} aria-expanded={mode === 'pattern'} onclick={() => mode = 'pattern'}>Pattern</button>
        </div>
        {#if mode === 'pattern'}<ChartPatternGrid id={`${id}-patterns`} value={fill.pattern?.preset} {foreground} {background} {disabled} onpreview={previewPattern} onpick={choose} onclose={() => close()} />{/if}
      {/if}
        <ChartPictureEditor {content} {target} {label} {disabled} mode="action" onerror={() => open = true} onchange={(next) => { onchange(next); gradientOpen = false; gradientPreview = undefined; close(); }} />
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
  .swatch svg { display: block; width: 100%; height: 100%; }
  .remove { flex: 0 0 28px; padding: 0; font-size: 16px; }
  .popup { display: flex; flex-direction: column; gap: 8px; padding: 6px; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  .popup[hidden] { display: none; }
  .preview { height: 160px; overflow: hidden; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); }
  .preview :global(svg) { display: block; width: 100%; height: 100%; }
  .choices { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .choices button[aria-pressed=true] { border-color: var(--tumbler-control-accent, var(--accent, #4fe519)); }
  input { box-sizing: border-box; width: 140px; height: 28px; padding: 0 2px 0 8px; font: inherit; color: inherit; background: var(--tumbler-control-bg, var(--surface, #181818)); border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  button:hover:enabled { background: var(--tumbler-control-hover, var(--surface-hover, #252825)); }
  button:disabled { opacity: .4; cursor: default; }
  button:focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
  p { margin: 0; font-size: 11px; color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); }
</style>
