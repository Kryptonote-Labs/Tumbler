<script lang="ts">
  import { resolveChartColor, type ChartColor } from '@tumblerjs/charts';
  let { label, target, color, themeColors, disabled = false, unresolved = false, onchange }: { label: string; target: string; color: ChartColor; themeColors: Readonly<Record<string, string>>; disabled?: boolean; unresolved?: boolean; onchange: (color: ChartColor) => void } = $props();
  const id = $props.id();
  let root = $state<HTMLDivElement>();
  let open = $state(false), trigger = $state<HTMLButtonElement>();
  const names: Readonly<Record<string, string>> = { bg1: 'Background 1', tx1: 'Text 1', bg2: 'Background 2', tx2: 'Text 2', accent1: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3', accent4: 'Accent 4', accent5: 'Accent 5', accent6: 'Accent 6' };
  const colourName = $derived(label === 'Colour' ? 'Colour' : `${label} colour`);
  const css = $derived(resolveChartColor(color, { themeColors }) ?? '#000000');
  const hex = $derived(css.startsWith('#') ? css.slice(0, 7) : '#' + (css.match(/[\d.]+/g)?.slice(0, 3) ?? [0, 0, 0]).map(value => Math.round(Number(value)).toString(16).padStart(2, '0')).join(''));
  function pick(next: ChartColor) { onchange(next); open = false; trigger?.focus(); }
  function keydown(event: KeyboardEvent) { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); open = false; trigger?.focus(); } }
</script>
<svelte:window onpointerdown={(event) => { if (open && !root?.contains(event.target as Node)) open = false; }} />
<div bind:this={root} class="color-control" onfocusout={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) open = false; }}>
  <div class="row"><span>{label}</span><button bind:this={trigger} type="button" {disabled} aria-expanded={open} aria-haspopup="dialog" aria-controls={id} aria-label={`${colourName} for ${target}`} onkeydown={keydown} onclick={() => open = !open}><span class="swatch" style:background={css}></span><span class="value">{unresolved || !resolveChartColor(color, { themeColors }) ? 'Choose…' : color.kind === 'scheme' ? names[color.value] ?? color.value : hex.toUpperCase()}</span></button></div>
  {#if open}<div id={id} class="choices" role="dialog" tabindex="-1" aria-label={colourName} onkeydown={keydown}>
      <div class="themes">{#each Object.entries(names) as [value, name]}<button class="theme" type="button" {disabled} title={name} aria-label={name} aria-pressed={color.kind === 'scheme' && color.value === value} style:background={resolveChartColor({ kind: 'scheme', value }, { themeColors })} onclick={() => pick({ kind: 'scheme', value })}></button>{/each}</div>
      <label class="custom"><span>Custom…</span><input type="color" {disabled} aria-label={`Custom ${colourName.toLowerCase()} for ${target}`} value={hex} onchange={(event) => pick({ kind: 'rgb', value: event.currentTarget.value.toUpperCase() })} /></label>
    </div>{/if}
</div>
<style>
  .color-control { display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }
  button { box-sizing: border-box; display: flex; align-items: center; gap: 6px; width: 140px; height: 28px; padding: 0 8px; font: inherit; color: inherit; background: var(--tumbler-control-bg, var(--surface, #181818)); border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; cursor: pointer; }
  .swatch { flex: 0 0 16px; height: 16px; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); }
  .value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .choices { display: flex; flex-direction: column; gap: 6px; }
  .themes { display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; }
  button.theme { width: 100%; height: 22px; padding: 0; }
  button[aria-pressed=true] { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: -2px; }
  .custom { display: flex; align-items: center; justify-content: space-between; }
  input { width: 32px; height: 24px; padding: 0; border: 0; background: none; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
</style>
