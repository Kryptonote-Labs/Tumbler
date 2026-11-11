<script lang="ts">
  import { tick } from 'svelte';
  import { DRAWING_PATTERN_PRESETS, type DrawingPatternPreset } from '@tumblerjs/ooxml';
  import ChartPatternSwatch from './ChartPatternSwatch.svelte';
  import { chartPatternLabels } from './chart-pattern-labels.ts';
  let { id, value, foreground, background, disabled = false, onpreview, onpick, onclose }: {
    id: string; value?: string | undefined; foreground: string; background: string; disabled?: boolean;
    onpreview: (preset: DrawingPatternPreset | undefined) => void; onpick: (preset: DrawingPatternPreset) => void; onclose: () => void;
  } = $props();
  let list = $state<HTMLDivElement>();
  let typed = '', lastTyped = 0;
  let active = $state<string>();
  $effect(() => { const selected = value; active = selected; void tick().then(() => { if (selected) list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(); else list?.focus(); }); });
  function navigate(event: KeyboardEvent) {
    const options = [...list?.querySelectorAll<HTMLElement>('[role=option]') ?? []];
    const index = options.findIndex(option => option === document.activeElement);
    const move = (next: number) => { event.preventDefault(); options[Math.max(0, Math.min(options.length - 1, next))]?.focus(); };
    if (event.key === 'Enter' || event.key === ' ' && !(typed && Date.now() - lastTyped < 700)) { if (index >= 0) { event.preventDefault(); onpick(DRAWING_PATTERN_PRESETS[index]!); } }
    else if (event.key === 'ArrowRight') move(index + 1);
    else if (event.key === 'ArrowLeft') move(index - 1);
    else if (event.key === 'ArrowDown') move(index < 0 ? 0 : index + 6);
    else if (event.key === 'ArrowUp') move(index - 6);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(options.length - 1);
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onclose(); }
    else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const now = Date.now(); typed = (now - lastTyped < 700 ? typed : '') + event.key.toLowerCase(); lastTyped = now;
      const query = [...typed].every(character => character === typed[0]) ? typed[0]! : typed;
      const match = [...options.slice(index + 1), ...options.slice(0, index + 1)].find(option => option.getAttribute('aria-label')?.toLowerCase().startsWith(query));
      if (match) { event.preventDefault(); match.focus(); }
    }
  }
</script>
<div {id} bind:this={list} class="grid" role="listbox" aria-label="Pattern" tabindex={active ? -1 : 0} onkeydown={navigate} onpointerleave={() => onpreview(undefined)} onfocusout={(event) => { if (!list?.contains(event.relatedTarget as Node | null)) onpreview(undefined); }}>
  {#each DRAWING_PATTERN_PRESETS as preset}<button type="button" role="option" tabindex={preset === active ? 0 : -1} aria-label={chartPatternLabels[preset]} aria-selected={preset === value} title={chartPatternLabels[preset]} {disabled}
      onpointerenter={() => onpreview(preset)} onfocus={() => { active = preset; onpreview(preset); }} onclick={() => onpick(preset)}>
      <ChartPatternSwatch {preset} {foreground} {background} />
    </button>{/each}
</div>
<style>
  .grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
  button { aspect-ratio: 1; min-width: 0; padding: 3px; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; cursor: pointer; background: var(--tumbler-control-bg, var(--surface, #181818)); }
  button[aria-selected=true] { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: -2px; }
  button:focus-visible { box-shadow: inset 0 0 0 3px var(--tumbler-control-text, var(--text, #e2fee7)); }
  button:hover { border-color: var(--tumbler-control-accent, var(--accent, #4fe519)); }
</style>
